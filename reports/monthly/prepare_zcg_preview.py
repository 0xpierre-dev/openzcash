"""Reconcile the dated ZCG fixture from public issue, sheet and minute captures."""
import argparse
import csv
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence-dir', type=Path, required=True)
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
evidence = args.evidence_dir
cutoff = '2026-09-11T00:00:00Z'
issues = json.loads((evidence / 'open-applications.json').read_text())
sheet = list(csv.DictReader((evidence / 'proposals-sheet.csv').read_text().splitlines()))
sheet_by_issue = {}
for row_number, row in enumerate(sheet, 2):
    match = re.search(r'ZcashCommunityGrants/zcashcommunitygrants/issues/(\d+)', row['Grant Platform Link'])
    if match:
        sheet_by_issue[int(match[1])] = {**row, 'rowNumber': row_number}

def field(issue, name):
    match = re.search(r'^### ' + re.escape(name) + r'\s*\n(.*?)(?=^### |\Z)', issue['body'], re.M | re.S)
    return match[1].strip() if match else ''

def amount(issue):
    first_line = field(issue, 'Requested Grant Amount (USD)').splitlines()[0]
    values = [int(v.replace(',', '')) for v in re.findall(r'\d[\d,]*', first_line)]
    if issue['number'] == 407:
        assert values[:2] == [60000, 120000]
        return {'amount': None, 'amountMin': 60000, 'amountMax': 120000, 'amountLabel': '$60k-$120k', 'amountBasis': 'Indicative range; final scope not agreed'}
    assert values and values[0] > 0
    return {'amount': values[0], 'amountMin': values[0], 'amountMax': values[0], 'amountLabel': f'${values[0]:,}', 'amountBasis': 'Requested USD'}

copy = {
    421: ('Kestrel + ZecAuth', 'Wallet connectivity, a mobile wallet and African fiat integration.', 'Kuvarpay Limited'),
    420: ('24 Videos @zkMarketer', '24 documentary-style films over 12 weeks.', 'Connaugh'),
    419: ('Zcash Flutter Wallet SDK', 'Dart bindings for the official iOS and Android wallet SDKs.', 'Hardik Jain'),
    418: ('ZecScope', 'Track ZIPs, network upgrades and wallet readiness.', 'aryaethn'),
    417: ('Zcash awareness campaign', 'Education and community content on X and Binance Square.', 'coldheartedmen'),
    415: ('East Africa: Blockchain Festival', 'Nairobi booth, merchant spending and follow-up onboarding.', 'Zcash East Africa'),
    414: ("Colosseum: Crypto World's Fair", 'A Zcash track in the multi-chain developer competition.', 'Colosseum'),
    413: ('zcashlib', 'Pure-JavaScript support for transparent and shielded Zcash.', 'Coin Wallet'),
    412: ('Coin Wallet integration', 'Shielded ZEC support across web, desktop and mobile.', 'Coin Wallet'),
    411: ('Zcash SeedSigner', 'An open-source, air-gapped signing device built from generic parts.', 'Biglup Labs'),
    408: ('0xramp', 'Non-custodial ZEC and local-currency payment rails.', '0xramp Labs'),
    407: ('Zaino security audit', 'Independent audit; the final budget depends on scoping.', 'Cyfrin'),
    405: ('Zcash World, Mumbai', 'Public event and merchant onboarding around Devcon 8.', 'Zcash India'),
    404: ('Privacy Literacy Lab Canada', 'Interactive privacy scenarios and a dated regulatory source map.', 'Daniel Sultan'),
    403: ('Recoverify', 'Verify wallet backups while the original wallet is still available.', 'OneLabs'),
    401: ('Taking Zcash to the Streets', 'A Turkish video series and Istanbul street interviews.', 'Crypto Epoch'),
}
requests, excluded = [], []
for issue in issues:
    if issue['created_at'] >= cutoff:
        excluded.append({'number': issue['number'], 'reason': 'Submitted after the issue cutoff'})
        continue
    labels = [label['name'].casefold() for label in issue['labels']]
    application = any('grant application' in label for label in labels) or re.match(r'^(?:ZCG )?Grant Application', issue['title'], re.I)
    if not application:
        continue
    decided = any(any(word in label for word in ('approved', 'payment completed', 'declined', 'rejected', 'withdrawn')) for label in labels)
    row = sheet_by_issue.get(issue['number'])
    if decided or (row and row['Grant Status'].strip() != 'ZCG to discuss'):
        excluded.append({'number': issue['number'], 'reason': 'Already decided or funded; review label alone is insufficient'})
        continue
    assert row and issue['number'] in copy, f'Unreviewed candidate {issue["number"]}'
    status_evidence = 'Issue unchanged since before cutoff; official sheet still lists ZCG to discuss'
    if issue['updated_at'] >= cutoff:
        assert issue['number'] == 420
        timeline = json.loads((evidence / 'issue-420-timeline.json').read_text())
        assert all(event.get('event') in ('commented', 'mentioned', 'subscribed') for event in timeline if event.get('created_at', '') >= cutoff)
        original = json.loads((args.source_dir / 'source-data/topic-57494.json').read_text())['post_stream']['posts'][0]
        assert original['updated_at'] < cutoff and '$60,000' in original['cooked']
        status_evidence = 'Sep 11 update is a comment; Sep 8 forum capture confirms the $60,000 request'
    title, summary, applicant = copy[issue['number']]
    requests.append({'number': issue['number'], 'title': title, 'fullTitle': issue['title'], 'summary': summary, 'applicant': applicant, **amount(issue), 'status': 'Under review', 'submitted': issue['created_at'][:10], 'url': issue['html_url'], 'forumUrl': row['Forum Link'], 'sheetRow': row['rowNumber'], 'statusEvidence': status_evidence})

