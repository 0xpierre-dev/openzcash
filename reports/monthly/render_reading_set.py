"""Render an explicitly reviewed issue using the fixed Editorial 4.0 reading order.
No discovery, date inference or carry-forward happens in the renderer.
"""
import argparse, hashlib, json, math
from pathlib import Path
from pypdf import PdfWriter
from reportlab.lib.utils import ImageReader
from editorial_layout import (PAPER,INK,GOLD,GREEN,canvas,HexColor,pdfmetrics,text,centered_text,
    cover_page,blank_page,finish_page,paragraph,add_link)

ROLES=['cover','zf','shielded-labs','tachyon','zakura','wallets','hardware','supporting-stack','products','highlights-handoff']

def rule(c,x,y,w):
    c.setStrokeColor(HexColor('#c7cec2'));c.setLineWidth(.8);c.line(x,y,x+w,y)

def image(c,path,x,y,w,h):
    im=ImageReader(str(path));iw,ih=im.getSize();scale=min(w/iw,h/ih)
    c.drawImage(im,x+(w-iw*scale)/2,y+(h-ih*scale)/2,iw*scale,ih*scale,mask='auto')

def lines(value,font,size,width):
    result=[];line=''
    for word in str(value).split():
        candidate=(line+' '+word).strip()
        if line and pdfmetrics.stringWidth(candidate,font,size)>width:result.append(line);line=word
        else:line=candidate
    if line:result.append(line)
    return result

def para(c,x,y,value,w,size=20,leading=25,maxlines=3,color=INK,font='A'):
    ls=lines(value,font,size,w)
    if len(ls)>maxlines:raise ValueError(f'Text requires editing: {value}')
    for i,s in enumerate(ls):text(c,x,y-leading*i,s,size,font,color)
    return len(ls)*leading

