"""Create dated, clearly labeled UI samples; not a monthly production export."""
import argparse, copy, hashlib, io, json, subprocess
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir',type=Path,required=True)
SOURCE=parser.parse_args().source_dir.resolve()
DATA = json.loads((SOURCE / 'report-content.json').read_text())
PDF = PdfReader(SOURCE / 'OpenZcash-Monthly-September-01-10-2026.pdf')
OLD = json.loads((ROOT / 'public/monthly/editions/2026-09-01-to-10/e4f57c352cd0/pages.json').read_text())
OUT = ROOT / 'public/monthly/preview'
OUT.mkdir(parents=True, exist_ok=True)
FONTS = Path('/System/Library/Fonts/Supplemental')
for name, file, sub in [('A','GillSans.ttc',0),('B','GillSans.ttc',4),('D','DIN Condensed Bold.ttf',0)]:
    pdfmetrics.registerFont(TTFont(name,str(FONTS/file),subfontIndex=sub))
PAPER, INK, GOLD, GREEN = '#f7f5ef', '#171917', '#efb92f', '#325c4e'

def text(c,x,y,s,size=20,font='A',color=INK):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,y,s)

def new_page(kind, number, cover=False):
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=(1200,675))
    accent = GOLD if kind == 'monthly' else GREEN
    c.setFillColor(HexColor(PAPER)); c.rect(0,0,1200,675,fill=1,stroke=0)
    if cover:
        c.setFillColor(HexColor(INK)); c.rect(0,0,815,675,fill=1,stroke=0)
        c.setFillColor(HexColor(accent)); c.rect(815,0,385,675,fill=1,stroke=0)
        text(c,52,620,'OPENZCASH  /  SEPTEMBER 2026',16,'B',PAPER)
        if kind=='monthly':
            text(c,47,402,'MONTHLY',150,'D',PAPER)
            text(c,53,338,'Teams. Funding. Communities.',30,'A',PAPER)
            metrics=[('$218.5k','grant payments'),('12','paid installments'),('14','sample pages')]
        else:
            text(c,47,444,'VOTER',137,'D',PAPER)
            text(c,49,309,'SUPPLEMENT',112,'D',PAPER)
            metrics=[('NU7','advisory polls'),('Q3','grant review'),('04','sample pages')]
        for i,(value,label) in enumerate(metrics):
            x=53+i*246
            c.setStrokeColor(HexColor('#5a6057')); c.line(x,237,x+209,237)
            text(c,x,166,value,55,'D',PAPER); text(c,x,129,label,20,'A',PAPER)
        right=INK if kind=='monthly' else PAPER
        text(c,850,619,'ISSUE 09 / 2026',16,'B',right)
        if kind=='monthly':
            c.setFillColor(HexColor(INK));c.circle(1006,478,93,stroke=0,fill=1)
            c.drawImage(str(SOURCE/'brand-assets/zcash.png'),926,398,width=160,height=160,mask='auto')
        else:
            c.setStrokeColor(HexColor(right));c.setLineWidth(4);c.circle(1006,478,84,stroke=1,fill=0)
            c.setLineWidth(6); c.lines([(969,480,995,454),(995,454,1045,510)])
        text(c,850,191,'09',119,'D',right)
        text(c,853,122,'SEP 1-10',25,'B',right)
        text(c,853,91,'Dated reference sample',17,'A',right)
        text(c,53,51,'LAYOUT PREVIEW  /  SELECTED SEPTEMBER 1-10 CONTENT',14,'B','#d4c27e')
    else:
        text(c,49,631,'OPENZCASH',13,'B');text(c,148,631,'MONTHLY' if kind=='monthly' else 'VOTER SUPPLEMENT',13)
        text(c,1123,631,f'{number:02d}',17,'D');c.setStrokeColor(HexColor('#797f76'));c.line(49,614,1150,614)
        title='A short read. A complete evidence trail.' if kind=='monthly' else 'Go to the original decision.'
        text(c,49,536,title,52,'D')
        text(c,49,492,'Reference snapshot: September 1-10, 2026',22,'A','#63695f')
        rows = [
            ('SOURCES & DATA','Search the full source index, community coverage and Q3 request register.'),
            ('READ THE FULL REFERENCE','The original 44-page edition retains the complete published context.'),
            ('ABOUT THIS SAMPLE','Selected pages demonstrate the proposed interface. This is not a new monthly close.'),
        ] if kind=='monthly' else [
            ('CHECK ELIGIBILITY','ZCAP and Coinholder participation rules are separate. Follow the official process.'),
            ('READ THE PROPOSALS','Review requested funding, scope and supporting evidence before forming a view.'),
            ('VERIFY DATES AND STATUS','Dates describe the September 10 snapshot. Advisory signals are not protocol activation.'),
            ('OPEN SOURCES & DATA','Use the complete Q3 register and original voting notices linked in the reader.'),
        ]
        for i,(heading,body) in enumerate(rows):
            y=407-i*92
            text(c,49,y,heading,17,'B',GREEN if kind=='voter' else '#986b10')
            text(c,49,y-32,body,21)
        text(c,49,44,'LAYOUT SAMPLE  /  HISTORICAL SOURCE CUTOFF: SEPTEMBER 10, 2026',13,'B','#697065')
    c.showPage();c.save();return PdfReader(buf).pages[0]

