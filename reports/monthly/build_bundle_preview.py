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
parser.add_argument('--preview-origin', default='http://127.0.0.1:4193')
args=parser.parse_args()
SOURCE=args.source_dir.resolve()
PREVIEW_ORIGIN=args.preview_origin.rstrip('/')
DATA = json.loads((SOURCE / 'report-content.json').read_text())
ZCG = json.loads((ROOT / 'reports/monthly/zcg-preview-data.json').read_text())
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
        text(c,53,338,'Engineering. Wallets. Products.',30,'A',PAPER)
        metrics=[('4','team briefs'),('4','core wallet updates'),('6','product announcements')]
    else:
        text(c,47,402,'OPERATIONS',126,'D',PAPER)
        text(c,53,338,'Funding. Decisions. Communities.',29,'A',PAPER)
        metrics=[('$218.5k','grant payments'),(str(len(ZCG['requests'])),'ZCG under review'),(str(len(PROPOSALS)),'Coinholder requests')]
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
    text(c,49,639,'OPENZCASH',13,'B');text(c,148,639,'OPERATIONS',12,'A',GREEN)
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
    return page, {'title':f'Coinholder proposals {start:02d}-{start+len(rows)-1:02d}', 'section':'Coinholder proposals', 'links':links, 'text':page.extract_text()}

def add_link(c, links, url, rect, label):
    x0,y0,x1,y1=rect
    c.linkURL(url,rect,relative=0,thickness=0)
    links.append({'url':url,'label':label,'x':x0/1200,'y':(675-y1)/675,'w':(x1-x0)/1200,'h':(y1-y0)/675})

def blank_page(number, section, kind='operations'):
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(1200,675));links=[]
    c.setFillColor(HexColor(PAPER));c.rect(0,0,1200,675,fill=1,stroke=0)
    text(c,49,639,'OPENZCASH',13,'B');text(c,148,639,kind.upper(),12,'A',GREEN if kind=='operations' else '#986b10')
    text(c,964,639,section.upper(),12,'B','#697065');text(c,1123,637,f'{number:02d}',17,'D','#697065')
    c.setStrokeColor(HexColor('#797f76'));c.setLineWidth(1);c.line(49,617,1150,617)
    return buf,c,links

def finish_page(buf,c,links,title,section):
    c.showPage();c.save();page=PdfReader(buf).pages[0]
    return page,{'title':title,'section':section,'links':links,'text':page.extract_text()}

def paragraph(c,x,y,value,width,size=18,leading=23,font='A',color=INK,max_lines=3):
    lines=[];line=''
    for word in plain(value).split():
        candidate=f'{line} {word}'.strip()
        if pdfmetrics.stringWidth(candidate,font,size)>width and line:
            lines.append(line);line=word
        else:line=candidate
    if line:lines.append(line)
    assert len(lines)<=max_lines, f'Paragraph needs layout review: {value}'
    for i,line in enumerate(lines):text(c,x,y-i*leading,line,size,font,color)

def zcg_page(rows,number,start=None,verdict=None):
    section='ZCG decisions' if verdict else 'ZCG review'
    buf,c,links=blank_page(number,section)
    title=f'ZCG: {len(rows)} {"approvals" if verdict=="Approved" else "declines"}' if verdict else 'ZCG proposals under review'
    text(c,49,568,title,48,'D')
    if verdict:
        subtitle='Minutes published Sep 2. Decision dates shown below.' if verdict=='Approved' else 'Four declines reported in the Sep 2 minutes; two further decisions dated Sep 4.'
        text(c,49,537,subtitle,19,'A','#63695f')
        text(c,49,508,'Requested amounts below are separate from approval budgets and payments.',16,'A',GREEN)
        if verdict=='Approved':
            add_link(c,links,'https://forum.zcashcommunity.com/t/57394',(49,529,820,555),'Read the ZCG meeting minutes published September 2')
    else:
        text(c,49,537,'16 requests pending at Sep 10: 10 submitted this period and 6 carried forward.',19,'A','#63695f')
        text(c,49,508,'ZCG committee review. Public feedback is separate from a Coinholder ballot.',16,'A',GREEN)
        text(c,945,508,f'{start:02d}-{start+len(rows)-1:02d} OF 16',15,'B',GREEN)
    text(c,49,480,'PROPOSAL / '+('DECISION CONTEXT' if verdict else 'SCOPE'),13,'B','#63695f')
    text(c,757,480,'DECISION DATE' if verdict else 'APPLICANT',13,'B','#63695f')
    text(c,1043,480,'USD REQUESTED',13,'B','#63695f')
    c.setStrokeColor(HexColor('#a8afa6'));c.line(49,469,1150,469)
    step=57 if verdict else 51
    for i,row in enumerate(rows):
        top=469-i*step
        for value,font,size,width in [(row['title'],'B',21,650),(row['summary'],'A',16,665)]:
            assert pdfmetrics.stringWidth(plain(value),font,size)<=width, f'ZCG row needs layout review: {value}'
        text(c,49,top-22,row['title'],21,'B',GREEN)
        text(c,49,top-43,row['summary'],16,'A','#555d53')
        if verdict:
            month,day=row['decisionDate'][5:7],int(row['decisionDate'][8:10])
            middle=f'{"Aug" if month=="08" else "Sep"} {day}'
        else:middle=row['applicant']
        text(c,757,top-29,middle,17)
        c.setFont('B',20);c.setFillColor(HexColor(INK));c.drawRightString(1150,top-29,row['amountLabel'])
        if row.get('amountBasis','').startswith('Indicative'):
            c.setFont('A',12);c.setFillColor(HexColor('#63695f'));c.drawRightString(1150,top-43,'indicative range')
        add_link(c,links,row['url'],(49,top-step+3,708,top-2),f"Read ZCG proposal: {row['fullTitle']}")
        if verdict:add_link(c,links,row['decisionUrl'],(750,top-step+3,953,top-2),f"Read decision for {row['title']}")
        c.setStrokeColor(HexColor('#d2d5cc'));c.setLineWidth(.65);c.line(49,top-step,1150,top-step)
    return finish_page(buf,c,links,title if verdict else f'ZCG proposals {start:02d}-{start+len(rows)-1:02d}',section)