def build_page(p,i,kind,issue,assets):
    if p['role']=='cover':
        page=cover_page(kind,issue,p['metrics'])
        return page,dict(title='OPENZCASH '+kind.upper(),section='Overview',links=[],text=page.extract_text())
    buf,c,links=blank_page(i,p['section'],kind)
    size=min(48,1096/pdfmetrics.stringWidth(p['title'],'D',1))
    if size<37:raise ValueError('Title too long: '+p['title'])
    text(c,49,567,p['title'],size,'D')
    para(c,49,530,p.get('subtitle',''),1096,19,23,2,'#63695f')
    mode=p['layout'];accent=GREEN if kind=='operations' else '#986b10'
    if mode=='profile':
        image(c,assets/p['logo'],100,242,245,245)
        centered_text(c,222,194,p['name'],36,'D',INK)
        centered_text(c,222,155,p.get('tag',''),15,'B','#63695f')
        rows=p['rows'];step=min(116,405/len(rows))
        for j,row in enumerate(rows):
            y=482-j*step;rule(c,421,y,729)
            text(c,421,y-35,f'{j+1:02}',25,'D','#697065')
            text(c,473,y-32,row['title'],26,'B')
            para(c,473,y-64,row['detail'],671,20,25,3,'#63695f')
            if row.get('url'):add_link(c,links,row['url'],(421,y-step+3,1150,y-4),row['title'])
    elif mode=='cards':
        rows=p['rows'];cols=2;step=206 if len(rows)<=4 else 138;cw=527
        for j,row in enumerate(rows):
            x=49+(j%cols)*574;y=480-(j//cols)*step;rule(c,x,y,cw)
            text(c,x,y-36,row['title'],27,'B',accent)
            para(c,x,y-72,row['detail'],cw,21,26,4,'#555d53')
            if row.get('url'):add_link(c,links,row['url'],(x,y-step+8,x+cw,y-5),row['title'])
    elif mode=='wallets':
        assert [r['name'] for r in p['rows']]==['ZODL','Zingo','Vizor','Zkool']
        for j,row in enumerate(p['rows']):
            x=49+(j%2)*574;y=482-(j//2)*208;rule(c,x,y,527);color=row.get('accent',INK)
            if row['name']=='ZODL':image(c,assets/row['logo'],x+8,y-58,176,44)
            elif row['name']=='Zkool':image(c,assets/row['logo'],x+4,y-88,88,80)
            else:
                c.saveState()
                if row['name']=='Zingo':
                    clip=c.beginPath();clip.circle(x+26.5,y-35.5,24);c.clipPath(clip,stroke=0,fill=0)
                image(c,assets/row['logo'],x+2,y-60,49,49);c.restoreState()
                text(c,x+68,y-46,row['name'].upper(),36,'D',color)
            text(c,x+(118 if row['name']=='Zkool' else 5),y-101,row['version'],46,'D',color)
            text(c,x+(260 if row['name']=='Zkool' else 198),y-97,row['platform'],16,'B','#63695f')
            text(c,x+5,y-128,row['date']+' / '+row.get('state','Stable'),16,'A','#63695f')
            para(c,x+5,y-157,row['detail'],518,19,23,2)
            add_link(c,links,row['url'],(x,y-197,x+527,y-3),f"Read {row['name']} release")
    elif mode=='table':
        widths=p.get('widths',[.47,.20,.33]);xs=[49]
        for w in widths[:-1]:xs.append(xs[-1]+1096*w)
        headers=p['headers'];rows=p['rows'];step=min(90,400/max(1,len(rows)))
        for x,h in zip(xs,headers):text(c,x,486,h.upper(),13,'B','#63695f')
        rule(c,49,471,1101)
        size=p.get('fontSize',18)
        for j,row in enumerate(rows):
            y=471-j*step
            for k,(x,w,value) in enumerate(zip(xs,widths,row['cells'])):
                para(c,x,y-25,value,1096*w-20,size,size+4,math.floor((step-10)/(size+4)),accent if k==0 else INK,'B' if k==0 else 'A')
            if row.get('url'):add_link(c,links,row['url'],(49,y-step+2,1150,y-2),row['cells'][0])
            rule(c,49,y-step,1101)
    elif mode=='chart':
        rows=p['rows'];maxvalue=max(r['value'] for r in rows);height=350;top=465;step=height/len(rows)
        for j,row in enumerate(rows):
            y=top-j*step
            text(c,49,y-23,row['label'],21,'B')
            width=row['value']/maxvalue*645
            c.setFillColor(HexColor(accent));c.roundRect(295,y-38,width,29,4,fill=1,stroke=0)
            text(c,964,y-23,row['display'],24,'D')
        text(c,295,74,'USD / bars start at zero',15,'A','#63695f')
        if p.get('note'):para(c,49,107,p['note'],1096,18,22,2,'#63695f')
    elif mode=='highlights':
        for j,row in enumerate(p['rows']):
            y=476-j*131;text(c,49,y,row['title'],28,'B');para(c,49,y-35,row['detail'],629,21,26,3,'#63695f')
        rule(c,742,488,0);c.setStrokeColor(HexColor('#c7cec2'));c.line(742,84,742,492)
        text(c,797,463,'NEXT PUBLICATION',14,'B',GREEN);text(c,794,394,'OPERATIONS',65,'D',GREEN)
        para(c,797,345,'Funding. Decisions. Communities.',332,23,28,2)
        for j,(value,label) in enumerate(p['metrics']):
            y=280-j*60;text(c,797,y,value,37,'D',GREEN);para(c,870,y+4,label,276,17,21,2,'#63695f')
        c.setFillColor(HexColor(GREEN));c.roundRect(798,79,352,55,3,stroke=0,fill=1)
        text(c,821,97,'Open Operations',21,'B',PAPER)
        add_link(c,links,f"https://openzcash.org/monthly/{issue['id']}?publication=operations#1",(798,79,1150,134),'Open Operations in this reader')
    else:raise ValueError(mode)
    for ref in p.get('sourceLinks',[]):
        # The headline is a visible original-source link; source register keeps full provenance.
        add_link(c,links,ref,(49,550,1150,598),'Read original source')
    return finish_page(buf,c,links,p['title'],p['section'])

def render(source,output,assets):
    data=json.loads(source.read_text());issue=data['issue'];output.mkdir(parents=True,exist_ok=True)
    assert [p['role'] for p in data['pages']['monthly']]==ROLES
    assert issue['periodStart'][:7]==issue['month']==issue['periodEnd'][:7]
    bundle={k:data[k] for k in ('sources','communities','requests','zcg')}
    bundle.update(id=issue['id'],evidenceCutoff=issue['periodEnd'],reviewedAt=issue['reviewedAt'],documents={})
    for kind,pp in data['pages'].items():
        writer=PdfWriter();manifest=[]
        for i,p in enumerate(pp,1):
            page,entry=build_page(p,i,kind,issue,assets);writer.add_page(page);entry['number']=i;manifest.append(entry)
            writer.add_outline_item(entry['title'],i-1)
        filename=f"OpenZcash-{kind.title()}-{issue['filenameDate']}.pdf";path=output/filename
        writer.add_metadata({'/Title':f"OpenZcash {kind.title()} - {issue['titleDate']}",'/Author':'OpenZcash','/Subject':f"Activities {issue['periodStart']} to {issue['periodEnd']}; retrospective evidence dated in source records."})
        with path.open('wb') as f:writer.write(f)
        man=kind+'-pages.json';(output/man).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        bundle['documents'][kind]={k:issue[k] for k in ['id','month','label','kind','periodStart','periodEnd','financialMonth']}
        bundle['documents'][kind].update(designVersion='Editorial 4.0 / Covers 2',pdf=filename,manifest=man,pageCount=len(pp))
    (output/'reading-set.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'id':issue['id'],'pages':{k:len(v) for k,v in data['pages'].items()}}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--assets',type=Path,required=True);a=p.parse_args();render(a.source,a.output,a.assets)
