import {PptxViewer,RECOMMENDED_ZIP_LIMITS} from '@aiden0z/pptx-renderer';
const stage=document.getElementById('stage')!, thumbs=document.getElementById('thumbs')!, status=document.getElementById('status')!;
const previous=document.getElementById('previous') as HTMLButtonElement,next=document.getElementById('next') as HTMLButtonElement;
let viewer:PptxViewer|undefined,index=0;
let handles:{dispose():void}[]=[];
function fit(){const data=viewer?.presentationData;if(data)stage.style.width=`${Math.max(1,Math.min(stage.parentElement!.clientWidth-64,(stage.parentElement!.clientHeight-64)*data.width/data.height))}px`;}
new ResizeObserver(fit).observe(stage.parentElement!);
async function show(value:number){
  if(!viewer)return;index=Math.max(0,Math.min(value,viewer.slideCount-1));
  await viewer.renderSlide(index);status.textContent=`${index+1} / ${viewer.slideCount}`;
  previous.disabled=index===0;next.disabled=index===viewer.slideCount-1;
  thumbs.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-current',String(i===index)));
}
previous.onclick=()=>void show(index-1);next.onclick=()=>void show(index+1);
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')void show(index+1);if(e.key==='ArrowLeft')void show(index-1);});
document.addEventListener('click',e=>{if((e.target as Element).closest('a'))e.preventDefault();},true);
window.addEventListener('message',async e=>{
  if(e.source!==parent||e.data?.type!=='pptx:open'||!(e.data.blob instanceof Blob)||e.data.blob.size>128*1024*1024)return;
  try{
    handles.forEach(h=>h.dispose());handles=[];viewer?.destroy();thumbs.replaceChildren();status.textContent='正在加载幻灯片…';
    viewer=new PptxViewer(stage,{zipLimits:RECOMMENDED_ZIP_LIMITS,lazySlides:true,lazyMedia:true,pdfjs:false});
    await viewer.open(e.data.blob,{renderMode:'slide'});fit();await show(0);
    // Thumbnails mount on demand so large decks do not render every slide eagerly.
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){const button=entry.target as HTMLButtonElement;const h=viewer?.renderThumbnailToContainer(Number(button.dataset.index),button,{width:100});if(h)handles.push(h);observer.unobserve(button);}}),{root:thumbs});
    handles.push({dispose:()=>observer.disconnect()});
    for(let i=0;i<viewer.slideCount;i++){const button=document.createElement('button');button.dataset.index=String(i);button.setAttribute('aria-label',`第 ${i+1} 张幻灯片`);button.setAttribute('aria-current',String(i===0));button.onclick=()=>void show(i);thumbs.append(button);observer.observe(button);}
  }catch{status.textContent='幻灯片无法预览，请打开原文件。';}
});
