#!/usr/bin/env python3
"""Recount a Coinholder Grants round from the vote chain's finalized summary and apply ZIP 1016.
Standard library only. https://openzcash.org/coinholders/verify
  python3 coinholder_verify.py [ROUND_ID] [--host zf|valar] [--compare URL] > tally.csv"""
import argparse, base64, csv, hashlib, json, sys, urllib.request

HOSTS = {"zf": "https://zvote.zfnd.org", "valar": "https://prod.vote-chain-primary.valargroup.org"}
Q3_2026 = "2cba66eb16c7581a1692cb0b033785da0131059f645a0d2fb4dc2a5131505e01"
QUORUM = 420_000  # ZEC voted on the question, Abstain included: ZIP 1016 does not say, openzcash.org counts it
KEYS = ("accept", "reject", "lower", "abstain")

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "coinholder-verify"}), timeout=30) as r:
        return r.read()

def key(label):  # options are named in words: classify by wording, not position
    l = label.lower()
    for k in ("accept", "abstain"):
        if l.startswith(k): return k
    if l.startswith("reject"): return "lower" if "lower amount" in l else "reject"
    sys.exit("unknown option: " + label)

a = argparse.ArgumentParser(description=__doc__.splitlines()[0])
a.add_argument("round", nargs="?", default=Q3_2026)
a.add_argument("--host", choices=HOSTS, default="zf")
a.add_argument("--compare", help="OpenZcash JSON to diff against, e.g. https://openzcash.org/api/coinholders/verify?round=q3-2026&format=json")
args = a.parse_args()
body = get(f"{HOSTS[args.host]}/shielded-vote/v1/vote-summary/{args.round}")
summary = json.loads(body)
if base64.b64decode(summary.get("vote_round_id") or "").hex() != args.round.lower():
    sys.exit(f"{HOSTS[args.host]} answered for another round, not {args.round}")
rows = []
for p in sorted(summary["proposals"], key=lambda p: p["id"]):
    z = dict.fromkeys(KEYS, 0.0)
    for o in p["options"]:
        z[key(o["label"])] += o.get("total_value", 0) / 8  # units of 0.125 ZEC; a zero option omits the field
    total, against = sum(z.values()), z["reject"] + z["lower"]
    decided = z["accept"] + against
    rows.append(dict(ballot=p["id"], title=p["title"], **z, total=total, quorum=total >= QUORUM,
                     share=z["accept"] / decided if decided else 0.0,
                     outcome="Funded" if total >= QUORUM and z["accept"] > against else "Rejected"))
out = csv.writer(sys.stdout)
out.writerow(["ballot", "title", *KEYS, "total", "quorum", "share", "outcome"])
for r in rows:
    out.writerow([r["ballot"], r["title"], *(f"{r[k]:.3f}" for k in (*KEYS, "total")),
                  "yes" if r["quorum"] else "no", f"{r['share'] * 100:.2f}", r["outcome"]])
print(f"sha256 {hashlib.sha256(body).hexdigest()}  {HOSTS[args.host]}", file=sys.stderr)
if args.compare:  # every figure, the rule's outcome and the published one, ballot by ballot
    ours = {r["ballot"]: r for r in json.loads(get(args.compare))["rows"]}
    same = lambda r, o: o["published"].split(" · ")[0] == o["rule"] == r["outcome"] and o["quorumMet"] == r["quorum"] and all(
        o[k] == r[k] for k in (*KEYS, "total"))
    diff = [r["ballot"] for r in rows if r["ballot"] not in ours or not same(r, ours[r["ballot"]])]
    extra = sorted(set(ours) - {r["ballot"] for r in rows}, key=str)
    print(f"compare: {len(rows) - len(diff)} of {len(rows)} agree with {args.compare}" + (f"; differ: {diff}" if diff else "")
          + (f"; not on the vote chain: {extra}" if extra else ""), file=sys.stderr)
    sys.exit(1 if diff or extra else 0)
