"""Verify the saved monthly format and calendar; this does not approve a new issue."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import tomllib

from pypdf import PdfReader

KIT = Path(__file__).resolve().parent
REPO = KIT.parent.parent
ROLES = ['cover', 'zf', 'shielded-labs', 'tachyon', 'zakura', 'wallets',
         'hardware', 'supporting-stack', 'products', 'highlights-handoff']


def require(condition, message):
    if not condition:
        raise ValueError(message)


def calendar_for(scheduled_for):
    day = dt.date.fromisoformat(scheduled_for)
    require(day.day == 1, 'Supply the intended first-of-month occurrence, even for a delayed run.')
    end = day - dt.timedelta(days=1)
    start = end.replace(day=1)
    previous = start - dt.timedelta(days=1)
    return {'scheduledFor': day.isoformat(), 'timezone': 'America/Sao_Paulo',
            'localTime': '09:00', 'publicationMonth': day.strftime('%Y-%m'),
            'financialMonth': start.strftime('%Y-%m'),
            'financialStart': start.isoformat(), 'financialEnd': end.isoformat(),
            'comparisonMonth': previous.strftime('%Y-%m'),
            'comparisonStart': previous.replace(day=1).isoformat(),
            'comparisonEnd': previous.isoformat(), 'windowStart': start.isoformat(),
            'evidenceCutoff': None, 'cutoffRule': 'Verify from current sources during the run.'}


def verify_contract(c):
    require(c['standardId'] == 'openzcash-editorial-4.0', 'Unexpected active standard.')
    require(c['language'] == 'en' and (c['pageWidth'], c['pageHeight']) == (1200, 675), 'Format changed.')
    require(c['pdfPublications'] == ['monthly', 'operations'], 'Exactly two PDF publications are required.')
    require(c['publicationOrder'] == ['monthly', 'operations', 'sources'] and c['sourcesIsPdf'] is False,
            'Sources & Data must remain the third view, not a PDF.')
    m = c['monthly']
    require(m['pageCount'] == 10 and m['pageRoles'] == ROLES, 'The approved ten-page order changed.')
    require((m['walletSlide'], m['productsSlide'], m['highlightsSlide']) == (6, 9, 10), 'Page positions changed.')
    require(m['walletLayout'] == '2x2' and m['walletRoster'] == ['ZODL', 'Zingo', 'Vizor', 'Zkool'],
            'The core wallet roster and grid must remain intact.')
    require(m['nextPublication'] == 'operations', 'The last Monthly page must open Operations.')
    require(c['operations']['name'] == 'Operations' and c['operations']['fixedPageCount'] is False,
            'Operations pagination follows current evidence.')
    require(c['operations']['noGenericClosingPage'] is True, 'No filler closing page is allowed.')
    require(c['period']['timezone'] == 'America/Sao_Paulo' and c['period']['dayOfMonth'] == 1
            and c['period']['localTime'] == '09:00', 'Unexpected schedule in the standard.')


def verify_references():
    refs = json.loads((KIT / 'reference.json').read_text())
    require(refs['designVersion'] == '4.0' and set(refs['documents']) == {'monthly', 'operations'},
            'The approved two-document reference is missing.')
    verified = {}
    for kind, record in refs['documents'].items():
        path = (REPO / record['pdf']).resolve()
        require(path.is_relative_to(KIT), 'References must remain in the durable production kit.')
        require(hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256'], f'{kind}: reference hash changed.')
        pdf = PdfReader(path)
        pages = json.loads((REPO / record['manifest']).read_text())
        require(len(pdf.pages) == len(pages) == record['pages'], f'{kind}: incomplete reference.')
        require(all((float(p.mediabox.width), float(p.mediabox.height)) == (1200, 675) for p in pdf.pages),
                f'{kind}: incorrect reference geometry.')
        if kind == 'monthly':
            require(len(pages) == 10 and 'Wallet' in pages[5]['title'] and 'products' in pages[8]['title'],
                    'The reference no longer matches the approved Monthly order.')
            require(any('publication=operations' in link.get('url', '') for link in pages[9]['links']),
                    'The approved reference is missing its Operations handoff.')
        verified[kind] = {'pages': record['pages'], 'sha256': record['sha256']}
    return verified


def verify_automation(path):
    saved = tomllib.loads(path.read_text())
    require(saved['id'] == 'openzcash-monthly' and saved['kind'] == 'heartbeat', 'Wrong existing automation.')
    require(saved['status'] == 'ACTIVE', 'The monthly job is not active.')
    fields = dict(part.split('=', 1) for part in saved['rrule'].split(';'))
    require(fields == {'FREQ': 'MONTHLY', 'BYMONTHDAY': '1', 'BYHOUR': '9', 'BYMINUTE': '0', 'BYSECOND': '0'},
            'Saved cadence differs from the existing monthly schedule.')
    require(saved['target_thread_id'] == '01a08c37-8610-7cb0-8a7a-377a129b0707', 'Automation targets another task.')
    expected = (KIT / 'AUTOMATION-PROMPT.md').read_text().strip()
    require(saved['prompt'].strip() == expected, 'The saved automation is not using the approved prompt.')
    return {'id': saved['id'], 'status': saved['status'], 'kind': saved['kind'],
            'promptSha256': hashlib.sha256(expected.encode()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scheduled-for', required=True)
    parser.add_argument('--automation-file', type=Path)
    args = parser.parse_args()
    c = json.loads((KIT / 'reading-set-contract.json').read_text())
    verify_contract(c)
    result = {'ok': True, 'standardId': c['standardId'], 'calendar': calendar_for(args.scheduled_for),
              'approvedReferences': verify_references(), 'newIssueGenerated': False,
              'productionDeploymentVerified': False,
              'routineActivation': json.loads((KIT / 'routine-activation.json').read_text())['status']}
    if args.automation_file:
        result['automation'] = verify_automation(args.automation_file)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
