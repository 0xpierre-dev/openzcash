"""Refresh the external public corpus Zarvis cites without a web search: ECC and ZF blog posts, curated ZecHub wiki pages and the first post of active forum topics.
Standard library only, like sync-zarvis-references.py. Run on a maintainer machine (npm run knowledge:sync); deployment reads the committed JSON and never fetches at chat time.
Every record carries a SHA-256 of its text and the retrieval time; an item whose freshness marker did not move keeps its prior record untouched. No secrets, no private routes, no model calls.
"""
from __future__ import annotations

import hashlib, json, re, sys, time, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "src/lib/zarvis/external-content.json"
USER_AGENT = "OpenZcash-Zarvis-offline-sync (+https://openzcash.org/zarvis)"
TIMEOUT_S, MAX_BYTES, PAUSE_S = 20, 3_000_000, 0.2
# Bounds mirror EXTERNAL_LIMITS in src/lib/zarvis/knowledge.ts; the size-guard test fails if either side drifts.
BLOG_POSTS_PER_SITE, BLOG_CHARS = 40, 12_000
WIKI_CHARS = 15_000
FORUM_TOPICS_PER_CATEGORY, FORUM_CHARS = 30, 4_000
TOTAL_JSON_CHARS = 4_000_000

ECC_FEED = "https://electriccoin.co/feed/"
ECC_HOSTS = ("electriccoin.co", "zodl.com")  # ECC's post pages redirect permanently to zodl.com, the blog's current home; the final URL is the citation.
ZF_BLOG = "https://zfnd.org/blog/"
ZF_CATEGORIES = (("foundation-news", 4), ("zebra", 2), ("zcap", 1), ("zcon-event", 1), ("events", 1))  # (slug, archive pages read), newest first; 10 posts per page.
FORUM = "https://forum.zcashcommunity.com"
# The forum has no "announcements" category; Ecosystem Updates (31) is where releases and organization news are posted, next to Governance (25).
FORUM_CATEGORIES = (("governance", 25), ("ecosystem-updates", 31))
ZECHUB_WIKI = "https://zechub.wiki"
ZECHUB_RAW = "https://raw.githubusercontent.com/ZecHub/zechub/main/site/"
# zechub.wiki renders these markdown files client-side, so the text comes from the public source and the citation stays the wiki URL (lowercase, underscores to hyphens).
ZECHUB_PAGES = (
    "Start_Here/What_is_ZEC_and_Zcash", "Start_Here/New_User_Guide", "Start_Here/Development_Fund", "Start_Here/How_Zcash_Is_Organized",
    "Start_Here/Network_Upgrades", "Start_Here/Zcash_Monetary_Policy", "Start_Here/Who_Can_See_Your_Zcash_Payment",
    "Using_Zcash/Wallets", "Using_Zcash/Shielded_Pools", "Using_Zcash/Transactions", "Using_Zcash/Buying_ZEC",
    "Using_Zcash/Zcash_Mining_Guide", "Using_Zcash/Zcash_Mining_Pools",
    "Zcash_Tech/Viewing_Keys", "Zcash_Tech/Unified_Addresses", "Zcash_Tech/zk_SNARKS", "Zcash_Tech/Zebra_Full_Node",
    "Zcash_Community/Zcash_Governance", "Zcash_Community/Community_Links", "Zcash_Community/Zcash_Global_Ambassadors",
    "Zcash_Organizations/Zcash_Community_Grants", "Zcash_Organizations/Zcash_Foundation", "Zcash_Organizations/Electric_Coin_Company",
    "guides/Zcash_Improvement_Proposals", "guides/Using_ZEC_Privately", "Glossary_and_FAQs/FAQ",
)
BLOCK_TAGS = {"p", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote", "div", "pre", "section", "article", "ul", "ol", "table", "figcaption"}
SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "nav", "footer", "header", "form", "button", "iframe"}
VOID_TAGS = {"br", "img", "hr", "input", "meta", "link", "source", "wbr", "area", "col", "embed", "param", "track"}


def digest(text: str) -> str: return hashlib.sha256(text.encode("utf-8")).hexdigest()
def now_iso() -> str: return datetime.now(timezone.utc).isoformat()
def clip(text: str, limit: int) -> str: return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
def tidy(text: str) -> str:
    lines = (re.sub(r"[ \t ]+", " ", line).strip() for line in unescape(text).splitlines())
    return "\n".join(line for line in lines if line)


