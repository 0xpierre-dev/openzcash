"""Create dated, clearly labeled UI samples; not a monthly production export."""
import argparse, copy, hashlib, io, json, math, subprocess
from decimal import Decimal
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
PROPOSALS = sorted(DATA['analytics']['proposals'], key=lambda proposal: proposal['project'].casefold())
REQUESTED = sum(Decimal(str(proposal['requestedUsd'])) for proposal in PROPOSALS)
assert len(PROPOSALS) == 37 and REQUESTED == Decimal('9014383.20')
assert len({proposal['githubUrl'] or proposal['threadUrl'] for proposal in PROPOSALS}) == len(PROPOSALS)
proposal_groups = []
offset = 0
for remaining_pages in range(4, 0, -1):
    count = math.ceil((len(PROPOSALS) - offset) / remaining_pages)
    proposal_groups.append(PROPOSALS[offset:offset + count])
    offset += count

def plain(value):
    return str(value).replace('\u2014', '-').replace('\u2013', '-').replace('\u2011', '-')

def text(c,x,y,s,size=20,font='A',color=INK):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,y,plain(s))

def cover_page(kind):
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=(1200,675))
    accent = GOLD if kind == 'monthly' else GREEN
    c.setFillColor(HexColor(INK)); c.rect(0,0,815,675,fill=1,stroke=0)
    c.setFillColor(HexColor(accent)); c.rect(815,0,385,675,fill=1,stroke=0)
    text(c,52,620,'OPENZCASH  /  SEPTEMBER 2026',16,'B',PAPER)
    if kind=='monthly':
        text(c,47,402,'MONTHLY',150,'D',PAPER)
        text(c,53,338,'Teams. Funding. Communities.',30,'A',PAPER)
        metrics=[('$218.5k','grant payments'),('12','paid installments'),('4','featured wallets')]
    else:
        text(c,47,444,'VOTER',137,'D',PAPER)
        text(c,49,309,'SUPPLEMENT',112,'D',PAPER)
        metrics=[(str(len(PROPOSALS)),'grant requests'),(f'${REQUESTED / 1_000_000:.2f}m','requested funding'),('Sep 14','NU7 polls close')]
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
    text(c,53,51,'LAYOUT PREVIEW  /  SEPTEMBER 1-10, 2026',14,'B','#d4c27e')
    c.showPage();c.save();return PdfReader(buf).pages[0]

