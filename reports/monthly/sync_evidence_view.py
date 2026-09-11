"""Synchronize authored report content with its existing Data evidence app."""
import argparse, json, datetime
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--issue-dir',type=Path,required=True)
parser.add_argument('--app-dir',type=Path,required=True)
parser.add_argument('--status',choices=['updating','complete'],default='updating')
args=parser.parse_args();root=args.issue_dir
d=json.loads((root/'report-content.json').read_text());path=args.app_dir/'src/data.json';s=json.loads(path.read_text())
assert s['id'] and s['surface']=='report', 'Revise the existing report, preserving identity.'
for n,p in enumerate(d['pages'],1):
    q=s['queries'][p['id']]
    q['rows']=[{'page':n,'title':p['title'],'section':p['section'],'content':json.dumps(p,ensure_ascii=False)}]
    q['source']['links']=[{'label':d['sources'][k][0],'url':d['sources'][k][1]} for k in p.get('sources',[])]
    if p.get('provenanceNote'):q['source']['caveats']=[p['provenanceNote']]
    if p.get('tableQueryId'):
        table=s['queries'][p['tableQueryId']]
        table['rows']=[{f'c{i}':value for i,value in enumerate(row)} for row in p['rows']]
        table['source']['links']=q['source']['links']
s['report']['editorialRevision']=d['design']['version'];s['buildStatus']=args.status
s['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
# Never change source execution timestamps, query measurements or presentation state.
for out,obj in [(path,s),(args.app_dir/'src/content/report/monthly.json',d),(root/'evidence-snapshot.json',s)]:
    out.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
print('Synchronized stable section IDs; source measurements and capture timestamps retained.')
