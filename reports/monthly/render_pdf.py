"""OpenZcash Monthly - fixed-page editorial PDF, from the reviewed report data."""
import json,math,re,html,datetime,argparse
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--issue-dir',type=Path,required=True)
parser.add_argument('--output',type=Path)
parser.add_argument('--draft',action='store_true',help='Allow pending human review; financial and editorial checks still apply.')
args=parser.parse_args()
R=args.issue_dir.resolve();D=json.loads((R/'report-content.json').read_text());W,H=1200,675
from validate_issue import validate
verification=validate(D,json.loads((R/'evidence-snapshot.json').read_text()),R,final=not args.draft)
if not verification['ok']:raise SystemExit(json.dumps(verification['errors'],indent=2))
E=D['edition'];publication=datetime.date.fromisoformat(E['month']+'-01');close=datetime.date.fromisoformat(E['financialMonth']+'-01');cutoff=datetime.date.fromisoformat(E['cutoff']);start=datetime.date.fromisoformat(E['windowStart'])
def short_date(value,year=False):
 d=datetime.date.fromisoformat(value[:10]);return d.strftime('%b ')+str(d.day)+(f', {d.year}' if year else '')
def instant(value):return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(datetime.timezone.utc)
A=R/'brand-assets'; OUT=args.output or R/E.get('filename',f"OpenZcash-Monthly-{publication:%B-%Y}.pdf")
OUT.parent.mkdir(parents=True,exist_ok=True)
FD=Path('/System/Library/Fonts/Supplemental')
for n,i in [('A',0),('B',4),('I',2)]:pdfmetrics.registerFont(TTFont(n,str(FD/'GillSans.ttc'),subfontIndex=i))
pdfmetrics.registerFont(TTFont('D',str(FD/'DIN Condensed Bold.ttf')))
pdfmetrics.registerFont(TTFont('N',str(FD/'DIN Alternate Bold.ttf')))
pdfmetrics.registerFontFamily('A',normal='A',bold='B',italic='I')
INK='#171917';PAPER='#F7F5EF';WHITE='#FFFFFF';GOLD='#E8B338';GRAY='#51564F';LINE='#CFD1C7';LIGHT='#EAE9E1'
C=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1,initialFontName='A');C.setTitle(D['title']);C.setAuthor('OpenZcash');C.setSubject(f'Monthly ecosystem briefing. Evidence cutoff {cutoff.isoformat()}.');C.setCreator('OpenZcash Monthly / '+E['revision']);C.setViewerPreference('DisplayDocTitle','true');C.showOutline()
checks=[]
def norm(t):return str(t).replace('–','-').replace('—','-').replace('‑','-').replace('−','-').replace('↗','')
def rect(x,y,w,h,col,stroke=None):
 C.setFillColor(HexColor(col));C.setStrokeColor(HexColor(stroke or col));C.setLineWidth(.6);C.rect(x,H-y-h,w,h,fill=1,stroke=bool(stroke))
def line(x,y,w,col=LINE,width=.8):
 C.setStrokeColor(HexColor(col));C.setLineWidth(width);C.line(x,H-y,x+w,H-y)
 checks.append({'page':PN,'kind':'rule','bounds':[x,y,w,width]})
def text(x,y,s,sz=16,font='A',col=INK):
 s=norm(s).replace('·','/') if font=='N' else norm(s);tw=pdfmetrics.stringWidth(s,font,sz)
 if x<0 or x+tw>W+1 or y<0 or y+sz>H+1:raise ValueError(f'Page {PN}: line out of bounds {(x,y,tw,sz,s)}')
 C.setFillColor(HexColor(col));C.setFont(font,sz);C.drawString(x,H-y-sz*.80,s)
 checks.append({'page':PN,'kind':'text','bounds':[x,y,tw,sz],'text':s})
def rich(x,y,w,s,sz=18,font='A',col=INK,maxh=100,align=0):
 s=norm(s).replace('·','/') if font=='N' else norm(s)
 p=Paragraph(s,ParagraphStyle('p',fontName=font,fontSize=sz,leading=sz*1.22,textColor=HexColor(col),alignment=align));_,h=p.wrap(w,1200)
 if h>maxh+.1:raise ValueError(f'Page {PN}: paragraph overflow {h:.1f}>{maxh}: {s[:100]}')
 if y+h>H-5:raise ValueError('Page edge overflow')
 p.drawOn(C,x,H-y-h);checks.append({'page':PN,'kind':'paragraph','bounds':[x,y,w,h],'text':re.sub('<[^>]+>','',s)});return h

