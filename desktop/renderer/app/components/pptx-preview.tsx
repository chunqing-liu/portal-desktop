import {useRef} from 'react';
export function PptxPreview({blob}:{blob:Blob}) {
  const frame=useRef<HTMLIFrameElement>(null);
  return <iframe ref={frame} title="幻灯片预览" sandbox="allow-scripts" src={new URL('pptx-preview.html',location.href).href} onLoad={()=>frame.current?.contentWindow?.postMessage({type:'pptx:open',blob},'*')}/>;
}
