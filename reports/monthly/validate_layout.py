"""Geometry checks on the actual laid-out text, not estimated character counts."""
from collections import defaultdict

def validate_layout(elements):
    bypage=defaultdict(list);errors=[]
    for e in elements:bypage[e['page']].append(e)
    for page,all_items in bypage.items():
        text=[e for e in all_items if e['kind'] in ('text','paragraph') and e.get('text')]
        rules=[e for e in all_items if e['kind']=='rule']
        for i,a in enumerate(text):
            ax,ay,aw,ah=a['bounds']
            for b in text[i+1:]:
                bx,by,bw,bh=b['bounds'];ox=min(ax+aw,bx+bw)-max(ax,bx);oy=min(ay+ah,by+bh)-max(ay,by)
                if ox>1 and oy>1:errors.append({'page':page,'kind':'text-overlap','a':a['text'][:100],'b':b['text'][:100]})
            for rule in rules:
                rx,ry,rw,_=rule['bounds']
                if ay+1<ry<ay+ah-1 and min(ax+aw,rx+rw)-max(ax,rx)>1:errors.append({'page':page,'kind':'rule-crosses-text','text':a['text'][:100]})
    return {'ok':not errors,'pages':len(bypage),'elements':len(elements),'errors':errors}