def fetch(url: str, accept: str = "*/*", hosts: tuple = ()) -> tuple:
    """One bounded public GET, returning (bytes, final URL). A redirect may only land on the request's host or an explicitly allowed one, so a hijacked link cannot pull foreign content in."""
    time.sleep(PAUSE_S)
    response = urlopen(Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept}), timeout=TIMEOUT_S)
    with response:
        final = response.geturl()
        if final.split("/")[2] not in (url.split("/")[2], *hosts): raise ValueError(f"Redirected off-site: {url} -> {final}")
        if response.status != 200: raise ValueError(f"HTTP {response.status} for {url}")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES: raise ValueError(f"Response too large: {url}")
    return data, final
def fetch_text(url: str, accept: str = "*/*") -> str: return fetch(url, accept)[0].decode("utf-8", "replace")
def fetch_json(url: str): return json.loads(fetch_text(url, "application/json"))
def challenged(error: Exception) -> bool:
    """zfnd.org answers some paths with a 202 bot challenge instead of the page; that is a skip, not a corpus failure."""
    return isinstance(error, ValueError) and str(error).startswith("HTTP 202")


class ArticleText(HTMLParser):
    """Collects the text of the best article container on a page: Elementor's post-content widget (ECC and ZF), then entry-content, article, main, body."""
    CANDIDATES = (("class", "elementor-widget-theme-post-content"), ("class", "entry-content"), ("tag", "article"), ("tag", "main"), ("tag", "body"))

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth, self.skip_until, self.buffers = 0, None, {}
        self.open: list = []  # (candidate index, depth at which it opened)

    def handle_starttag(self, tag, attrs):
        if tag in VOID_TAGS:
            if tag == "br" and self.skip_until is None: self._emit("\n")
            return
        self.depth += 1
        if self.skip_until is not None: return
        if tag in SKIP_TAGS: self.skip_until = self.depth; return
        classes = next((value or "" for name, value in attrs if name == "class"), "").split()
        for index, (mode, needle) in enumerate(self.CANDIDATES):
            if (mode == "tag" and tag == needle) or (mode == "class" and needle in classes):
                self.open.append((index, self.depth)); self.buffers.setdefault(index, [])
        if tag in BLOCK_TAGS: self._emit("\n")

    def handle_startendtag(self, tag, attrs):
        if tag == "br" and self.skip_until is None: self._emit("\n")

    def handle_endtag(self, tag):
        if tag in VOID_TAGS: return
        if self.skip_until == self.depth: self.skip_until = None
        if self.skip_until is None and tag in BLOCK_TAGS: self._emit("\n")
        self.open = [(index, depth) for index, depth in self.open if depth != self.depth]
        self.depth = max(0, self.depth - 1)

    def handle_data(self, data):
        if self.skip_until is None: self._emit(data)

    def _emit(self, piece: str):
        for index, _ in self.open: self.buffers[index].append(piece)

    def best(self) -> str:
        for index in range(len(self.CANDIDATES)):
            text = tidy("".join(self.buffers.get(index, [])))
            if len(text) >= 200: return text
        return ""


def article_text(html: str) -> str:
    parser = ArticleText(); parser.feed(html); parser.close()
    return parser.best()
def strip_html(html: str) -> str:
    """Discourse 'cooked' HTML to lines: images and link previews dropped, block ends become line breaks."""
    html = re.sub(r"<(?:script|style)[\s\S]*?</(?:script|style)>|<aside class=\"onebox[\s\S]*?</aside>|<div class=\"lightbox-wrapper\">[\s\S]*?</div>\s*</a>\s*</div>", " ", html, flags=re.I)
    html = re.sub(r"<(?:br|/p|/li|/h[1-6]|/tr|/blockquote|/div|/pre)\b[^>]*>", "\n", html, flags=re.I)
    return tidy(re.sub(r"<[^>]+>", "", html))
def strip_markdown(markdown: str) -> str:
    """Markdown to plain lines: front matter, images, raw HTML and emphasis dropped; links keep their label; tables keep their cells."""
    text = re.sub(r"\A---\n[\s\S]*?\n---\n", "", markdown)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>\n]+>", " ", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^\s*(?:[-*_]\s*){3,}$", "", text, flags=re.M)
    text = re.sub(r"^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$", "", text, flags=re.M)
    text = re.sub(r"[*_]{1,3}(\S[^*_\n]*?)[*_]{1,3}", r"\1", text)
    text = re.sub(r"`([^`\n]*)`", r"\1", text)
    text = re.sub(r"^\s*\|", "", text, flags=re.M)
    text = re.sub(r"\s*\|\s*", " | ", text)
    return tidy(text)