def para(x,y,w,s,sz=18,font='A',col=INK,maxh=100,align=0):return rich(x,y,w,html.escape(norm(s)).replace('\n','<br/>'),sz,font,col,maxh,align)
def centered(x,y,w,s,sz=18,font='A',col=INK):
 size=min(sz,w/pdfmetrics.stringWidth(norm(s),font,1))
 text(x+(w-pdfmetrics.stringWidth(norm(s),font,size))/2,y,s,size,font,col)
def image(path,x,y,w,h,cover=False):
 im=ImageReader(str(path));iw,ih=im.getSize();s=(max if cover else min)(w/iw,h/ih);dw,dh=iw*s,ih*s
 C.saveState()
 if cover:
  p=C.beginPath();p.rect(x,H-y-h,w,h);C.clipPath(p,stroke=0,fill=0)
 C.drawImage(im,x+(w-dw)/2,H-y-(h+dh)/2,width=dw,height=dh,mask='auto');C.restoreState();checks.append({'page':PN,'kind':'image','file':str(path.name),'bounds':[x,y,w,h]})
def logo(name,x,y,w=40,h=None):image(A/name,x,y,w,h or w)
def chip(x,y,s,dark=False):
 co=GOLD if dark else INK;bg='#30332D' if dark else LIGHT
 tw=pdfmetrics.stringWidth(norm(s),'B',10.5)+20;rect(x,y,tw,21,bg);text(x+10,y+6,s,10.5,'B',co)
def brand(x,y,dark=False):
 text(x,y,'OPENZCASH',12,'B',WHITE if dark else INK)
 text(x+93,y,'MONTHLY',12,'A',GOLD if dark else GRAY)
def footer(p,dark=False):
 # Evidence and qualifications are in the final index and methodology pages.
 pass
def header(p):
 rect(0,0,W,H,PAPER);brand(52,28)
 sec=p['section'].replace('Appendix · ','').upper()
 text(1081-pdfmetrics.stringWidth(norm(sec),'B',11),28,sec,11,'B',GRAY)
 text(1123,25,f'{PN:02d}',17,'N',GRAY)
 C.linkRect('Contents','p2',(52,H-46,250,H-22),relative=0,thickness=0)
 line(52,54,1096,INK,1)
 h=para(52,77,1096,p['title'],48,'D',INK,maxh=99)
 sh=para(53,91+h,1095,p['subtitle'],18,'A',GRAY,maxh=42) if p.get('subtitle') else 0
 return max(155,91+h+sh+24)