def product_status_page(number):
    buf,c,links=blank_page(number,'Project status')
    text(c,49,568,'New projects: status and open questions',46,'D')
    text(c,49,533,'Developer reports published Sep 1-10. Readiness is separate from funding status.',20,'A','#63695f')
    rows=[
        ('0xramp','v1.0.0 announced','Fiat-first quotes and receipts. ZEC delivery uses transparent addresses.','ramp'),
        ('red·bridge','Beta registration','Website and tester signup are live; a released product is not established.','redbridge'),
        ('ZecGuard','Access service announced','Shielded ZEC access gates for Telegram and Discord; adoption is unquantified.','guard'),
        ('Zpay.cash','Service introduced','ZEC-to-Venmo service announced; additional checkout integrations remain unfinished.','zpay'),
        ('Konclave','v0.3.0 report','Recovery and privacy work reported; the team also lists open limitations.','konclave'),
        ('Ballast','Pre-beta introduction','Transparent bridge hop disclosed. No independent audit established at cutoff.','ballast'),
    ]
    text(c,49,488,'PROJECT',13,'B','#63695f');text(c,289,488,'REPORTED STATUS',13,'B','#63695f');text(c,600,488,'WHAT TO CHECK',13,'B','#63695f')
    c.setStrokeColor(HexColor('#a8afa6'));c.line(49,474,1150,474)
    for i,(name,status,detail,key) in enumerate(rows):
        top=474-i*69
        text(c,49,top-29,name,25,'B',GREEN)
        paragraph(c,289,top-28,status,279,19,24,max_lines=2)
        paragraph(c,600,top-23,detail,550,18,23,max_lines=2,color='#555d53')
        add_link(c,links,DATA['sources'][key][1],(49,top-64,1150,top-3),f'Read {name} original update')
        c.setStrokeColor(HexColor('#d2d5cc'));c.line(49,top-69,1150,top-69)
    return finish_page(buf,c,links,'New projects: status and open questions','Project status')

def highlights_page(number):
    buf,c,links=blank_page(number,'Highlights','monthly')
    text(c,49,552,'Period highlights',57,'D')
    rows=[
        ('Recovery, sync and signing','Zingo added backup recovery; ZODL improved server switching; Vizor and Zkool shipped signing and sync fixes.'),
        ('Hardware signing advances','Hito reported a mainnet flow; Vizor showed a Ledger demo. OneKey still listed Ironwood signing as pending.'),
        ('Products reach different stages','0xramp announced v1.0.0; red·bridge opened beta signup; Ballast introduced its desktop app before beta.'),
    ]
    for i,(title,body) in enumerate(rows):
        y=455-i*122
        text(c,49,y,title,29,'B')
        paragraph(c,49,y-34,body,631,21,27,color='#63695f',max_lines=2)
    c.setStrokeColor(HexColor('#c7cec2'));c.line(741,85,741,558)
    text(c,798,524,'NEXT PUBLICATION',14,'B',GREEN)
    text(c,794,450,'OPERATIONS',66,'D',GREEN)
    paragraph(c,798,399,'Funding. Decisions. Communities.',325,23,28,max_lines=2)
    for y,value,label in [(309,'16','ZCG proposals under review'),(238,'37','Coinholder grant requests'),(167,'32','community records in Sources')]:
        text(c,798,y,value,36,'D',GREEN);text(c,854,y+4,label,17,'A','#63695f')
    c.setFillColor(HexColor(GREEN));c.roundRect(798,79,352,55,3,stroke=0,fill=1)
    text(c,823,97,'Open Operations',21,'B',PAPER)
    c.setStrokeColor(HexColor(PAPER));c.setLineWidth(1.5);c.lines([(1095,106,1120,106),(1113,113,1120,106),(1113,99,1120,106)])
    add_link(c,links,f'{PREVIEW_ORIGIN}/monthly-preview?publication=operations#1',(798,79,1150,134),'Open Operations in this reader')
    return finish_page(buf,c,links,'Period highlights / Open Operations','Highlights')