def sampled_page(old, number, kind):
    page=copy.copy(PDF.pages[old-1])
    # Preserve external citations; an excerpt cannot retain old internal destinations.
    page[NameObject('/Annots')]=ArrayObject([a for a in page.get('/Annots',[]) if a.get_object().get('/A',{}).get('/URI')])
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(1200,675))
    c.setFillColor(HexColor(PAPER));c.rect(1106,632,61,30,fill=1,stroke=0)
    text(c,1123,637,f'{number:02d}',17,'D','#697065')
    if kind=='voter':
        c.setFillColor(HexColor(PAPER));c.rect(137,632,209,27,fill=1,stroke=0)
        text(c,143,639,'VOTER SUPPLEMENT',12,'A',GREEN)
    c.showPage();c.save();page.merge_page(PdfReader(buf).pages[0]);return page

catalog={}
for kind,selection in [('monthly',[None,3,4,5,6,10,7,11,15,17,20,24,23,None]),('voter',[None,21,22,None])]:
    dest=OUT/kind;dest.mkdir(exist_ok=True)
    writer=PdfWriter();manifest=[]
    for i,old in enumerate(selection,1):
        page=sampled_page(old,i,kind) if old else new_page(kind,i,cover=i==1)
        writer.add_page(page)
        if old:
            m=copy.deepcopy(OLD[old-1]);m['links']=[x for x in m['links'] if 'url' in x]
        else:
            m={'title':('OPENZCASH MONTHLY' if kind=='monthly' else 'VOTER SUPPLEMENT') if i==1 else ('Sources & methodology' if kind=='monthly' else 'Official processes and evidence'),'section':'Overview' if i==1 else 'Sources','links':[],'text':page.extract_text()}
        m['number']=i
        if kind=='monthly' and i in (5,7): m['section']='Build' if i==5 else 'Wallets'
        manifest.append(m);writer.add_outline_item(m['title'],i-1)
    filename=f'OpenZcash-{kind.title()}-Layout-Sample.pdf';p=dest/filename
    writer.add_metadata({'/Title':f'OpenZcash {kind.title()} - UI layout sample','/Subject':'Selected September 1-10, 2026 content. Not a new monthly close.','/Author':'OpenZcash'})
    with p.open('wb') as f: writer.write(f)
    subprocess.run(['pdftoppm','-scale-to','360','-jpeg','-jpegopt','quality=86',str(p),str(dest/'page')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for i in range(1,len(selection)+1):
        src=dest/f'page-{i:0{len(str(len(selection)))}d}.jpg'
        src.rename(dest/f'page-{i:03d}.jpg')
    (dest/'pages.json').write_text(json.dumps(manifest))
    base=f'/monthly/preview/{kind}';blob=p.read_bytes()
    catalog[kind]={'id':'2026-09-01-to-10','month':'2026-09','label':'Sep 1-10','kind':'period','periodStart':'2026-09-01','periodEnd':'2026-09-10','financialMonth':'2026-09','designVersion':'Editorial 3.7 / UI sample','pdf':f'{base}/{filename}','cover':f'{base}/page-001.jpg','manifest':f'{base}/pages.json','assetBase':base,'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'pageCount':len(selection),'pageWidth':1200,'pageHeight':675}
    assert len(PdfReader(p).pages)==len(selection)
sources=[{'name':v[0],'detail':v[1].split('/')[2],'url':v[1]} for v in DATA['sources'].values()]
communities=[{'name':v[0],'detail':v[1]+' | '+v[2],'url':v[3]} for v in DATA['coverage']]
requests=[{'name':v['project'],'detail':v['org'],'url':v['githubUrl'] or v['threadUrl'],'amount':v['requestedUsd']} for v in DATA['analytics']['proposals']]
bundle={'documents':catalog,'sources':sources,'communities':communities,'requests':requests}
(ROOT/'src/components/monthly/bundle-preview-data.json').write_text(json.dumps(bundle,indent=2)+'\n')
print(json.dumps({'documents':{k:v['pageCount'] for k,v in catalog.items()},'sources':len(sources),'communities':len(communities),'requests':len(requests)}))
