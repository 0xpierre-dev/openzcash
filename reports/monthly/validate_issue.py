"""Fail-closed checks for an OpenZcash Monthly issue. No network or source writes."""
from __future__ import annotations
import argparse, calendar, collections, datetime as dt, hashlib, json, re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def dec(value): return Decimal(str(value))
def cents(value): return dec(value).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
def money(value): return dec(re.sub(r'[^\d.\-]', '', str(value)))
def prior_month(value):
    date=dt.date.fromisoformat(value+'-01')-dt.timedelta(days=1)
    return date.strftime('%Y-%m')

def money_mentions(text):
    # Compact and exact amounts are equivalent within displayed precision.
    out=[]
    for m in re.finditer(r'\$([\d,]+(?:\.\d+)?)([kKmM])?\b', text):
        digits=m[1].replace(',',''); scale={'k':1000,'m':1000000}.get((m[2] or '').lower(),1)
        precision=len(digits.split('.')[1]) if '.' in digits else 0
        out.append((dec(digits)*scale, dec(scale)/(10**precision)/2, m[0]))
    return out

def duplicate_claims(title, other):
    found=[]
    for a,ta,raw in money_mentions(title):
        for b,tb,_ in money_mentions(other):
            if abs(a-b)<=max(ta,tb): found.append(raw)
    for pct in re.findall(r'\b\d+(?:\.\d+)?%', title):
        if pct in other: found.append(pct)
    words=lambda s: re.findall(r'[a-z0-9]+',s.lower())
    a,b=words(title),words(other)
    if len(a)>=4 and ' '.join(a) in ' '.join(b): found.append('repeated title')
    return found

