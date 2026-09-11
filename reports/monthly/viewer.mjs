import * as pdfjs from './pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='./pdfjs/pdf.worker.min.mjs';
const $=id=>document.getElementById(id);
const selector=$('slide-select'),thumbs=$('thumbnails'),sections=$('section-select'),frame=$('page-frame');
const pdfReady=pdfjs.getDocument({url:'monthly/'+pdfFilename+'?v='+revision,standardFontDataUrl:'./pdfjs/standard_fonts/',wasmUrl:'./pdfjs/wasm/'}).promise;
let current=0,capacity=6,start=0,request=0,job=null;
const filename=i=>'monthly/page-'+String(i+1).padStart(2,'0')+'.png?v='+revision;
pages.forEach((p,i)=>{
 const option=document.createElement('option');option.value=i;option.textContent=i+1;selector.append(option);
 if(i===0||pages[i-1].section!==p.section){const section=document.createElement('option');section.value=i;section.textContent=p.section;sections.append(section);}
});
function drawThumbs(){
 thumbs.replaceChildren();const end=Math.min(pages.length,start+capacity);
 for(let i=start;i<end;i++){
  const button=document.createElement('button');button.className='thumb';button.setAttribute('aria-label','Page '+(i+1)+': '+pages[i].title);button.setAttribute('aria-current',String(i===current));
  const number=document.createElement('span');number.className='number';number.textContent=i+1;
  const picture=document.createElement('img');picture.src=filename(i);picture.alt='';button.append(number,picture);button.onclick=()=>show(i);thumbs.append(button);
 }
 $('thumb-range').textContent=(start+1)+'–'+end;$('thumb-prev').disabled=start===0;$('thumb-next').disabled=end===pages.length;
}
function linksFor(page){
 return page.links.map(link=>{
  const a=document.createElement('a');a.className='source-link';a.title=link.label;a.setAttribute('aria-label',link.label);a.style.cssText=`left:${link.x*100}%;top:${link.y*100}%;width:${link.w*100}%;height:${link.h*100}%`;
  if(link.url){a.href=link.url;a.target='_blank';a.rel='noopener';}
  else{a.href='#'+(link.page+1);a.onclick=e=>{e.preventDefault();show(link.page);};}
  return a;
 });
}
async function renderPage(changed=false){
 const token=++request,n=current;
 if(job){job.cancel();job=null;}
 frame.setAttribute('aria-busy','true');
 if(changed){const status=document.createElement('span');status.className='loading-page';status.textContent='Loading page…';frame.replaceChildren(status);frame.dataset.renderedPage='';}
 try{
  const pdf=await pdfReady;if(token!==request)return;
  const page=await pdf.getPage(n+1);if(token!==request)return;
  const box=frame.getBoundingClientRect(),dpr=Math.max(2,window.devicePixelRatio||1);
  if(box.width<=0||box.height<=0)return;
  const view=page.getViewport({scale:box.width/1200*dpr});
  const canvas=document.createElement('canvas');canvas.id='slide-image';canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.setAttribute('role','img');canvas.setAttribute('aria-label',pages[n].alt);
  const context=canvas.getContext('2d',{alpha:false});job=page.render({canvasContext:context,viewport:view});await job.promise;
  if(token!==request)return;
  job=null;frame.replaceChildren(canvas,...linksFor(pages[n]));frame.dataset.renderedPage=String(n+1);frame.dataset.renderer='pdf';frame.dataset.pixelRatio=String(dpr);frame.setAttribute('aria-busy','false');
 }catch(error){
  if(token!==request||error.name==='RenderingCancelledException')return;
  job=null;frame.setAttribute('aria-busy','false');frame.dataset.renderer='error';
  const message=document.createElement('span');message.className='loading-page';message.textContent='The preview could not load. Use Download PDF to open the report.';frame.replaceChildren(message);
 }
}
function show(n){
 current=Math.max(0,Math.min(pages.length-1,n));const p=pages[current];selector.value=current;
 let section=current;while(section>0&&pages[section-1].section===p.section)section--;sections.value=section;
 $('previous').disabled=current===0;$('next').disabled=current===pages.length-1;
 $('announcement').textContent='Page '+(current+1)+' of '+pages.length+'. '+p.title;
 if(current<start||current>=start+capacity)start=Math.floor(current/capacity)*capacity;
 drawThumbs();history.replaceState(null,'','#'+(current+1));renderPage(true);
}
selector.onchange=()=>show(+selector.value);sections.onchange=()=>show(+sections.value);
$('previous').onclick=()=>show(current-1);$('next').onclick=()=>show(current+1);
$('thumb-prev').onclick=()=>{start=Math.max(0,start-capacity);drawThumbs();};
$('thumb-next').onclick=()=>{start=Math.min(pages.length-1,start+capacity);drawThumbs();};
document.addEventListener('keydown',e=>{
 if(e.target.closest('select,input,textarea,[contenteditable]'))return;
 if(e.key===' '&&e.target.closest('a,button'))return;
 if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(current+1);}
 else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(current-1);}
 else if(e.key==='Home'){e.preventDefault();show(0);}
 else if(e.key==='End'){e.preventDefault();show(pages.length-1);}
});
$('fullscreen').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();};
document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Enter full screen'));
window.addEventListener('hashchange',()=>show((Number(location.hash.slice(1))||1)-1));
new ResizeObserver(()=>{const h=(thumbs.clientWidth-37)*9/16+18;capacity=Math.max(1,Math.floor(thumbs.clientHeight/Math.max(h,1)));start=Math.floor(current/capacity)*capacity;drawThumbs();}).observe(thumbs);
let resizeTimer;
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderPage(),80);}).observe(frame);
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderPage(),80);});
show((Number(location.hash.slice(1))||1)-1);
