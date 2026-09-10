#!/usr/bin/env bash
# The ZecHub treasury at a glance: the three pots, what is actually spendable,
# the budget allocations, the payout table, and the paid-out reconciliation.
# Usage: scripts/treasury.sh
set -euo pipefail

DATA=$(curl -sf "https://openzcash.org/api/zechub/treasury")

python3 - "$DATA" <<'PY'
import json, sys

d = json.loads(sys.argv[1])
if not d.get("ok"):
    sys.exit(f"treasury endpoint returned: {d}")

t, tot = d["treasuries"], d["totals"]
usd = lambda n: f"${n:,.2f}" if n is not None else "unavailable"
print(f"# ZecHub treasury — balances dated {d['capturedOn']}")
v = d.get("valuation") or {}
market = v.get("basis") == "snapshot-balances-at-market-price"
if market:
    stamp = v.get("quoteAsOf") or f"retrieved {v.get('fetchedAt', 'unknown')}"
    print(f"Indicative USD at {usd(v.get('zecPriceUsd'))}/ZEC · {v.get('quoteSource')} · {stamp}")
    if v.get("stale"):
        print("STALE QUOTE: retained after the feed stopped returning a fresh price.")
else:
    print(f"USD at the spreadsheet's recorded price: {usd(d.get('zecPriceUsd'))}/ZEC")
print()
print("## the three pots (they are NOT one budget)")
don, fpf, inc = t["donations"], t["fpf"], t["zechubInc"]
print(f"  donations    {don['zec']:>10,.3f} ZEC   {usd(v.get('donationsUsd') if market else don['usd']):>14}")
print(f"  FPF          {fpf['zec']:>10,.3f} ZEC   {usd(v.get('fpfUsd') if market else fpf['usd']):>14}")
print(f"  ZecHub Inc   {inc['zec']:>10,.3f} ZEC   {usd(v.get('zechubIncUsd') if market else inc['usd']):>14}")
print(f"  {'':12}{'-'*10}")
print(f"  total        {tot['zec']:>10,.3f} ZEC")
if v:
    print(f"  total USD    {usd(v.get('totalUsd'))}")
print()
print(f"  FPF unreserved in source: {fpf['spendableZec']:,.2f} ZEC · reserved {usd(fpf['reservedUsd'])}")
print(f"  Unreserved USD at source price: {usd(fpf['spendableZec'] * d['zecPriceUsd'])}")
print("  Dated holdings and price gains do not prove current spending capacity.")
mc = d.get("multichain") or {}
if any(mc.values()):
    print(f"  also held: {mc.get('penumbraUm', 0):,.2f} UM (Penumbra) · {mc.get('namadaNam', 0):,.0f} NAM (Namada)")
print()

print("## budget allocations")
for a in d["allocations"]:
    print(f"  {a['category']:<34} {a['zec']:>7,.2f} ZEC   {a['sharePct']:>5.2f}%")
print()

payouts = d["payouts"]
paid = sum(p["paidUsd"] or 0 for p in payouts)
pending = sum(p["pendingUsd"] or 0 for p in payouts)
unquantified = [p for p in payouts if p["paidUsd"] is None]

print(f"## payouts ({len(payouts)} funded work items)")
for p in payouts:
    pd = f"${p['paidUsd']:,.2f}" if p["paidUsd"] is not None else "  (not recorded)"
    pn = f"${p['pendingUsd']:,.2f}" if p["pendingUsd"] else "—"
    ms = "/".join(m[0] for m in (p["milestones"] or [])) or "—"
    print(f"  paid {pd:>15}   pending {pn:>12}   [{ms}]  {p['title'][:52]}")
print()

print("## reconciliation (read this before quoting a 'total paid')")
print(f"  sum of payouts[].paidUsd     ${paid:,.2f}   <- what the API actually exposes")
print(f"  totals.paidOutUsd            ${tot['paidOutUsd']:,.2f}   <- sum of recorded payouts")
if abs(paid - tot["paidOutUsd"]) > 0.01:
    print(f"  WARNING: API payout rows and total differ by ${abs(paid - tot['paidOutUsd']):,.2f}")
sheet_paid = tot.get("paidOutUsdSheet")
print(f"  totals.paidOutUsdSheet       {usd(sheet_paid)}   <- source header")
if sheet_paid is not None and abs(paid - sheet_paid) > 0.01:
    print(f"  Source header differs from recorded rows by ${abs(paid - sheet_paid):,.2f}; prefer the row sum.")
print()
print(f"  sum of payouts[].pendingUsd  ${pending:,.2f}")
print(f"  totals.committedUsd          ${tot['committedUsd']:,.2f}")
if unquantified:
    print(f"  {len(unquantified)} row(s) have paidUsd = null (amount only in the title) and are in NO sum:")
    for p in unquantified:
        print(f"     · {p['title'][:66]}")
print()
print("source: https://openzcash.org/api/zechub/treasury")
print(f"Balances dated {d['capturedOn']}. Source imported every 6h; market quote cached for 10 minutes.")
PY
