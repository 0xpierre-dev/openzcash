"""Add an approved issue to the website library; never publish or rewrite its PDF."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

from pypdf import PdfReader
from validate_issue import validate

KIT = Path(__file__).resolve().parent
REPO = KIT.parent.parent
CONTRACT = json.loads((KIT / "publication-contract.json").read_text())


def version(value):
    return tuple(int(n) for n in re.findall(r"\d+", str(value)))


def prepare(root: Path, legacy: bool):
    issue = json.loads((root / "report-content.json").read_text())
    evidence = json.loads((root / "evidence-snapshot.json").read_text())
    edition = issue["edition"]
    month = dt.date.fromisoformat(edition["month"] + "-01")
    filename = edition.get("filename", f"OpenZcash-Monthly-{month:%B-%Y}.pdf")
    if Path(filename).name != filename or not filename.endswith(".pdf"):
        raise ValueError("The approved PDF must be a filename inside the issue directory.")
    source = root / filename
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if legacy:
        if CONTRACT["legacyReferences"].get(edition["month"]) != digest:
            raise ValueError("Only the explicitly approved historical reference may bypass the current design contract.")
    else:
        production = json.loads((root / "production-record.json").read_text())
        if production.get("pdfVerification", {}).get("sha256") != digest:
            raise ValueError("The PDF does not match its reviewed production record.")
        if version(issue.get("design", {}).get("version", "0")) < version(CONTRACT["minimumDesignVersion"]):
            raise ValueError("This issue predates the approved monthly design.")
        wallet = issue["pages"][CONTRACT["walletSlide"] - 1]
        if wallet.get("walletLayout") != CONTRACT["walletLayout"] or [c["title"] for c in wallet.get("cards", [])] != CONTRACT["walletRoster"]:
            raise ValueError("Slide 7 must retain the approved four-wallet grid.")

    review = validate(issue, evidence, root, final=True)
    # The single pinned historical PDF was approved with the previous renderer.
    # Its immutable bytes, source data and page review still have to match.
    errors = [e for e in review["errors"] if not (legacy and e["code"] == "review.renderer")]
    if errors:
        raise ValueError("Monthly quality gates failed: " + json.dumps(errors))

    pdf = PdfReader(source)
    if len(pdf.pages) != len(issue["pages"]):
        raise ValueError("The PDF and reviewed page register have different lengths.")
    ids = {page.indirect_reference.idnum: i for i, page in enumerate(pdf.pages)}
    pages = []
    for i, page in enumerate(pdf.pages):
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        if (w, h) != (CONTRACT["pageWidth"], CONTRACT["pageHeight"]) or page.get("/Rotate", 0) % 360:
            raise ValueError(f"Page {i + 1} violates the fixed landscape format.")
        copy = page.extract_text()
        if not copy.strip():
            raise ValueError(f"Page {i + 1} has no accessible text.")
        links = []
        for ref in page.get("/Annots", []):
            annotation = ref.get_object()
            rect = [float(v) for v in annotation["/Rect"]]
            item = dict(x=rect[0] / w, y=(h - rect[3]) / h, w=(rect[2] - rect[0]) / w, h=(rect[3] - rect[1]) / h)
            uri = str(annotation.get("/A", {}).get("/URI", ""))
            if uri:
                parsed = urlsplit(uri)
                if parsed.scheme not in ("https", "http") or not parsed.netloc:
                    raise ValueError(f"Unsupported source link on page {i + 1}.")
                item.update(url=uri, label=f"Open source: {parsed.hostname}")
            elif "/Dest" in annotation:
                target = ids[annotation["/Dest"][0].idnum]
                item.update(page=target + 1, label=f"Go to {issue['pages'][target]['section']}")
            else:
                continue
            links.append(item)
        authored = issue["pages"][i]
        pages.append(dict(number=i + 1, title=authored["title"].replace("\n", " "), section=authored["section"], text=copy, links=links))

    period = edition.get("mode") == "period"
    start, end = edition["windowStart"], edition["cutoff"]
    identifier = f"{start}-to-{end[8:]}" if period else edition["month"]
    label = f"{dt.date.fromisoformat(start):%b} {int(start[8:])}–{int(end[8:])}" if period else f"{dt.date.fromisoformat(edition['financialMonth'] + '-01'):%B} close"
    base = f"/monthly/editions/{identifier}/{digest[:12]}"
    entry = dict(
        id=identifier, month=edition["month"], label=label,
        kind="reference" if legacy else "period" if period else "monthly",
        periodStart=start, periodEnd=end, financialMonth=edition["financialMonth"],
        designVersion=edition.get("revision", ""),
        pdf=f"{base}/{filename}", cover=f"{base}/cover.jpg", manifest=f"{base}/pages.json",
        assetBase=base, sha256=digest, bytes=source.stat().st_size,
        pageCount=len(pages), pageWidth=CONTRACT["pageWidth"], pageHeight=CONTRACT["pageHeight"],
    )
    return entry, pages, source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue-dir", type=Path, required=True)
    parser.add_argument("--legacy-reference", action="store_true")
    parser.add_argument("--replace", action="store_true", help="Replace this catalog entry with an approved revision; old assets remain available.")
    args = parser.parse_args()
    entry, pages, source = prepare(args.issue_dir.resolve(), args.legacy_reference)
    catalog = REPO / "src/lib/monthly/editions.json"
    existing = json.loads(catalog.read_text()) if catalog.exists() else []
    previous = next((e for e in existing if e["id"] == entry["id"]), None)
    if previous and previous["sha256"] != entry["sha256"] and not args.replace:
        raise ValueError("Edition already exists. Review the revision and use --replace explicitly.")
    if entry["kind"] == "monthly" and any(e["kind"] == "monthly" and e["month"] == entry["month"] and e["id"] != entry["id"] for e in existing):
        raise ValueError("There is already a monthly issue for this month.")
    poppler = shutil.which("pdftoppm")
    if not poppler:
        raise ValueError("pdftoppm is required to derive thumbnails from the approved PDF.")
    target = REPO / "public" / entry["assetBase"].lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".import-", dir=target.parent) as temporary:
        stage = Path(temporary)
        shutil.copy2(source, stage / source.name)
        subprocess.run([poppler, "-scale-to", "360", "-jpeg", "-jpegopt", "quality=82", str(source), str(stage / "thumb")], check=True, capture_output=True)
        for i, thumbnail in enumerate(sorted(stage.glob("thumb-*.jpg")), 1):
            thumbnail.rename(stage / f"page-{i:03}.jpg")
        if len(list(stage.glob("page-*.jpg"))) != len(pages):
            raise ValueError("Thumbnail export is incomplete.")
        subprocess.run([poppler, "-f", "1", "-l", "1", "-singlefile", "-scale-to", "800", "-jpeg", "-jpegopt", "quality=90", str(source), str(stage / "cover")], check=True, capture_output=True)
        (stage / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, separators=(",", ":")) + "\n")
        # Catalog replacement is last, so readers never see half an import.
        if not target.exists():
            stage.rename(target)
        else:
            if any(not (target / f.name).exists() or (target / f.name).read_bytes() != f.read_bytes() for f in stage.iterdir()):
                raise ValueError("Immutable edition assets differ. Investigate before replacing them.")
    updated = [e for e in existing if e["id"] != entry["id"]] + [entry]
    updated.sort(key=lambda e: (e["month"], {"monthly": 2, "period": 1, "reference": 0}[e["kind"]], e["periodEnd"]), reverse=True)
    catalog.parent.mkdir(parents=True, exist_ok=True)
    pending = catalog.with_suffix(".json.tmp")
    pending.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
    pending.replace(catalog)
    print(f"Ready for local preview: /monthly/{entry['id']} · {entry['pageCount']} pages · {entry['sha256'][:12]}")


if __name__ == "__main__":
    main()
