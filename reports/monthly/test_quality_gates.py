"""Regression checks based on real report failure modes; all mutations stay in memory/temp."""
import argparse, copy, json, subprocess, sys, tempfile, unittest
from pathlib import Path
from validate_issue import validate, duplicate_claims, prior_month

parser=argparse.ArgumentParser();parser.add_argument('--issue-dir',type=Path,required=True)
args,rest=parser.parse_known_args();ROOT=args.issue_dir.resolve()
ISSUE=json.loads((ROOT/'report-content.json').read_text());SNAPSHOT=json.loads((ROOT/'evidence-snapshot.json').read_text())

class QualityGates(unittest.TestCase):
    def setUp(self):self.d=copy.deepcopy(ISSUE);self.s=copy.deepcopy(SNAPSHOT)
    def page(self,design):return next(p for p in self.d['pages'] if p.get('design')==design)
    def errors(self):return {e['code'] for e in validate(self.d,self.s,ROOT)['errors']}
    def test_reviewed_issue_reconciles(self):self.assertEqual(self.errors(),set())
    def test_original_compact_exact_subtitle_repetition(self):
        self.assertTrue(duplicate_claims('$168.5k paid so far in September','Sep 1–10 · $168,450.00 / 192.550 ZEC'))
    def test_stale_headline_after_source_refresh(self):
        b=next(b for b in self.d['quality']['displayBindings'] if b['path']==['title']);next(p for p in self.d['pages'] if p['id']==b['pageId'])['title']='$100.0k in grant payments';self.assertIn('display.stale',self.errors())
    def test_wrong_grant_total(self):
        next(m for m in self.d['analytics']['months'] if m['period']==self.d['edition']['financialMonth'])['usd']+=1;self.assertIn('grants.reconcile',self.errors())
    def test_changed_partial_installment(self):
        self.page('payouts')['rows'][0][1]='$2,501.00';self.assertIn('grants.payment-table',self.errors())
    def test_missing_category(self):
        self.d['analytics']['categories'].pop();self.assertIn('grants.category-universe',self.errors())
    def test_partial_month_cannot_be_a_close(self):
        next(m for m in self.d['analytics']['months'] if m['period']==self.d['edition']['month'])['complete']=True;self.assertIn('grants.partial',self.errors())
    def test_next_month_cannot_reuse_old_sources(self):
        self.d['edition'].update(month='2026-10',financialMonth='2026-09',comparisonMonth='2026-08',cutoff='2026-10-10',windowStart='2026-09-01')
        self.d['asOf']=self.d['quality']['sourceCutoff']=self.s['report']['asOf']='2026-10-10'
        self.assertIn('source.capture-cutoff',self.errors())
    def test_missing_community(self):
        next(p for p in self.d['pages'] if p['section']=='Appendix · communities')['rows'].pop();self.assertIn('coverage.register',self.errors())
    def test_missing_proposal(self):
        next(p for p in self.d['pages'] if p['section']=='Appendix · Q3 requests')['rows'].pop();self.assertIn('requests.register',self.errors())
    def test_requested_is_not_paid(self):
        next(p for p in self.d['pages'] if p.get('chart')=='governance-band-chart')['title']='Q3 funding paid to applicants';self.assertIn('requests.claim',self.errors())
    def test_stale_quote(self):
        self.page('treasury')['valuation']['quoteAsOf']='2026-08-05T21:21:30Z';self.assertIn('treasury.dates',self.errors())
    def test_treasury_cent_error(self):
        self.page('treasury')['valuation']['indicativeUsd']+=.01;self.assertIn('treasury.total',self.errors())
    def test_changed_chart_scope(self):
        self.d['chartDefinitions'][next(iter(self.d['chartDefinitions']))]['spec']['startAtZero']=False;self.assertIn('charts.capture',self.errors())
    def test_review_invalidated_by_copy_change(self):
        self.d['pages'][1]['title']='Changed after review'
        result=validate(self.d,self.s,ROOT,final=True)
        self.assertIn('review.issue',{e['code'] for e in result['errors']})
    def test_january_comparison(self):self.assertEqual(prior_month('2027-01'),'2026-12')
    def test_renderer_rejects_real_text_overflow(self):
        page=self.page('regional');page['title']='This headline is too long to fit on one slide. '*35
        self.s['queries'][page['id']]['rows'][0]['content']=json.dumps(page)
        with tempfile.TemporaryDirectory(prefix='openzcash-layout-') as temp:
            root=Path(temp)
            for child in ROOT.iterdir():
                if child.name not in ('report-content.json','evidence-snapshot.json'):(root/child.name).symlink_to(child,target_is_directory=child.is_dir())
            (root/'report-content.json').write_text(json.dumps(self.d))
            (root/'evidence-snapshot.json').write_text(json.dumps(self.s))
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('render_pdf.py')),'--issue-dir',str(root),'--output',str(root/'overflow.pdf'),'--draft'],text=True,capture_output=True)
            self.assertNotEqual(result.returncode,0);self.assertIn('paragraph overflow',result.stderr)
    def test_renderer_contains_no_frozen_issue_literals(self):
        source=Path(__file__).with_name('render_pdf.py').read_text()+Path(__file__).with_name('viewer.mjs').read_text()
        for stale in ['September 2026','AUG 1–SEP 10','1.4.0','3.11.0','0.0.54','117.4%','582.4k']:
            self.assertNotIn(stale,source)


