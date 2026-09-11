"""Editorial 4.0 primitives shared by reviewed Monthly/Operations issues.
The cover geometry and original Zcash paths match the approved Covers 2 reference.
"""
import io, math, xml.etree.ElementTree as ET
from pathlib import Path
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.svgpath import SvgPath
from reportlab.graphics import renderPDF
ROOT=Path(__file__).resolve().parents[2]
FONTS=Path('/System/Library/Fonts/Supplemental')
for name,file,sub in [('A','GillSans.ttc',0),('B','GillSans.ttc',4),('D','DIN Condensed Bold.ttf',0)]:
    pdfmetrics.registerFont(TTFont(name,str(FONTS/file),subfontIndex=sub))
PAPER,INK,GOLD,GREEN='#f7f5ef','#171917','#efb92f','#325c4e'

def plain(value):
    return str(value).replace('\u2014', '-').replace('\u2013', '-').replace('\u2011', '-')

def text(c,x,y,s,size=20,font='A',color=INK):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,y,plain(s))

def centered_text(c,cx,y,s,size=20,font='A',color=INK):
    value=plain(s)
    text(c,cx-pdfmetrics.stringWidth(value,font,size)/2,y,value,size,font,color)

def tracked_text(c,cx,y,s,size=13,tracking=1.6,color=INK):
    value=plain(s)
    width=pdfmetrics.stringWidth(value,'B',size)+(len(value)-1)*tracking
    c.saveState()
    t=c.beginText(cx-width/2,y);t.setFont('B',size);t.setCharSpace(tracking)
    t.setFillColor(HexColor(color));t.textOut(value);c.drawText(t)
    c.restoreState()

def zcash_mark(c,cx,cy,size):
    # Preserve the repository's exact brand paths. The SVG's visible circle
    # occupies 270..810; only its placement/scale changes, not its geometry.
    svg=ET.parse(ROOT/'public/zcash-mark.svg').getroot()
    drawing=Drawing(1080,1080)
    for path in svg.findall('{http://www.w3.org/2000/svg}path'):
        drawing.add(SvgPath(path.attrib['d'],fillColor=HexColor(path.attrib['fill']),strokeColor=None))
    c.saveState();c.translate(cx-size/2,cy+size/2);c.scale(size/540,-size/540);c.translate(-270,-270)
    renderPDF.draw(drawing,c,0,0);c.restoreState()

def zcash_cover_art(c,cx,cy,kind):
    """Decorative engraved medallion; no axes, scales or implied data."""
    c.saveState()
    clip=c.beginPath();clip.rect(784,242,416,349);c.clipPath(clip,stroke=0,fill=0)
    c.setStrokeColor(HexColor(INK if kind=='monthly' else PAPER));c.setStrokeAlpha(.19)
    c.setLineWidth(.65)
    for band in range(23):
        radius=128+band*3.6;path=c.beginPath()
        for step in range(361):
            theta=step*math.tau/360
            r=radius+7*math.sin(theta*3+band*.18)+3*math.sin(theta*7-band*.13)
            x=cx+r*math.cos(theta)*1.045;y=cy+r*math.sin(theta)*.78
            if step==0:path.moveTo(x,y)
            else:path.lineTo(x,y)
        path.close();c.drawPath(path,stroke=1,fill=0)
    c.restoreState()
    # Ink backing makes the official transparent Z cutout retain its contrast.
    c.setFillColor(HexColor(INK));c.circle(cx,cy,112,stroke=0,fill=1)
    zcash_mark(c,cx,cy,204)
    c.setStrokeColor(HexColor(INK if kind=='monthly' else '#b7ccbf'));c.setLineWidth(.9)
    c.circle(cx,cy,120,stroke=1,fill=0)

def cover_page(kind, issue, metrics):
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=(1200,675))
    accent = GOLD if kind == 'monthly' else GREEN
    c.setFillColor(HexColor(INK)); c.rect(0,0,784,675,fill=1,stroke=0)
    c.setFillColor(HexColor(accent)); c.rect(784,0,416,675,fill=1,stroke=0)
    # A single masthead, generous title band and one baseline for the metrics.
    tracked_text(c,392,618,'OPENZCASH',18,2.3,PAPER)
    if kind=='monthly':
        title,subtitle='MONTHLY','Engineering. Wallets. Products.'
        title_size=192
    else:
        title,subtitle='OPERATIONS','Funding. Decisions. Communities.'
        title_size=160
    assert pdfmetrics.stringWidth(title,'D',title_size)<=656
    centered_text(c,392,405,title,title_size,'D',PAPER)
    centered_text(c,392,345,subtitle,27,'A','#d6d9d0')
    cell=(656-48)/3
    for i,(value,labels) in enumerate(metrics):
        x=64+i*(cell+24);cx=x+cell/2
        c.setStrokeColor(HexColor('#535c51'));c.setLineWidth(.85);c.line(x,251,x+cell,251)
        assert pdfmetrics.stringWidth(value,'D',74)<=cell
        centered_text(c,cx,174,value,74,'D',PAPER)
        for row,label in enumerate(labels):centered_text(c,cx,127-row*25,label,21,'A','#d6d9d0')
    right=INK if kind=='monthly' else PAPER;art_center=992
    tracked_text(c,art_center,619,issue['issueLabel'],14,1.5,right)
    zcash_cover_art(c,art_center,417,kind)
    c.setStrokeColor(HexColor(INK if kind=='monthly' else '#8da99a'));c.setStrokeAlpha(.35)
    c.setLineWidth(.8);c.line(860,229,1124,229);c.setStrokeAlpha(1)
    centered_text(c,art_center,150,issue['dateLabel'],49,'D',right)
    tracked_text(c,art_center,107,issue['statusLabel'],12,1.5,right)
    c.showPage();c.save();return PdfReader(buf).pages[0]

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