def proposal_page(rows, number, start):
    """Keep every request readable and directly linked in both PDF and canvas reader."""
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(1200,675));links=[]
    c.setFillColor(HexColor(PAPER));c.rect(0,0,1200,675,fill=1,stroke=0)
    text(c,49,639,'OPENZCASH',13,'B');text(c,148,639,'VOTER SUPPLEMENT',12,'A',GREEN)
    text(c,1013,639,'Q3 / 2026',13,'B',GREEN);text(c,1123,637,f'{number:02d}',17,'D','#697065')
    c.setStrokeColor(HexColor('#797f76'));c.setLineWidth(1);c.line(49,617,1150,617)
    text(c,49,568,'Coinholder grant proposals',48,'D')
    text(c,49,538,f'${REQUESTED:,.2f} requested across {len(PROPOSALS)} proposals. Unawarded at Sep 10.',20,'A','#63695f')
    text(c,49,508,'Review closes Sep 16, 20:00 UTC  /  Voting opens Sep 17',16,'A',GREEN)
    text(c,912,508,f'{start:02d}-{start+len(rows)-1:02d} OF {len(PROPOSALS)}  /  A-Z',15,'B',GREEN)

    def link(url,rect,label):
        x0,y0,x1,y1=rect
        c.linkURL(url,rect,relative=0,thickness=0)
        links.append({'url':url,'label':label,'x':x0/1200,'y':(675-y1)/675,'w':(x1-x0)/1200,'h':(y1-y0)/675})
    link(DATA['sources']['round'][1],(49,503,515,525),'Read the official Q3 review and voting schedule')
    text(c,49,480,'PROJECT / SCOPE',13,'B','#63695f')
    text(c,742,480,'APPLICANT',13,'B','#63695f')
    text(c,1043,480,'USD REQUESTED',13,'B','#63695f')
    c.setStrokeColor(HexColor('#a8afa6'));c.line(49,469,1150,469)
    for i,proposal in enumerate(rows):
        top=469-i*44
        project,scope,org=map(plain,(proposal['project'],proposal['summary'],proposal['org']))
        # "Award" in an applicant's description must not imply this request was approved.
        if proposal['githubUrl'].endswith('/58'):
            scope='Request for five critical Zebra consensus-divergence disclosures; $100,000 already paid'
        for value,font,size,width in [(project,'B',18,650),(scope,'A',15.5,650),(org,'A',16,215)]:
            assert pdfmetrics.stringWidth(value,font,size) <= width, f'Row needs editorial layout review: {value}'
        text(c,49,top-18,project,18,'B',GREEN)
        text(c,49,top-36,scope,15.5,'A','#555d53')
        text(c,742,top-26,org,16)
        amount=Decimal(str(proposal['requestedUsd']))
        value=f'${amount:,.0f}' if amount == amount.to_integral() else f'${amount:,.2f}'
        c.setFont('B',20);c.setFillColor(HexColor(INK));c.drawRightString(1150,top-26,value)
        # A small external-link mark is the visible affordance for each proposal.
        x=49+pdfmetrics.stringWidth(project,'B',18)+9;y=top-14
        c.setStrokeColor(HexColor(GREEN));c.setLineWidth(1)
        c.lines([(x,y-3,x+8,y+5),(x+2,y+5,x+8,y+5),(x+8,y+5,x+8,y-1)])
        link(proposal['githubUrl'] or proposal['threadUrl'],(49,top-41,706,top-2),f"Read proposal: {proposal['project']}")
        c.setStrokeColor(HexColor('#d2d5cc'));c.setLineWidth(.65);c.line(49,top-44,1150,top-44)
    c.showPage();c.save()
    page=PdfReader(buf).pages[0]
    return page, {'title':f'Q3 proposals {start:02d}-{start+len(rows)-1:02d}', 'section':'Grant proposals', 'links':links, 'text':page.extract_text()}

def sampled_page(old, number, kind):
    page=copy.copy(PDF.pages[old-1])
    # Preserve external citations; an excerpt cannot retain old internal destinations.
    page[NameObject('/Annots')]=ArrayObject([a for a in page.get('/Annots',[]) if a.get_object().get('/A',{}).get('/URI')])
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(1200,675))
    dark=DATA['pages'][old-1].get('layout')=='event'
    c.setFillColor(HexColor(INK if dark else PAPER));c.rect(1106,632,61,30,fill=1,stroke=0)
    text(c,1123,637,f'{number:02d}',17,'D',PAPER if dark else '#697065')
    if kind=='voter':
        c.setFillColor(HexColor(PAPER));c.rect(137,632,209,27,fill=1,stroke=0)
        text(c,143,639,'VOTER SUPPLEMENT',12,'A',GREEN)
    c.showPage();c.save();page.merge_page(PdfReader(buf).pages[0]);return page

catalog={}
for kind,selection in [('monthly',[None,3,4,5,6,10,7,11,15,17,20,24,23]),('voter',[None,21,*proposal_groups])]:
    dest=OUT/kind;dest.mkdir(exist_ok=True)
    writer=PdfWriter();manifest=[]
    for i,old in enumerate(selection,1):
        if isinstance(old,list):
            start=1+sum(len(group) for group in proposal_groups[:i-3])
            page,m=proposal_page(old,i,start)
        elif old:
            page=sampled_page(old,i,kind)
            m=copy.deepcopy(OLD[old-1]);m['links']=[x for x in m['links'] if 'url' in x]
        else:
            page=cover_page(kind)
            m={'title':'OPENZCASH MONTHLY' if kind=='monthly' else 'VOTER SUPPLEMENT','section':'Overview','links':[],'text':page.extract_text()}
        writer.add_page(page)
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
    for image in dest.glob('page-*.jpg'):
        if int(image.stem.split('-')[-1]) > len(selection): image.unlink()
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