@unittest.skipUnless(ISSUE['edition'].get('mode')=='period','Requires an explicit partial-period issue')
class PartialPeriodGates(unittest.TestCase):
    setUp = QualityGates.setUp
    page = QualityGates.page
    errors = QualityGates.errors
    def test_complete_month_comparison_is_rejected(self):
        self.d['edition']['comparisonMonth']='2026-08'
        self.assertIn('period.comparison',self.errors())
    def test_partial_flag_is_required(self):
        self.d['edition']['partial']=False
        self.assertIn('period.partial-label',self.errors())
    def test_reversed_interval_is_rejected(self):
        self.d['edition']['windowStart']='2026-09-11'
        self.assertIn('period.range',self.errors())
    def test_lower_bound_is_applied_to_payments(self):
        self.d['edition']['windowStart']='2026-09-02'
        self.assertIn('grants.reconcile',self.errors())
    def test_upper_bound_is_applied_to_payments(self):
        self.d['edition']['cutoff']='2026-09-09'
        self.assertIn('grants.reconcile',self.errors())
    def test_duplicate_paginated_payment_is_rejected(self):
        p=self.page('payouts');p['rows'].append(p['rows'][0]);p['ledgerIds'].append(p['ledgerIds'][0])
        self.assertIn('grants.payment-identities',self.errors())
    def test_daily_chart_cannot_include_another_date(self):
        self.d['analytics']['paymentDates'][0]['date']='2026-08-31'
        self.assertIn('grants.daily-window',self.errors())
    def test_daily_chart_must_match_ledger(self):
        self.d['analytics']['paymentDates'][0]['usd']+=1
        self.assertIn('grants.daily-reconcile',self.errors())
    def test_prior_release_is_rejected(self):
        self.page('zakura')['release']['date']='2026-08-31'
        self.assertIn('release.date',self.errors())
    def test_future_release_is_rejected(self):
        self.page('zakura')['release']['date']='2026-09-11'
        self.assertIn('release.date',self.errors())

@unittest.skipUnless(ISSUE['quality'].get('schemaVersion',0)>=3,'Requires the four-wallet production standard')
class CoreWalletGates(unittest.TestCase):
    setUp=QualityGates.setUp
    page=QualityGates.page
    errors=QualityGates.errors
    def released_wallet(self):
        available=[r for r in self.page('wallets')['walletReleases'] if r.get('evidenceState')!='no-update']
        if not available:self.skipTest('This issue has no verified in-period release.')
        return available[0]
    def test_missing_core_wallet_is_rejected(self):
        self.page('wallets')['walletReleases'].pop();self.assertIn('wallets.roster',self.errors())
    def test_fifth_wallet_is_rejected(self):
        p=self.page('wallets');p['walletReleases'].append(dict(p['walletReleases'][0],name='Extra wallet'));self.assertIn('wallets.roster',self.errors())
    def test_wallet_order_is_fixed(self):
        self.page('wallets')['walletReleases'].reverse();self.assertIn('wallets.roster',self.errors())
    def test_wallet_slide_position_is_fixed(self):
        self.d['pages'][6],self.d['pages'][7]=self.d['pages'][7],self.d['pages'][6];self.assertIn('wallets.position',self.errors())
    def test_grid_layout_is_required(self):
        self.page('wallets')['walletLayout']='columns';self.assertIn('wallets.layout',self.errors())
    def test_prior_period_release_cannot_be_a_new_update(self):
        import datetime
        self.released_wallet()['date']=(datetime.date.fromisoformat(self.d['edition']['windowStart'])-datetime.timedelta(days=1)).isoformat()
        self.assertIn('release.wallet-date',self.errors())
    def test_source_prerelease_cannot_be_labelled_stable(self):
        r=self.released_wallet();records=json.loads((ROOT/r['sourceFile']).read_text())
        release=copy.deepcopy(next(x for x in records if x['tag_name']==r['sourceTag']));release['prerelease']=True
        with tempfile.TemporaryDirectory(prefix='openzcash-wallet-state-') as temp:
            source=Path(temp)/'releases.json';source.write_text(json.dumps([release]))
            r.update(sourceFile=str(source),state='Stable')
            self.assertIn('wallets.release-state',self.errors())
    def test_unverified_version_is_rejected(self):
        self.released_wallet()['version']='999.0';self.assertIn('wallets.release-source',self.errors())
    def test_unavailable_slot_cannot_reuse_old_version(self):
        r=self.page('wallets')['walletReleases'][0];r.update(evidenceState='no-update',state='No verified update',version='0.0.0-previous')
        self.assertIn('wallets.unavailable',self.errors())
    def test_unavailable_slot_remains_supported(self):
        r=self.page('wallets')['walletReleases'][0];r.update(evidenceState='no-update',state='No verified update',version=None,date=None)
        self.assertFalse({e for e in self.errors() if e.startswith('wallets.') or e=='release.wallet-date'})

unittest.main(argv=[sys.argv[0],*rest])