def iso_date(value: str) -> str | None:
    try: return (parsedate_to_datetime(value) if "," in value else datetime.fromisoformat(value.replace("Z", "+00:00"))).date().isoformat()
    except (TypeError, ValueError): return None
def record(ident: str, kind: str, site: str, title: str, url: str, published: str | None, text: str, limit: int, author: str | None = None, source: str | None = None, marker: str | None = None) -> dict:
    body = clip(text, limit)
    return {"id": ident, "kind": kind, "site": site, "title": clip(tidy(title), 200), "url": url, "publishedOn": published, "retrievedAt": now_iso(), "sha256": digest(body), "author": author, "source": source, "marker": marker, "text": body}
def unchanged(prior: dict | None, marker: str | None) -> bool:
    return bool(prior and marker and prior.get("marker") == marker and prior.get("text"))


def ecc_posts(previous: dict) -> list:
    """ECC's WordPress feed lists its newest posts with summaries only and relative links; each post body is read from the post page."""
    root = ET.fromstring(fetch(ECC_FEED, "application/rss+xml")[0])
    posts = []
    for item in list(root.iter("item"))[:BLOG_POSTS_PER_SITE]:
        link = urljoin("https://electriccoin.co/", (item.findtext("link") or "").strip())
        title, published = item.findtext("title") or "", iso_date(item.findtext("pubDate") or "")
        if not link.startswith("https://electriccoin.co/") or not title: continue
        ident, marker = f"blog:electriccoin.co:{link.rstrip('/').rsplit('/', 1)[-1]}", f"{published}:{link}"
        if unchanged(previous.get(ident), marker): posts.append(previous[ident]); continue
        page, final = fetch(link, "text/html", ECC_HOSTS)
        text = article_text(page.decode("utf-8", "replace")) or tidy(re.sub(r"<[^>]+>", "", item.findtext("description") or ""))
        if text: posts.append(record(ident, "official blog", "electriccoin.co", title, final, published, text, BLOG_CHARS, source=link, marker=marker))
    return posts
def zf_listed() -> dict:
    """zfnd.org challenges its feed, sitemap and JSON endpoints but serves the HTML blog page (8 newest posts with dates) and the category archives (10 per page, no dates)."""
    listed = {}
    for url in [ZF_BLOG, *(f"https://zfnd.org/category/{slug}/{'' if page == 1 else f'page/{page}/'}" for slug, pages in ZF_CATEGORIES for page in range(1, pages + 1))]:
        try: html = fetch_text(url, "text/html")
        except (ValueError, HTTPError) as error:
            if url == ZF_BLOG or not (challenged(error) or isinstance(error, HTTPError)): raise
            print(f"zf: {url} unavailable ({type(error).__name__}); continuing with {len(listed)} listed posts.", file=sys.stderr); continue
        for card in re.findall(r"<article class=\"zf-card\">([\s\S]*?)</article>", html):
            link, when = re.search(r"class=\"zf-card-title\"><a href=\"(https://zfnd\.org/[a-z0-9-]+/)\">([^<]+)</a>", card), re.search(r"datetime=\"([^\"]+)\"", card)
            if link: listed.setdefault(link.group(1), (unescape(link.group(2)), iso_date(when.group(1)) if when else None))
        for link, title in re.findall(r"<h2 class=\"entry-title\"><a href=\"(https://zfnd\.org/[a-z0-9-]+/)\">([^<]+)</a>", html):
            listed.setdefault(link, (unescape(title), None))
    return listed
def zf_posts(previous: dict) -> list:
    """A post already in the corpus is kept by URL; new posts are read once, dated by their article:published_time meta, and the newest 40 remain."""
    posts = []
    for link, (title, listed_date) in zf_listed().items():
        ident = f"blog:zfnd.org:{link.rstrip('/').rsplit('/', 1)[-1]}"
        if unchanged(previous.get(ident), link): posts.append(previous[ident]); continue
        try: html = fetch_text(link, "text/html")
        except ValueError as error:
            if not challenged(error): raise
            print(f"zf: {link} challenged; skipped.", file=sys.stderr); continue
        meta = re.search(r"property=\"article:published_time\" content=\"([^\"]+)\"", html)
        text = article_text(html)
        if text: posts.append(record(ident, "official blog", "zfnd.org", title, link, (iso_date(meta.group(1)) if meta else None) or listed_date, text, BLOG_CHARS, marker=link))
    return sorted(posts, key=lambda post: post["publishedOn"] or "", reverse=True)[:BLOG_POSTS_PER_SITE]
