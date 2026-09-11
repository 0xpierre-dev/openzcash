from pathlib import Path
import json,re,shutil,hashlib,argparse,datetime,html
from pypdf import PdfReader
parser=argparse.ArgumentParser(description='Build the fixed-page preview from an approved monthly PDF.')
parser.add_argument('--issue-dir',type=Path,required=True)
parser.add_argument('--viewer-dir',type=Path,required=True)
parser.add_argument('--pdfjs-dir',type=Path,required=True)
args=parser.parse_args();R=args.issue_dir.resolve();V=args.viewer_dir.resolve();V.mkdir(parents=True,exist_ok=True)
d=json.loads((R/'report-content.json').read_text());month=datetime.date.fromisoformat(d['edition']['month']+'-01');cutoff=datetime.date.fromisoformat(d['asOf']);filename=d['edition'].get('filename',f'OpenZcash-Monthly-{month:%B-%Y}.pdf');pdf=PdfReader(R/filename);ids={p.indirect_reference.idnum:i for i,p in enumerate(pdf.pages)}

assets=V/'monthly';assets.mkdir(exist_ok=True)
manifest=[]
for i,p in enumerate(pdf.pages):
 shutil.copy2(R/'render'/f'page-{i+1:02}.png',assets/f'page-{i+1:02}.png');links=[]
 for ref in p.get('/Annots',[]):
  a=ref.get_object();r=[float(x) for x in a['/Rect']];ln=dict(x=r[0]/1200,y=(675-r[3])/675,w=(r[2]-r[0])/1200,h=(r[3]-r[1])/675)
  if a.get('/A',{}).get('/URI'):ln['url']=str(a['/A']['/URI']);ln['label']='Open source'
  elif '/Dest' in a:
   dest=a['/Dest'];ln['page']=ids[dest[0].idnum];ln['label']='Jump to '+d['pages'][ln['page']]['section']
  else:continue
  links.append(ln)
 manifest.append(dict(title=d['pages'][i]['title'].replace('\n',' '),section=d['pages'][i]['section'],alt=p.extract_text().replace('\n',' '),links=links))
shutil.copy2(R/filename,assets/filename)
old=(V/'index.html').read_text() if (V/'index.html').exists() else '';backup=R/'previous-collection-viewer.html'
if not backup.exists():backup.write_text(old)
css=(Path(__file__).parent/'viewer.css').read_text()
head='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{REPORT_TITLE}}</title><style>'''+css+'''</style></head><body><div class="app">
<header class="toolbar"><div class="identity"><span class="brand" aria-hidden="true">OZ</span><div><div class="name">OpenZcash Monthly</div><div class="date">{{REPORT_DATE}}</div></div></div><div class="navigation" aria-label="Page navigation"><button id="previous" class="arrow" aria-label="Previous page">‹</button><label class="count"><select id="slide-select" aria-label="Go to page"></select><span>/ {{PAGE_COUNT}}</span></label><button id="next" class="arrow" aria-label="Next page">›</button></div><div class="actions"><button id="fullscreen" class="fullscreen" aria-label="Enter full screen">⛶</button><a class="download primary" href="monthly/{{PDF_FILENAME}}" download>Download PDF</a></div></header>
<nav class="section-bar" aria-label="Report sections"><label for="section-select">Section</label><select id="section-select"></select><a class="evidence-view" href="data/monthly-series/?view=1&amp;edition=3" target="_blank" rel="noopener">Evidence &amp; sources</a><span class="issue-note">One monthly report · {{PAGE_COUNT}} pages</span></nav>
<main class="workspace" aria-label="OpenZcash Monthly report"><nav class="thumb-panel" aria-label="Page thumbnails"><div id="thumbnails" class="thumb-list"></div><div class="thumb-pager"><button id="thumb-prev" aria-label="Previous thumbnails">‹</button><span id="thumb-range"></span><button id="thumb-next" aria-label="Next thumbnails">›</button></div></nav><section class="stage" aria-label="Report page"><div class="slide-canvas" id="page-frame" aria-busy="true"></div></section></main>
<div id="announcement" class="sr-only" aria-live="polite"></div></div><script type="module">'''
revision=hashlib.sha256((R/filename).read_bytes()).hexdigest()[:12]
script='const pdfFilename='+json.dumps(filename)+';const revision='+json.dumps(revision)+';const pages='+json.dumps(manifest,ensure_ascii=False).replace('</','<\\/')+';\n'+(Path(__file__).parent/'viewer.mjs').read_text()
date_label=month.strftime('%B %Y')+' · as of '+cutoff.strftime('%b ')+str(cutoff.day)
if d['edition'].get('mode')=='period':
 start=datetime.date.fromisoformat(d['edition']['windowStart'])
 date_label=start.strftime('%b ')+f'{start.day}–{cutoff.day}, {cutoff.year} · Partial period'
head=head.replace('{{REPORT_TITLE}}',html.escape(d['title'])).replace('{{REPORT_DATE}}',date_label).replace('{{PDF_FILENAME}}',filename).replace(filename+'" download',filename+'?v='+revision+'" download').replace('/ {{PAGE_COUNT}}</span>','/ '+str(len(manifest))+'</span>').replace('{{PAGE_COUNT}} pages',str(len(manifest))+' pages')

(V/'index.html').write_text(head+script+'</script></body></html>');(R/'viewer-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('Unified viewer ready:',len(manifest),'pages, one PDF download')

PDFJS=args.pdfjs_dir
(V/"pdfjs").mkdir(exist_ok=True)
for file in ["pdf.min.mjs","pdf.worker.min.mjs"]:shutil.copy2(PDFJS/"build"/file,V/"pdfjs"/file)
for folder in ["standard_fonts","wasm"]:shutil.copytree(PDFJS/folder,V/"pdfjs"/folder,dirs_exist_ok=True)
shutil.copy2(PDFJS/"LICENSE",V/"pdfjs/LICENSE")