closed = json.loads((evidence / 'closed-since-cutoff.json').read_text())
assert not [issue for issue in closed if issue['created_at'] < cutoff <= issue['closed_at']], 'A historical open-state reconstruction is required'
requests.sort(key=lambda row: row['title'].casefold())
assert {row['number'] for row in requests} == set(copy)

# Outcomes reported in the Sep 2 minutes, plus decisions dated inside Sep 1-10.
# These are requested amounts, not approval budgets or disbursements.
decision_copy = [
    (342, 'Constant-time hardening', 10000, 'Approved', 'Async approval; broader scope and the initial milestone discussed.'),
    (391, 'WalletConnect integration', 50000, 'Approved', 'Reusable Zcash integration requested beyond the Noir wallet.'),
    (402, 'ZECsy community building', 550000, 'Approved', 'Nine-month milestones only; Hanh voted against.'),
    (395, 'BTCPayServer GraphQL client', 16800, 'Approved', 'Multi-store support and migration to the Zkool GraphQL API.'),
    (396, 'Pretty Good Policy for Zcash', 750000, 'Approved', 'Policy work approved; Paul recused from the discussion.'),
    (398, 'Hack-to-Dark, Mumbai', 43524, 'Approved', 'Developer event proposed for November 3-4.'),
    (400, 'Zcash Arabia', 27000, 'Approved', 'August-December programme; Artkor and Zerodartz voted against.'),
    (389, 'Zebra test-effectiveness audit', 45000, 'Declined', 'Committee cited limited usefulness and false-positive concerns.'),
    (390, 'Rvess Pay mobile-money integration', 32000, 'Declined', 'Committee asked for more reuse of existing payment components.'),
    (392, 'Halo2 verifier testing infrastructure', 4500, 'Declined', 'Need and ability to detect circuit logic defects were not established.'),
    (394, 'SHPH network layer', 25000, 'Declined', 'Committee raised scope, track-record and differentiation concerns.'),
    (409, 'ZecBit: NFT infrastructure', 48000, 'Declined', 'Proposed ZSA metadata, indexing and shielded payment infrastructure.'),
    (410, 'ZEC Invoice Preflight', 3000, 'Declined', 'Proposed ZIP-321 request validation before merchants share a QR code.'),
]
decisions = []
for number, title, requested, status, summary in decision_copy:
    row = sheet_by_issue[number]
    date = datetime.strptime(row['Date Committee Approved/ Rejected'], '%m/%d/%y').date().isoformat()
    assert date < cutoff[:10]
    assert row['Grant Status'] == ('Approved' if status == 'Approved' else 'Rejected')
    published = '2026-09-02' if number not in (409, 410) else date
    if number in (409, 410):
        issue = json.loads((evidence / f'issue-{number}.json').read_text())
        assert amount(issue)['amount'] == requested and issue['closed_at'][:10] == date
    decisions.append({'number': number, 'title': title, 'fullTitle': row['Proposal Title '].strip(), 'summary': summary, 'applicant': row['Applicant(s)'], 'amount': requested, 'amountLabel': f'${requested:,}', 'status': status, 'decisionDate': date, 'published': published, 'url': f'https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/{number}', 'decisionUrl': f'https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/{number}' if number in (409,410) else 'https://forum.zcashcommunity.com/t/57394', 'sheetRow': row['rowNumber']})

sources = []
for file in sorted(evidence.glob('*.meta.json')):
    meta = json.loads(file.read_text())
    raw = evidence / file.name.removesuffix('.meta.json')
    if not raw.exists(): raw = raw.with_suffix('.json')
    assert hashlib.sha256(raw.read_bytes()).hexdigest() == meta['sha256']
    assert not meta.get('link'), f'Uncollected pagination in {file.name}'
    sources.append(meta)
payload = {'asOf': '2026-09-10', 'timeBasis': 'UTC calendar dates; end-exclusive cutoff 2026-09-11T00:00:00Z', 'requests': requests, 'decisions': decisions, 'sources': sources, 'excluded': excluded, 'rules': ['A surviving review label does not override a funding or decision record.', 'Published decisions retain both their decision date and publication date.', 'Requested amounts remain separate from approval budgets and paid milestones.', 'Zaino audit is an indicative $60,000-$120,000 range; no midpoint is asserted.', 'Flutter SDK amount is $10,000, including the Markdown-formatted request.', 'The Sep 11 submission is excluded from the Sep 1-10 issue.']}
(root / 'reports/monthly/zcg-preview-data.json').write_text(json.dumps(payload, indent=2) + '\n')
print(json.dumps({'underReview': len(requests), 'approved': sum(r['status']=='Approved' for r in decisions), 'declined': sum(r['status']=='Declined' for r in decisions), 'newInPeriod': sum(r['submitted'] >= '2026-09-01' for r in requests)}))