def zechub_pages(previous: dict) -> list:
    pages = []
    for path in ZECHUB_PAGES:
        source, url = f"{ZECHUB_RAW}{path}.md", f"{ZECHUB_WIKI}/{path.lower().replace('_', '-')}"
        ident = f"wiki:{path.lower().replace('_', '-')}"
        text = strip_markdown(fetch_text(source, "text/plain"))
        if not text: continue
        prior = previous.get(ident)
        if prior and prior.get("sha256") == digest(clip(text, WIKI_CHARS)): pages.append(prior); continue
        title = path.rsplit("/", 1)[-1].replace("_", " ")
        pages.append(record(ident, "community wiki", "zechub.wiki", title, url, None, text, WIKI_CHARS, source=source))
    return pages
def forum_topics(previous: dict) -> list:
    """First post of the most recently active topics per category; the listing's bumped_at is the freshness marker, so quiet topics are not re-read."""
    topics = []
    for slug, category in FORUM_CATEGORIES:
        listing = fetch_json(f"{FORUM}/c/{slug}/{category}/l/latest.json?order=activity")
        rows = [t for t in listing.get("topic_list", {}).get("topics", []) if isinstance(t.get("id"), int) and not t.get("pinned") and t.get("visible", True)]
        for row in rows[:FORUM_TOPICS_PER_CATEGORY]:
            ident, marker = f"forum:{row['id']}", f"{row.get('bumped_at')}:{row.get('title')}"
            if unchanged(previous.get(ident), marker): topics.append(previous[ident]); continue
            topic = fetch_json(f"{FORUM}/t/{row['id']}.json")
            first = next((p for p in topic.get("post_stream", {}).get("posts", []) if p.get("post_number") == 1), None)
            if not first: continue
            text = strip_html(first.get("cooked") or "")
            topic_slug = topic.get("slug") if re.fullmatch(r"[a-z0-9-]+", str(topic.get("slug"))) else None
            url = f"{FORUM}/t/{topic_slug + '/' if topic_slug else ''}{row['id']}"
            if text: topics.append(record(ident, "forum topic", "forum.zcashcommunity.com", f"{topic.get('title') or row.get('title')} ({slug})", url, iso_date(str(first.get("created_at"))), text, FORUM_CHARS, author=str(first.get("username") or "") or None, marker=marker))
    return topics


FAMILIES = (("ecc", ecc_posts, lambda s: s["site"] == "electriccoin.co"), ("zf", zf_posts, lambda s: s["site"] == "zfnd.org"), ("zechub", zechub_pages, lambda s: s["kind"] == "community wiki"), ("forum", forum_topics, lambda s: s["kind"] == "forum topic"))
def sync() -> int:
    old = json.loads(TARGET.read_text()) if TARGET.exists() else {"sources": []}
    previous = {s["id"]: s for s in old["sources"]}
    sources, failed = [], []
    for name, read, belongs in FAMILIES:
        try:
            fresh = read(previous)
            if not fresh: raise ValueError("no records")
            sources.extend(fresh); print(f"{name}: {len(fresh)} records ({sum(1 for s in fresh if s is previous.get(s['id']))} unchanged).")
        except (HTTPError, URLError, ValueError, ET.ParseError, KeyError, TypeError, OSError) as error:
            kept = [s for s in old["sources"] if belongs(s)]
            sources.extend(kept); failed.append(name)
            print(f"{name}: refresh failed ({type(error).__name__}: {error}); kept {len(kept)} prior records.", file=sys.stderr)
    corpus = {"version": 1, "retrievedAt": now_iso(), "sources": sources}
    serialized = json.dumps(corpus, ensure_ascii=False, indent=1) + "\n"
    if len(serialized) > TOTAL_JSON_CHARS: raise ValueError(f"External corpus too large: {len(serialized):,} characters")
    temp = TARGET.with_suffix(".tmp"); temp.write_text(serialized); temp.replace(TARGET)
    print(f"Saved {len(sources)} external sources ({sum(len(s['text']) for s in sources):,} characters, {len(serialized):,} JSON characters).")
    return 1 if failed else 0
if __name__ == "__main__":
    try: sys.exit(sync())
    except Exception as error:
        print(f"External refresh failed ({type(error).__name__}: {error}); the prior corpus was preserved.", file=sys.stderr)
        sys.exit(1)