LOGOS={
 'Zcash Foundation':'zf.svg.png','ZODL':'zodl-black.png','Shielded Labs':'logos-shielded-labs.png','Valar Group + Project Tachyon':'tachyon-web-original.png',
 'Zcash en Español':'espanol-web-original.png','Querétaro':'community-logos-zcash-club-queretaro.png','Zcast + Caracas':'community-logos-zcast.png','Nigeria':'community-logos-zcash-nigeria.png','East Africa':'community-logos-zcash-east-africa.png','Türkiye':'community-logos-zcash-turkiye.png','Arabia / MENA':'community-logos-zcash-arabia.png','ZecHub':'zechub-blue-original.png','ZK AV Club':'community-logos-zk-av-club.png',
 'Zcash Brazil':'community-logos-zcash-brazil.png','Zcash Nigeria':'community-logos-zcash-nigeria.png','Zcash Español':'espanol-web-original.png','Batuhan':'community-logos-zcash-turkiye.png','ZcashArabia':'community-logos-zcash-arabia.png','Zebra / ZF':'zebra.png','Zaino / Zingo Labs':'wallet-logos-zingo.png','Zallet / ZODL':'wallet-logos-zodl.png','Zakura':'zakura-flower.svg.png'
}
def draw_cover(p):
 rect(0,0,W,H,INK);rect(778,0,422,H,GOLD)
 # A geometric issue device, with the real Zcash mark kept intact.
 C.saveState();clip=C.beginPath();clip.rect(778,0,422,H);C.clipPath(clip,stroke=0,fill=0);C.setStrokeColor(HexColor('#B3841D'));C.setLineWidth(.6)
 for rad in range(150,540,24):C.circle(1175,H-175,rad,stroke=1,fill=0)
 C.restoreState()
 text(803,37,f'ISSUE {publication:%m / %Y}',16,'B',INK)
 text(49,110,'OPENZCASH',103,'D',WHITE);text(48,214,'MONTHLY',151,'D',WHITE)
 para(55,369,657,p['text'],28,'A','#DEDCD0',maxh=75)
 date_label=(f'{publication:%B %Y} · PARTIAL PERIOD' if E.get('mode')=='period' else f'{publication:%B %Y} · {close:%B} FINANCIAL CLOSE').upper()
 date_width=pdfmetrics.stringWidth(date_label,'B',15)+24
 rect(55,436,date_width,31,'#30332D');text(67,444,date_label,15,'B',GOLD)
 C.setFillColor(HexColor(INK));C.circle(985,H-195,112,fill=1,stroke=0)
 logo('zcash.png',889,99,192);text(824,343,publication.strftime('%m'),198,'D',INK)
 text(803,550,'THE ECOSYSTEM, IN ONE PLACE',18,'B',INK)
 text(803,586,(short_date(start.isoformat())+'–'+short_date(cutoff.isoformat())).upper(),24,'N',INK)
 text(803,616,'EVIDENCE WINDOW',14,'B',INK)
 for i,(v,label) in enumerate(p['metrics']):
  x=54+i*237;line(x,508,205,'#737A6A',.9)
  size=min(52,205/pdfmetrics.stringWidth(norm(v),'N',1))
  text(x,520,v,size,'N',WHITE)
  label=label.replace('grant payments','grant\npayments').replace('retroactive proposals','retroactive\nproposals').replace('polling deadline','polling\ndeadline')
  para(x,581,205,label,19,'A','#ECECE2',maxh=48)
 footer(p,True)
def draw_contents(p,y):
 starts=[]
 for i,q in enumerate(D['pages'],1):
  if q['section']=='Overview':continue
  if not starts or starts[-1][0]!=q['section']:starts.append((q['section'],i))
 percol=math.ceil(len(starts)/2);step=54 if percol>6 else 62
 for j,(name,num) in enumerate(starts):
  col=j//percol;row=j%percol;x=52+col*569;yy=y+row*step
  text(x,yy,f'{num:02d}',32,'D',GRAY);text(x+64,yy+7,name,23,'A');line(x,yy+47,527)
  C.linkRect('',f'p{num}',(x,H-yy-48,x+527,H-yy+3),relative=0,thickness=0)
 text(52,570,'SELECT A SECTION TO JUMP',10,'B',GRAY)