def validate(issue: dict, snapshot: dict, root: Path, *, final=False):
    errors=[]; checks=[]
    def check(ok, code, message):
        checks.append(code)
        if not ok: errors.append({'code':code,'message':message})
    e=issue.get('edition',{}); quality=issue.get('quality',{})
    try:
        cutoff=dt.date.fromisoformat(e['cutoff'])
        close=dt.date.fromisoformat(e['financialMonth']+'-01')
        last_close=close.replace(day=calendar.monthrange(close.year,close.month)[1])
        period_mode=e.get('mode','monthly')=='period'
        window_start=dt.date.fromisoformat(e['windowStart'])
        if period_mode:
            check(e.get('comparisonMonth') is None, 'period.comparison', 'A partial-period issue cannot inherit a complete-month comparison.')
            check(window_start<=cutoff and window_start.strftime('%Y-%m')==e['financialMonth']==e['month'], 'period.range', 'The period must stay inside its declared publication month.')
            check(bool(e.get('partial')), 'period.partial-label', 'A period issue must explicitly declare partial coverage.')
        else:
            check(e['comparisonMonth']==prior_month(e['financialMonth']), 'period.comparison', 'Comparison must be the preceding completed month.')
            check(last_close<cutoff, 'period.closed', 'The financial close must be complete at cutoff.')
        check(e['month']==cutoff.strftime('%Y-%m'), 'period.publication', 'Publication month and briefing cutoff disagree.')
        if not period_mode: check(e['windowStart']==close.isoformat(), 'period.window', 'Development window must start at financial-month opening.')
        check(issue['asOf']==e['cutoff']==quality['sourceCutoff']==snapshot['report']['asOf'], 'period.cutoff', 'Issue, evidence and Data report cutoffs differ.')
    except (KeyError,ValueError) as err:
        return {'ok':False,'checks':checks,'errors':[{'code':'schema.period','message':str(err)}]}
    pages=issue['pages']; byid={p['id']:p for p in pages}
    check(len(byid)==len(pages), 'identity.pages', 'Page IDs must be unique.')
    design_version=tuple(int(n) for n in re.findall(r'\d+',str(issue.get('design',{}).get('version','0'))))
    wallet_grid=quality.get('schemaVersion',0)>=3 or design_version>=(3,7)
    if wallet_grid:
        wp=[(n,p) for n,p in enumerate(pages,1) if p.get('design')=='wallets']
        check(len(wp)==1 and wp[0][0]==7,'wallets.position','The core wallet grid must remain slide 7.')
        for _,p in wp:
            roster=['ZODL','Zingo','Vizor','Zkool'];releases=p.get('walletReleases',[])
            check(p.get('walletLayout')=='2x2','wallets.layout','Core wallets require a 2x2 layout.')
            check([r.get('name') for r in releases]==roster and [c.get('title') for c in p.get('cards',[])]==roster,'wallets.roster','Retain exactly ZODL, Zingo, Vizor and Zkool in the fixed reading order.')
            check(any(u[1]=='https://openzcash.org/wallets' for u in issue['sources'].values()),'wallets.extras','Supplementary wallet coverage needs the OpenZcash Wallets directory source.')
            for r in releases:
                check(bool(r.get('platform')) and r.get('sourceKey') in p.get('sources',[]),'wallets.evidence','Every wallet slot needs a platform and a reviewed source link.')
                if r.get('evidenceState')=='no-update':
                    check(r.get('version') is None and r.get('date') is None and r.get('state')=='No verified update','wallets.unavailable','An unverified update must not inherit a release version or date.')
                    continue
                source=root/r.get('sourceFile','')
                try:
                    records=json.loads(source.read_text());matches=[x for x in records if x.get('tag_name')==r.get('sourceTag')]
                    origin=matches[0] if len(matches)==1 else {}
                except (OSError,ValueError,TypeError):origin={}
                check(bool(origin) and not origin.get('draft') and origin.get('published_at','')[:10]==r.get('date') and str(r.get('version','')) in origin.get('tag_name',''),'wallets.release-source','Wallet version and date must match the captured release record.')
                if origin:
                    expected='Pre-release' if origin['prerelease'] else 'Stable'
                    check(r.get('state')==expected,'wallets.release-state','A prerelease must not be presented as stable.')
    check(set(quality['requiredSections'])<=set(p['section'] for p in pages), 'coverage.sections', 'A required section is missing.')
    for n,p in enumerate(pages,1):
        query=snapshot.get('queries',{}).get(p['id'],{})
        rows=query.get('rows',[])
        try: mirrored=json.loads(rows[0]['content']) if len(rows)==1 else None
        except (ValueError,KeyError):mirrored=None
        check(mirrored==p,'copy.data-view',f'Page {n}: evidence view has a different editorial version.')
        check(not duplicate_claims(p['title'],p.get('subtitle','')), 'copy.title-subtitle', f'Page {n}: repeated headline claim in subtitle.')
        features=' '.join(str(p.get(k,'')) for k in ['metrics','feature','release','deadline'])
        check(not duplicate_claims(p['title'],features), 'copy.title-feature', f'Page {n}: repeated headline amount or percentage in feature.')
        check(not re.search(r'\{(?:YYYY|Month|Year)|\b(?:TODO|TBD|PLACEHOLDER)\b',json.dumps(p)), 'copy.unfinished', f'Page {n}: unfinished copy.')
        check(all(k in issue['sources'] for k in p.get('sources',[])), 'source.references', f'Page {n}: unknown source ID.')
        check(len(p.get('subtitle',''))<=125, 'layout.subtitle-budget', f'Page {n}: subtitle exceeds the editorial budget.')
        if p.get('headers'):
            check(all(len(row)==len(p['headers']) for row in p['rows']), 'table.columns', f'Page {n}: table column mismatch.')
            table=snapshot.get('queries',{}).get(p.get('tableQueryId'),{}).get('rows',[])
            check(table==[{f'c{i}':v for i,v in enumerate(row)} for row in p['rows']],'table.data-view',f'Page {n}: PDF table and evidence table differ.')
        if p.get('design') not in ('cover','contents'):
            check(bool(p.get('sources')), 'source.required', f'Page {n}: evidence reference missing.')
    # Check the source universe and derive grant figures from captured individual records.
    ledger_path=root/quality['ledgerFile']
    check(ledger_path.exists(), 'ledger.file', 'Captured ledger missing.')
    if not ledger_path.exists(): return {'ok':False,'checks':checks,'errors':errors}
    check(hashlib.sha256(ledger_path.read_bytes()).hexdigest()==quality['ledgerSha256'], 'ledger.hash', 'Ledger differs from reviewed capture.')
    ledger=json.loads(ledger_path.read_text()); raw=ledger['data']
    check(len(raw)==ledger['count']==ledger['total'], 'ledger.pagination', 'Ledger capture is not complete.')
    check(len({r['id'] for r in raw})==len(raw), 'ledger.unique', 'Duplicate source ledger IDs.')
    paid=[r for r in raw if r.get('isPaid') is True and r.get('type')=='grant_milestone' and r.get('sourceSheet')=='grants_disbursed' and r.get('paidOutDate') and r['paidOutDate']<=e['cutoff']]
    if period_mode: paid=[r for r in paid if r['paidOutDate']>=e['windowStart']]
    meta_path=ledger_path.with_suffix('.meta.json')
    if meta_path.exists():
        capture=json.loads(meta_path.read_text())
        check(capture['capturedAt'][:10]==e['cutoff'], 'source.capture-cutoff', 'Ledger capture is from another briefing cutoff; refresh the source evidence.')
    months=issue['analytics']['months']; periods={m['period'] for m in months}
    required_periods={e['financialMonth']} if period_mode else {e['financialMonth'],e['comparisonMonth']}
    check(required_periods<=periods and (not period_mode or periods==required_periods), 'grants.periods', 'Financial rows are missing or outside the requested period.')
    totals={}
    for m in months:
        rs=[r for r in paid if r['paidOutDate'].startswith(m['period'])]
        usd=sum((dec(r['amountUsd']) for r in rs),Decimal(0)); zec=sum((dec(r['zec']) for r in rs),Decimal(0))
        totals[m['period']]=(usd,zec,len(rs))
        check((usd,zec,len(rs))==(dec(m['usd']),dec(m['zec']),m['payments']), 'grants.reconcile', f"Grant totals disagree for {m['period']}.")
        check(m['complete']==(not period_mode and m['period']<cutoff.strftime('%Y-%m')), 'grants.partial', f"Wrong full/partial label for {m['period']}.")
        qid=quality['grantQueries'].get(m['period'])
        if qid: check(snapshot['queries'][qid]['rows']==rs, 'grants.data-view', f'{qid} differs from the captured ledger.')
    closed=[r for r in paid if r['paidOutDate'].startswith(e['financialMonth'])]
    check({c['category'] for c in issue['analytics']['categories']}=={r['category'] for r in closed},'grants.category-universe','Missing or extra grant category.')
    for cat in issue['analytics']['categories']:
        rs=[r for r in closed if r['category']==cat['category']]
        usd=sum((dec(r['amountUsd']) for r in rs),Decimal(0))
        check(usd==dec(cat['usd']) and len(rs)==cat['payments'], 'grants.categories', f"Category mismatch: {cat['category']}.")
        expected=usd/totals[e['financialMonth']][0]*100 if totals[e['financialMonth']][0] else Decimal(0)
        check(abs(expected-dec(cat['share']))<dec('.000001'), 'grants.shares', 'Category denominator or share is wrong.')
    # Exact display bindings catch a stale headline even if source rows were refreshed.
    context={'financialName':close.strftime('%B'),'financialYear':close.year}
    current=totals[e['financialMonth']][0]
    previous=totals[e['comparisonMonth']][0] if not period_mode else None
    mom=(current/previous-1)*100 if previous else None
    check(mom is not None or not any('mom' in b['template'] for b in quality.get('displayBindings',[])), 'grants.undefined-comparison', 'Prior period is zero: replace the percentage comparison with an explicit unavailable comparison.')
    context.update({'closedUsd':current,'closedZec':totals[e['financialMonth']][1],'closedCount':totals[e['financialMonth']][2], 'momMagnitude':abs(mom) if mom is not None else 0,'momVerb':'rose' if mom is not None and mom>=0 else 'fell'})
    context['closedCompact']=(current/1000).quantize(dec('.1'),rounding=ROUND_HALF_UP)
    # Detailed payment displays must reconcile as well as the overview metrics.
    payout_pages=[p for p in pages if p.get('design')=='payouts']
    if payout_pages:
        partial=[r for r in paid if r['paidOutDate'].startswith(e['month'])]
        actual=[(money(r[1]),' '.join(r[2].split())) for p in payout_pages for r in p['rows']]
        expected=[(dec(r['amountUsd']),dt.date.fromisoformat(r['paidOutDate']).strftime('%b %d')) for r in partial]
        check(actual==expected,'grants.payment-table','Displayed installments omit, duplicate or change source amounts/dates across pages.')
        if period_mode:
            ids=[r for p in payout_pages for r in p.get('ledgerIds',[])]
            check(ids==[r['id'] for r in partial], 'grants.payment-identities', 'The paginated register must retain each source ledger ID in order.')
    for p in pages:
        if p.get('design')=='ledger':
            full=[r for r in raw if r.get('isPaid') is True and str(r.get('paidOutDate','')).startswith(e['financialMonth'])]
            if period_mode: full=[r for r in full if e['windowStart']<=r['paidOutDate']<=e['cutoff']]
            check(money(p['rows'][-1][1])==sum(dec(r['amountUsd']) for r in full) and int(p['rows'][-1][2])==len(full),'ledger.display-total','Wider ledger total/count mismatch.')
            check(sum(money(r[1]) for r in p['rows'][:-1])==money(p['rows'][-1][1]) and sum(int(r[2]) for r in p['rows'][:-1])==len(full),'ledger.display-rows','Wider ledger display rows do not sum to total.')
        if p.get('design')=='approvals':check(any('request' in h.lower() for h in p['headers']),'approvals.amount-label','Request amounts must retain their request label.')
    if e['month'] in totals:
        usd,zec,count=totals[e['month']]
        context.update({'partialCompact':(usd/1000).quantize(dec('.1'),rounding=ROUND_HALF_UP),'partialZec':zec,'partialCount':count,'partialLabel':cutoff.strftime('%b ')+f'1–{cutoff.day}, {cutoff.year}'})
        if period_mode:
            context['partialLabel']=window_start.strftime('%b ')+f'{window_start.day}–{cutoff.day}, {cutoff.year}'
            check(all(e['windowStart']<=r['date']<=e['cutoff'] for r in issue['analytics'].get('paymentDates',[])), 'grants.daily-window', 'A payment chart date is outside the requested window.')
            by_date=collections.defaultdict(Decimal)
            for r in paid: by_date[r['paidOutDate']]+=dec(r['amountUsd'])
            check({r['date']:dec(r['usd']) for r in issue['analytics'].get('paymentDates',[])}==dict(by_date), 'grants.daily-reconcile', 'Payment-date chart does not reconcile to the interval ledger.')
    props=issue['analytics']['proposals']; pq=snapshot['queries'][quality['proposalQuery']]['rows']
    check(props==pq, 'requests.data-view', 'Proposal set differs from the reviewed Data query.')
    check(len({p['githubUrl'] for p in props})==len(props), 'requests.unique', 'Duplicate proposal IDs.')
    proposal_total=sum((dec(p['requestedUsd']) for p in props),Decimal(0))
    context.update({'requestedUsd':proposal_total,'proposalCount':len(props)})
    for label,select in [('Under $25k',lambda x:x<25000),('$25k–$150k',lambda x:25000<=x<=150000),('Over $150k',lambda x:x>150000)]:
        rs=[p for p in props if select(dec(p['requestedUsd']))]; bands=[b for b in issue['analytics']['bands'] if b['bandLabel']==label]
        check(len(bands)==1 and dec(bands[0]['usd'])==sum((dec(r['requestedUsd']) for r in rs),Decimal(0)) and bands[0]['count']==len(rs), 'requests.bands', f'Band sum/count differs: {label}.')
    for b in quality.get('displayBindings',[]):
        value=byid[b['pageId']]
        for part in b['path']:value=value[part]
        try: expected=b['template'].format(**context)
        except KeyError as missing:
            check(False,'display.missing-period',f"Display binding needs unavailable period metric: {missing}.")
            continue
        check(value==expected, 'display.stale', f"Stale or inconsistent {b['pageId']}.{b['path']}: expected {expected!r}.")
    req_pages=[p for p in pages if p['section'].startswith('Appendix ·') and 'requests' in p['section']]
    req_rows=[r for p in req_pages for r in p['rows']]
    check([(r[0],r[1],money(r[2])) for r in req_rows]==[(r['project'],r['org'],dec(r['requestedUsd'])) for r in props], 'requests.register', 'Proposal appendix omits, duplicates, or changes a request.')
    if quality['roundState']=='awaiting_vote':
        check(all(re.search(r'awaiting vote',p.get('subtitle',''),re.I) for p in req_pages), 'requests.status', 'Pending requests are missing their voting state.')
        for p in pages:
            if p.get('chart')=='governance-band-chart':check(not re.search(r'\b(approved|paid|awarded)\b',p['title'],re.I), 'requests.claim', 'Requests presented as approved or paid.')
    cov=issue['coverage'];cq=snapshot['queries'][quality['coverageQuery']]['rows']
    check(len({r[0] for r in cov})==len(cov), 'coverage.unique', 'Duplicate community names.')
    check([list(r) for r in cov]==[[r['community'],r['period'],r['coverage'],r['sourceUrl']] for r in cq], 'coverage.data-view', 'Coverage universe differs from reviewed source.')
    cp=[p for p in pages if p['section']=='Appendix · communities']
    check([r for p in cp for r in p['rows']]==[r[:3] for r in cov] and [u for p in cp for u in p['rowlinks']]==[r[3] for r in cov], 'coverage.register', 'Community appendix or source links differ.')
    groups=issue['coverageClassification']
    check([r['name'] for r in groups]==[r[0] for r in cov], 'coverage.classification', 'Coverage classification omits/duplicates names.')
    for p in pages:
        if p.get('design')=='coverage':
            counts=collections.Counter(g['kind'] for g in groups)
            for card,kind in zip(p['cards'],['monthly','update','mixed-or-older','linked','gap']):
                check(card['title'].startswith(str(counts[kind])+' '),'coverage.count','Displayed coverage classification count differs from its register.')
        if p.get('communityMetrics'):
            m=p['communityMetrics'];rows=snapshot['queries']['community']['rows']
            current_rows=[r for r in rows if r['period'] in (m['period'],dt.date.fromisoformat(m['period']+'-01').strftime('%B %Y'))]
            check(len(current_rows)==1 and [str(current_rows[0]['bounties']),str(current_rows[0]['contributors'])]==[a[0] for a in m['metrics']],'community.metrics','Bounty/contributor feature differs from its source query.')
        if p.get('release'):check((not period_mode or e['windowStart']<=p['release']['date']) and p['release']['date']<=e['cutoff'],'release.date','Release date is outside the edition window.')
        if p.get('walletReleases'):check(all(r.get('evidenceState')=='no-update' or (isinstance(r.get('date'),str) and e['windowStart']<=r['date']<=e['cutoff']) for r in p['walletReleases']),'release.wallet-date','Wallet release is outside the edition window.')
    # Validate displayed treasury rows independently, with decimal arithmetic.
    for p in pages:
        if p.get('design')!='treasury':continue
        v=p['valuation']; funds=snapshot['queries'][quality['treasuryQuery']]['rows']
        check(v['balanceAsOf']<=e['cutoff'] and v['quoteAsOf'][:10]==e['cutoff'], 'treasury.dates', 'Treasury balance or quote date is invalid/stale for the cutoff.')
        check('current balance' not in p['title'].lower(), 'treasury.claim', 'Revaluation is presented as a current balance.')
        recomputed=[cents(dec(f['zec'])*dec(v['priceUsd'])) for f in funds]
        check(all(x==dec(f['indicativeUsd']) for x,f in zip(recomputed,funds)), 'treasury.accounts', 'An account valuation is wrong.')
        check(all(f['balanceAsOf']==v['balanceAsOf'] and f['quoteAsOf']==v['quoteAsOf'] and dec(f['priceUsd'])==dec(v['priceUsd']) for f in funds), 'treasury.quote-scope', 'Accounts use different source dates or quotes.')
        zec=sum(dec(f['zec']) for f in funds); usd=sum(recomputed); source=sum(dec(f['sourceUsd']) for f in funds)
        check((zec,usd,source)==(dec(v['zec']),dec(v['indicativeUsd']),dec(v['sourceUsd'])), 'treasury.total', 'Treasury totals do not reconcile.')
        check(usd-source==dec(v['priceOnlyChangeUsd']) and abs(((usd/source-1)*100)-dec(v['priceOnlyChangePct']))<dec('.00001'), 'treasury.price-effect', 'Price-only change is wrong.')
        expected=[[f['account'],f"{dec(f['zec']):.3f}",f"${dec(f['sourceUsd']):,.2f}",f"${new:,.2f}"] for f,new in zip(funds,recomputed)]+[['Total',f'{zec:.3f}',f'${source:,.2f}',f'${usd:,.2f}']]
        check(p['rows']==expected, 'treasury.table', 'Treasury display rows differ from the calculated accounts.')
    # Source index references are derived from actual current page membership.
    expected={}
    for n,p in enumerate(pages,1):
        if p.get('design')!='source-index':
            for k in p.get('sources',[]):expected.setdefault(k,[]).append(n)
    entries=[x for p in pages if p.get('design')=='source-index' for x in p['entries']]
    check({x['key']:x['pages'] for x in entries}==expected and len(entries)==len(expected), 'sources.page-map', 'Source index has stale page references or duplicate entries.')
    # Capture manifests bind PNG bytes and reviewed chart scope, never redraw them here.
    manifest_path=root/'chart-exports.json'
    if manifest_path.exists():
        exports=json.loads(manifest_path.read_text())
        for cid,c in issue['chartDefinitions'].items():
            m=exports.get(cid,{});png=root/'charts'/f'{cid}.png'
            check(m.get('rowsHash')==digest(snapshot['queries'][c['query']]['rows']) and m.get('definitionHash')==digest(c) and png.exists() and m.get('pngSha256')==hashlib.sha256(png.read_bytes()).hexdigest(), 'charts.capture', f'{cid}: native capture no longer matches reviewed scope.')
    elif final:check(False,'charts.capture','Native chart capture manifest missing.')
    if final:
        path=root/'quality-review.json'
        review=json.loads(path.read_text()) if path.exists() else {}
        check(review.get('issueHash')==digest(issue), 'review.issue', 'Issue changed after editorial/visual review, or review is missing.')
        for p in pages:
            status=review.get('pages',{}).get(p['id'],{})
            check(status.get('hash')==digest(p) and status.get('editorial')=='passed' and status.get('visual')=='passed', 'review.page', f"Page not signed off: {p['id']}.")
        check(review.get('snapshotHash')==digest(snapshot),'review.snapshot','Reviewed snapshot changed after approval.')
        renderer=Path(__file__).with_name('render_pdf.py')
        check(review.get('rendererSha256')==hashlib.sha256(renderer.read_bytes()).hexdigest(),'review.renderer','Renderer changed after visual review.')
    return {'ok':not errors,'checkCount':len(checks),'checks':dict(collections.Counter(checks)),'errors':errors,'issueHash':digest(issue),'derived':{k:str(v) for k,v in context.items()}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--issue-dir',type=Path,required=True)
    parser.add_argument('--snapshot',type=Path)
    parser.add_argument('--final',action='store_true')
    args=parser.parse_args();root=args.issue_dir.resolve()
    issue=json.loads((root/'report-content.json').read_text());snapshot=json.loads((args.snapshot or root/'evidence-snapshot.json').read_text())
    result=validate(issue,snapshot,root,final=args.final)
    (root/'quality-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'ok':result['ok'],'checkCount':result.get('checkCount'), 'errors':result['errors']},ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['ok'] else 1)
if __name__=='__main__':main()
