"""Import two reviewed PDFs and their source registers; preserve prior immutable assets."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

from pypdf import PdfReader

REPO = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_file(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"Missing local input: {name}")
    return path


def public_url(value):
    url = urlsplit(value)
    return (url.scheme == "https" and bool(url.hostname) and not url.username and not url.password
            and url.hostname not in ("localhost", "127.0.0.1", "::1")
            and "/monthly-preview" not in url.path)


def prepare(root):
    source = root / "reading-set.json"
    data = json.loads(source.read_text())
    review = json.loads((root / "review.json").read_text())
    if review.get("inputSha256") != digest(source) or review.get("status") != "approved":
        raise ValueError("The current reading set needs a matching completed review.")
    if not all(review.get("checks", {}).get(key) is True for key in
               ("sourceReconciliation", "visualReview", "publicLinks")):
        raise ValueError("Source, visual and link reviews are required.")
    if not re.fullmatch(r"\d{4}-\d{2}(?:-\d{2}-to-\d{2})?", data["id"]):
        raise ValueError("Invalid edition ID.")
    if set(data["documents"]) != {"monthly", "operations"}:
        raise ValueError("Import Monthly and Operations together.")
    for register in ("sources", "communities", "requests", "zcg"):
        if not isinstance(data[register], list) or (register == "sources" and not data[register]):
            raise ValueError(f"Missing {register} register.")
        if any(not public_url(row["url"]) for row in data[register]):
            raise ValueError(f"Non-public URL in {register}.")
    prepared = []
    monthly = data["documents"]["monthly"]
    for kind, doc in data["documents"].items():
        pdf = local_file(root, doc["pdf"])
        manifest = local_file(root, doc["manifest"])
        pages = json.loads(manifest.read_text())
        actual = PdfReader(pdf)
        signed = review["documents"][kind]
        if signed.get("sha256") != digest(pdf) or signed.get("manifestSha256") != digest(manifest):
            raise ValueError(f"{kind}: PDF or page register changed after review.")
        if signed.get("reviewedPages") != list(range(1, len(pages) + 1)):
            raise ValueError(f"{kind}: every page needs review.")
        if not len(pages) == len(actual.pages) == doc["pageCount"] or not pages:
            raise ValueError(f"{kind}: incomplete pages.")
        if doc["id"] != data["id"] or doc["periodEnd"] != data["evidenceCutoff"]:
            raise ValueError(f"{kind}: issue/cutoff mismatch.")
        for key in ("month", "periodStart", "financialMonth"):
            if doc[key] != monthly[key]:
                raise ValueError(f"{kind}: inconsistent {key}.")
        for i, (page, entry) in enumerate(zip(actual.pages, pages), 1):
            if (float(page.mediabox.width), float(page.mediabox.height)) != (1200, 675) or page.get("/Rotate", 0) % 360:
                raise ValueError(f"{kind}/{i}: incorrect page geometry.")
            if entry["number"] != i or not entry["text"].strip() or not page.extract_text().strip():
                raise ValueError(f"{kind}/{i}: missing text or page identity.")
            urls = [str(ref.get_object().get("/A", {}).get("/URI", "")) for ref in page.get("/Annots", [])]
            urls += [link["url"] for link in entry["links"] if "url" in link]
            if any(not public_url(url) for url in urls if url):
                raise ValueError(f"{kind}/{i}: non-public link.")
        if kind == "monthly":
            target = f"https://openzcash.org/monthly/{data['id']}?publication=operations#1"
            if len(pages) != 10 or "wallet" not in pages[5]["title"].lower() or "products" not in pages[8]["title"].lower():
                raise ValueError("The fixed Monthly order changed.")
            if not any(link.get("url") == target for link in pages[9]["links"]):
                raise ValueError("Monthly must open the same Operations issue.")
        sha = digest(pdf)
        base = f"/monthly/editions/{data['id']}/{sha[:12]}"
        doc.update(pdf=f"{base}/{pdf.name}", manifest=f"{base}/pages.json", cover=f"{base}/cover.jpg",
                   assetBase=base, sha256=sha, bytes=pdf.stat().st_size, pageWidth=1200, pageHeight=675)
        prepared.append((doc, pdf, pages))
    return data, prepared


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    data, prepared = prepare(args.source_dir.resolve())
    catalog = REPO / "src/lib/monthly/reading-sets.json"
    existing = json.loads(catalog.read_text()) if catalog.exists() else []
    prior = next((item for item in existing if item["id"] == data["id"]), None)
    if prior and prior != data and not args.replace:
        raise ValueError("This edition exists; an approved correction requires --replace.")
    for doc, pdf, pages in prepared:
        target = REPO / "public" / doc["assetBase"].lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".reading-set-", dir=target.parent) as temporary:
            stage = Path(temporary)
            shutil.copyfile(pdf, stage / pdf.name)
            subprocess.run(["pdftoppm", "-scale-to", "360", "-jpeg", "-jpegopt", "quality=86", str(pdf), str(stage / "thumb")], check=True, capture_output=True)
            for i, thumb in enumerate(sorted(stage.glob("thumb-*.jpg")), 1):
                thumb.rename(stage / f"page-{i:03}.jpg")
            if len(list(stage.glob("page-*.jpg"))) != len(pages):
                raise ValueError("Missing page thumbnails.")
            subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to", "800", "-jpeg", "-jpegopt", "quality=90", str(pdf), str(stage / "cover")], check=True, capture_output=True)
            (stage / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, separators=(",", ":")) + "\n")
            if target.exists():
                if any(not (target / f.name).is_file() or digest(target / f.name) != digest(f) for f in stage.iterdir()):
                    raise ValueError("Immutable asset collision; keep the live edition unchanged.")
            else:
                stage.rename(target)
    # The single catalog changes only after both complete asset directories exist.
    updated = [item for item in existing if item["id"] != data["id"]] + [data]
    updated.sort(key=lambda item: (item["documents"]["monthly"]["month"], item["evidenceCutoff"]), reverse=True)
    pending = catalog.with_suffix(".json.tmp")
    pending.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
    pending.replace(catalog)
    print(json.dumps({"id": data["id"], "documents": {key: value["sha256"] for key, value in data["documents"].items()}}))


if __name__ == "__main__":
    main()