def draw_grid(p,y,org=False):
 cs=p['cards'];n=len(cs);cols=3 if n>=5 else 2;rows=math.ceil(n/cols);gap=31;cw=(1096-gap*(cols-1))/cols;rh=(563-y-20*(rows-1))/rows
 for i,b in enumerate(cs):
  x=52+(i%cols)*(cw+gap);yy=y+(i//cols)*(rh+20)
  line(x,yy,cw,INK if org else LINE,.9)
  lg=LOGOS.get(b['title']);tx=x
  if lg:
   if b['title']=='ZODL':logo('wallet-logos-zodl.png',x,yy+11,34);labelx=x+45
   elif b['title']=='Valar Group + Project Tachyon':
    logo(lg,x+2,yy+11,34);labelx=x+48
   else:logo(lg,x,yy+11,34);labelx=x+45
  elif b['title']=='ZCG + FPF':logo('logos-zcg.png',x,yy+11,34);logo('logos-fpf.png',x+43,yy+12,32);labelx=x+88
  else:text(x,yy+17,f'{i+1:02d}',22,'D',GRAY);labelx=x+36
  label=b.get('label','')
  # The title already identifies the shared teams.
  if label:para(labelx,yy+18,cw-(labelx-x),label,9.5,'B',GRAY,maxh=25)
  h=para(x,yy+55,cw,b['title'],23,'B',INK,maxh=58)
  para(x,yy+64+h,cw,b['text'],18.3,'A',GRAY,maxh=rh-(64+h)+2)
def draw_profile(p,y,shielded=False):
 # Float the authentic mark on the page, with centered native PDF typography.
 profile=p['profile']
 logo(profile['logo'],105.5,y+25,220)
 centered(52,y+270,327,profile['name'],38,'D',INK)
 centered(52,y+338,327,profile['tag'],16,'B',GRAY)
 line(119,y+318,193,LINE)
 yy=y
 for i,b in enumerate(p['cards']):
  line(424,yy,724,LINE);text(424,yy+20,f'{i+1:02d}',26,'D',GRAY)
  h=para(478,yy+15,670,b['title'],24,'B',INK,maxh=57)
  body_h=para(478,yy+24+h,670,b['text'],18.5,'A',GRAY,maxh=59)
  yy+=24+h+body_h+18
def draw_wallets(p,y):
 if p.get('walletLayout')=='2x2':
  return draw_wallet_grid(p,y)
 for i in range(2):
  x=52+i*563;line(x,y,533,LINE)
  if i==0:logo('zodl-black.png',x+28,y+26,217,46)
  else:logo('vizor-helmet.webp',x+12,y+1,106);text(x+124,y+34,'VIZOR',48,'D','#8A104A')
  b=p['cards'][0 if i==0 else 2];release=p['walletReleases'][i];version=release['version']
  text(x+28,y+111,version,66,'D',INK if i==0 else '#8A104A');text(x+245,y+145,release['platform'].upper(),11,'B',GRAY)
  text(x+28,y+181,short_date(release['date'])+' / '+release['state'],14,'B',GRAY)
  para(x+28,y+205,477,b['text'],20,'A',INK,maxh=62)
  line(x+28,y+274,477,LINE if i==0 else '#CCB2BF')
  b=p['cards'][1 if i==0 else 3];text(x+28,y+291,b['title'],23,'B',INK)
  para(x+28,y+327,477,b['text'],17.3,'A',GRAY,maxh=51)
def draw_wallet_grid(p,y):
 for i,(release,card) in enumerate(zip(p['walletReleases'],p['cards'])):
  x=52+(i%2)*563;yy=y+(i//2)*214;accent=release.get('accent',INK)
  line(x,yy,533,LINE)
  stacked=release.get('logoLayout')=='stacked-wordmark'
  if stacked:
   logo(release['logo'],x+14,yy+12,94,94)
  elif release.get('logoIncludesName'):
   logo(release['logo'],x+14,yy+13,180,43)
  else:
   C.saveState()
   if release.get('logoClip')=='circle':
    clip=C.beginPath();clip.circle(x+35.5,H-yy-33.5,22);C.clipPath(clip,stroke=0,fill=0)
   logo(release['logo'],x+12,yy+10,47)
   C.restoreState()
   text(x+76,yy+16,release['name'].upper(),36,'D',accent)
  version=release.get('version') or 'No verified update'
  text(x+(136 if stacked else 14),yy+68,version,45 if release.get('version') else 29,'D',accent)
  status=' / '.join(filter(None,[release.get('platform')]+([release.get('state'),short_date(release['date'])] if release.get('date') else [])))
  para(x+14,yy+116,505,status,14.5,'B',GRAY,maxh=19)
  para(x+14,yy+147,505,card['text'],18,'A',INK,maxh=66)
def draw_zakura(p,y):
 logo('zakura-flower.svg.png',123,y+20,185)
 logo('zakura-wordmark.svg.png',78.5,y+217,274,82)
 line(119,y+318,193,LINE)
 centered(52,y+332,327,p['release']['version'],44,'D',INK)
 centered(52,y+386,327,(short_date(p['release']['date'])+' / '+p['release']['state']).upper(),16,'B','#784052')
 for i,b in enumerate(p['cards']):
  yy=y+i*104;line(424,yy,724,LINE);text(424,yy+20,f'{i+1:02d}',26,'D',GRAY)
  h=para(478,yy+15,670,b['title'],24,'B',INK,maxh=57)
  para(478,yy+24+h,670,b['text'],18.5,'A',GRAY,maxh=59)
def table_measure(p,width=1096,fontsize=17,rowpad=17):
 ws=[width*x for x in p.get('widths',[1/len(p['headers'])]*len(p['headers']))]
 rh=[]
 for row in p['rows']:
  hs=[]
  for j,t in enumerate(row):
   pp=Paragraph(html.escape(norm(t)),ParagraphStyle('m',fontName='B' if j==0 else 'A',fontSize=fontsize,leading=fontsize*1.22));hs.append(pp.wrap(ws[j]-23,1500)[1])
  rh.append(max(hs)+rowpad)
 return ws,rh

def draw_table(p,y,x=52,w=1096,end=564,icons=False,compact=False,plain=False):
 fs=17 if not compact else 16
 while True:
  ws,rh=table_measure(p,w,fs,13 if compact else 19)
  if sum(rh)+34<=end-y:break
  fs-=.25
  if fs<14.0:raise ValueError(f'Page {PN}: table too dense')
 extra=min(13,max(0,(end-y-34-sum(rh))/len(rh)));rh=[v+extra for v in rh]
 line(x,y,w,INK,1.3);xx=x
 for j,s in enumerate(p['headers']):
  para(xx+10,y+10,ws[j]-20,s.upper(),10.8,'B',GRAY,maxh=26);xx+=ws[j]
 yy=y+35
 for k,row in enumerate(p['rows']):
  if k%2==0 and not plain:rect(x,yy,w,rh[k],WHITE)
  xx=x
  for j,s in enumerate(row):
   num=bool(re.match(r'^(\$|\d[\d,.]*$)',norm(s))) and j>0
   left=10;ww=ws[j]-20
   if j==0 and icons and LOGOS.get(s):logo(LOGOS[s],xx+10,yy+(rh[k]-27)/2,27);left=47;ww=ws[j]-57
   raw=html.escape(norm(s))
   if j==0 and p.get('rowlinks'):raw=f'<link href="{html.escape(p["rowlinks"][k],quote=True)}" color="{INK}">{raw}</link>'
   rich(xx+left,yy+9,ww,raw,fs,'B' if j==0 else 'A',INK,maxh=rh[k]-10,align=2 if num else 0)
   xx+=ws[j]
  line(x,yy+rh[k],w,LINE,.4);yy+=rh[k]
 checks.append({'page':PN,'kind':'table','rows':len(rh),'fontSize':fs,'bounds':[x,y,w,yy-y]})
def draw_chart(p,y):
 image(R/'charts'/(p['chart']+'.png'),68,y+6,709,369)
 x=828;ww=320
 if p['chart']=='grant-category-chart':
  yy=y+5
  for r in D['analytics']['categories']:
   text(x,yy,r['category'].replace('Research & Development','R&D').upper(),11,'B',GRAY)
   text(x,yy+20,f"${r['usd']:,.2f}",27,'N',INK);text(x+248,yy+25,f"{r['share']:.1f}%",19,'N',GRAY);line(x,yy+61,ww);yy+=76
 else:
  yy=y+5
  for v,label in p['metrics']:
   fs=43 if len(v)<17 else 25
   h=para(x,yy,ww,v,fs,'N',INK,maxh=60);para(x,yy+h+6,ww,label,15,'A',GRAY,maxh=40);yy+=h+46
  if p.get('text'):para(x,yy+5,ww,p['text'],17,'A',GRAY,maxh=562-yy-5)
def draw_photo(p,y):
 image((R/p['image']).resolve(),52,y,653,382,True)
 logo('community-logos-zcash-brazil.png',745,y,44)
 text(806,y+14,'ZCASH BRAZIL',12,'B',GRAY)
 yy=y+61
 for b in p['cards']:
  h=para(745,yy,403,b['title'],23,'B',INK,maxh=58);yy+=h+8
  h=para(745,yy,403,b['text'],18,'A',GRAY,maxh=91);yy+=h+18
 if yy>581:raise ValueError('photo overflow')
def draw_africa(p,y):
 f=p['feature']
 centered(52,y+26,360,f['label'],16,'B','#385A47')
 centered(52,y+76,360,f['value'],155,'D','#385A47')
 para(72,y+244,320,f['description'],29,'A',INK,maxh=82,align=1)
 centered(52,y+348,360,f['detail'],15,'B',GRAY)
 for i,b in enumerate(p['cards']):
  yy=y+i*95;lg=LOGOS.get(b['title'])
  if lg:logo(lg,453,yy+9,38)
  else:text(453,yy+15,f'{i+1:02d}',27,'D',GRAY)
  line(510,yy,638)
  text(510,yy+12,b['title'],23,'B')
  para(510,yy+45,638,b['text'],18.6,'A',GRAY,maxh=54)
def draw_media(p,y):
 logo('zechub-blue-original.png',118,y+15,60);text(196,y+34,'ZECHUB',38,'D',INK)
 m=p['communityMetrics']
 centered(52,y+104,352,datetime.date.fromisoformat(m['period']+'-01').strftime('%B %Y').upper(),16,'B',GRAY)
 centered(52,y+141,170,m['metrics'][0][0],100,'D','#1D3C5A')
 centered(234,y+165,170,m['metrics'][1][0],70,'D','#1D3C5A')
 centered(52,y+257,170,m['metrics'][0][1],16,'B',INK)
 centered(224,y+257,180,m['metrics'][1][1],15,'B',INK)
 line(89,y+312,278,LINE)
 para(75,y+335,306,datetime.date.fromisoformat(m['comparisonPeriod']+'-01').strftime('%B')+': '+m['comparisonText'],17,'A',GRAY,maxh=45,align=1)
 for i,b in enumerate(p['cards']):
  yy=y+i*76;line(444,yy,704)
  lg=LOGOS.get(b['title'])
  if lg:logo(lg,444,yy+12,35)
  else:text(447,yy+18,f'{i+2:02d}',25,'D',GRAY)
  text(497,yy+13,b['title'],23,'B')
  para(497,yy+44,651,b['text'],17.5,'A',GRAY,maxh=44)

def draw_governance(p,y):
 deadline=p['deadline'];at=instant(deadline['at'])
 centered(52,y+26,347,deadline['label'],16,'B',GRAY)
 centered(52,y+91,347,short_date(deadline['at']).upper(),88,'D',INK)
 centered(52,y+202,347,at.strftime('%H:%M UTC'),39,'N','#8A104A')
 para(72,y+294,307,deadline['detail'],22,'A',INK,maxh=85,align=1)
 for i,b in enumerate(p['cards']):
  x=436+i*365;text(x,y+5,b['title'],25,'B');para(x,y+42,332,b['text'],17.5,'A',GRAY,maxh=89)
 yy=y+163
 for n,t in p['rows']:
  line(436,yy,712);text(438,yy+11,n,24,'D',GRAY);text(481,yy+13,t,21,'A');yy+=44

def draw_event(p):
 rect(0,0,W,H,INK);brand(52,29,True);text(1047,29,'EVENTS',11,'B',GOLD)
 # Original official artwork, uncropped and unaltered.
 event=p['event']
 image(A/event['art'],52,87,678,291)
 text(52,403,event['dateLabel'],65,'D',WHITE);text(52,478,event['location'],26,'A',GOLD)
 text(52,536,event['updateLabel'],15,'B','#CDD2BF')
 para(785,91,363,p['text'],42,'D',WHITE,maxh=105)
 yy=235
 for b in p['cards']:
  line(785,yy,363,'#55594F');h=para(785,yy+17,363,b['title'],22,'B',GOLD,maxh=61)
  h2=para(785,yy+26+h,363,b['text'],18,'A','#CDD2BF',maxh=67);yy+=h+h2+46
 footer(p,True)
def draw_treasury(p,y):
 v=p['valuation'];blue='#1D3C5A'
 logo('zechub-blue-original.png',101,y+12,60);text(179,y+31,'ZECHUB',38,'D',INK)
 centered(52,y+107,340,f"${v['indicativeUsd']/1000:.1f}k",78,'D',blue)
 centered(52,y+192,340,'INDICATIVE USD VALUE',16,'B',blue)
 centered(52,y+243,340,'Balance: '+short_date(v['balanceAsOf'],True),18,'B',INK)
 centered(52,y+286,340,f"${v['priceUsd']:,.2f} per ZEC",24,'N',INK)
 centered(52,y+325,340,short_date(v['quoteAsOf'])+', '+instant(v['quoteAsOf']).strftime('%H:%M UTC'),17,'A',GRAY)
 centered(52,y+356,340,v['quoteSource'],16,'B',GRAY)
 draw_table(p,y+6,x=430,w=718,end=y+270,plain=True)
 text(440,y+298,f"+${v['priceOnlyChangeUsd']:,.2f} from price alone",27,'B',blue)
 change=f"{v['priceOnlyChangePct']:+.1f}% versus the ${v['sourcePriceUsd']:,.0f} source price."
 para(440,y+340,698,change+'\n'+v['limitation'],18,'A',GRAY,maxh=69)
def draw_sources(p,y):
 draw_table(p,y,compact=True,end=521)
 rich(54,542,1090,'Original brand assets: <link href="https://zfnd.org/">Zcash Foundation</link> · <link href="https://shieldedlabs.net/">Shielded Labs</link> · <link href="https://zodl.com/">ZODL</link> · <link href="https://vizor.cash/">Vizor</link> · <link href="https://zakura.com/">Zakura</link> · <link href="https://github.com/tachyon-zcash">Project Tachyon</link> · <link href="https://openzcash.org/communities">OpenZcash community catalog</link>.',15,'A',GRAY,maxh=40)
 para(54,590,1090,p.get('visualCredit','Event artwork: Zcash Foundation. Field photo: Zcash Brazil. Logos belong to their respective organizations.'),15,'A',GRAY,maxh=40)
def draw_source_index(p,y):
 percol=math.ceil(len(p['entries'])/2)
 for i,b in enumerate(p['entries']):
  x=52+(i//percol)*569;yy=y+(i%percol)*72;w=527
  line(x,yy,w,LINE)
  raw=f'<link href="{html.escape(b["url"],quote=True)}" color="{INK}">{html.escape(norm(b["title"]))}</link>'
  rich(x,yy+10,w,raw,18,'B',INK,maxh=44)
  nums=b['pages'];ranges=[];lo=hi=nums[0]
  for num in nums[1:]+[None]:
   if num is not None and num==hi+1:hi=num;continue
   ranges.append(str(lo) if lo==hi else f'{lo}–{hi}');lo=hi=num
  page_label='Page'+('s ' if len(nums)>1 else ' ')+', '.join(ranges)
  text(x,yy+53,page_label+' / '+b['domain'],13.5,'A',GRAY)

previous=None
for PN,p in enumerate(D['pages'],1):
 C.bookmarkPage(f'p{PN}')
 if p['section']!=previous:C.addOutlineEntry(p['section'],f'p{PN}',level=0,closed=False);previous=p['section']
 kind=p.get('design',p['layout'])
 if kind=='cover':draw_cover(p)
 elif kind=='event':draw_event(p)
 else:
  y=header(p)
  if kind=='contents':draw_contents(p,y)
  elif kind=='orggrid':draw_grid(p,y,True)
  elif kind in ('zf','shielded'):draw_profile(p,y,kind=='shielded')
  elif kind=='zakura':draw_zakura(p,y)
  elif kind=='wallets':draw_wallets(p,y)
  elif kind in ('regional','ecosystem','coverage','methodology'):draw_grid(p,y)
  elif kind=='media':draw_media(p,y)
  elif kind=='chart':draw_chart(p,y)
  elif kind=='photo':draw_photo(p,y)
  elif kind=='africa':draw_africa(p,y)
  elif kind=='governance':draw_governance(p,y)
  elif kind=='treasury':draw_treasury(p,y)
  elif kind=='sources':draw_sources(p,y)
  elif kind=='source-index':draw_source_index(p,y)
  else:draw_table(p,y,icons=kind in ('funding','table'),compact=kind in ('appendix','payouts','approvals'))
  footer(p)
 C.showPage()
# Layout is validated before saving a deliverable. Table/container bounds are
# excluded: their child text is intentionally contained in those rectangles.
from validate_layout import validate_layout
geometry=validate_layout(checks)
if not geometry['ok']:raise ValueError(json.dumps(geometry['errors'],ensure_ascii=False,indent=2))
C.save();(R/'layout-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));(R/'layout-verification.json').write_text(json.dumps(geometry,indent=2));print('Built',len(D['pages']),'pages /',len(checks),'checked elements:',OUT)