def sampled_page(old, number, kind):
    page=copy.copy(PDF.pages[old-1])
    # Preserve external citations; an excerpt cannot retain old internal destinations.
    page[NameObject('/Annots')]=ArrayObject([a for a in page.get('/Annots',[]) if a.get_object().get('/A',{}).get('/URI')])
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(1200,675))
    dark=DATA['pages'][old-1].get('layout')=='event'
    c.setFillColor(HexColor(INK if dark else PAPER));c.rect(1106,632,61,30,fill=1,stroke=0)
    text(c,1123,637,f'{number:02d}',17,'D',PAPER if dark else '#697065')
    if kind=='operations':
        c.setFillColor(HexColor(INK if dark else PAPER));c.rect(137,632,209,27,fill=1,stroke=0)
        text(c,143,639,'OPERATIONS',12,'A',PAPER if dark else GREEN)
    c.showPage();c.save();page.merge_page(PdfReader(buf).pages[0]);return page

catalog={}
monthly_selection=[None,3,4,5,6,7,8,9,10,'highlights']
operations_selection=[None,11,13,14,'zcg-approved','zcg-declined','zcg-open-1','zcg-open-2',21,*proposal_groups,17,18,19,20,'products',24,23]
assert len(monthly_selection)==10 and monthly_selection[5]==7
for kind,selection in [('monthly',monthly_selection),('operations',operations_selection)]:
    dest=OUT/kind;dest.mkdir(exist_ok=True)
    writer=PdfWriter();manifest=[]
    for i,old in enumerate(selection,1):
        if isinstance(old,list):
            start=1+sum(len(group) for group in proposal_groups[:proposal_groups.index(old)])
            page,m=proposal_page(old,i,start)
        elif isinstance(old,str):
            if old=='highlights':page,m=highlights_page(i)
            elif old=='products':page,m=product_status_page(i)
            elif old.startswith('zcg-open'):
                start=1 if old.endswith('1') else 9
                page,m=zcg_page(ZCG['requests'][start-1:start+7],i,start=start)
            else:
                verdict='Approved' if old=='zcg-approved' else 'Declined'
                page,m=zcg_page([r for r in ZCG['decisions'] if r['status']==verdict],i,verdict=verdict)
        elif old:
            page=sampled_page(old,i,kind)
            m=copy.deepcopy(OLD[old-1]);m['links']=[x for x in m['links'] if 'url' in x]
            lines=m['text'].splitlines()
            assert lines[:2]==['OPENZCASH','MONTHLY']
            lines[1]=kind.upper()
            if lines[3]==f'{old:02d}':lines[3]=f'{i:02d}'
            else:lines.insert(3,f'{i:02d}')
            m['text']='\n'.join(lines)
        else:
            page=cover_page(kind)
            m={'title':f'OPENZCASH {kind.upper()}','section':'Overview','links':[],'text':page.extract_text()}
        writer.add_page(page)
        m['number']=i
        if kind=='monthly' and i==5:m['section']='Build'
        if kind=='monthly' and i in (6,7):m['section']='Wallets'
        if kind=='monthly' and i==8:m['section']='Build'
        if kind=='operations' and isinstance(old,int) and old in (11,13,14):m['section']='Payments'
        if kind=='operations' and old==21:m['section']='NU7 polls'
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
for row in [*ZCG['requests'],*ZCG['decisions']]:
    if not any(source['url']==row['url'] for source in sources):sources.append({'name':f'ZCG #{row["number"]}: {row["title"]}','detail':'Original grant application','url':row['url']})
sources.append({'name':'ZCG proposal status sheet','detail':'Official proposal and decision register','url':'https://docs.google.com/spreadsheets/d/1FQ28rDCyRW0TiNxrm3rgD8ai2KGUsXAjPieQmI1kKKg/edit#gid=1164534734'})
communities=[{'name':v[0],'detail':v[1]+' | '+v[2],'url':v[3]} for v in DATA['coverage']]
requests=[{'name':v['project'],'detail':v['org'],'url':v['githubUrl'] or v['threadUrl'],'amount':v['requestedUsd']} for v in DATA['analytics']['proposals']]
zcg=[{'name':v['title'],'detail':f'{v["status"]} | {v["summary"]}','url':v['url'],'amount':v['amount'],'amountLabel':v['amountLabel']+(' (indicative)' if v.get('amountBasis','').startswith('Indicative') else '')} for v in [*ZCG['requests'],*ZCG['decisions']]]
bundle={'documents':catalog,'sources':sources,'communities':communities,'requests':requests,'zcg':zcg}
(ROOT/'src/components/monthly/bundle-preview-data.json').write_text(json.dumps(bundle,indent=2)+'\n')
print(json.dumps({'documents':{k:v['pageCount'] for k,v in catalog.items()},'sources':len(sources),'communities':len(communities),'requests':len(requests)}))
