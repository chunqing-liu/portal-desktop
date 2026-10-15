import {useRef,useState,type ReactNode} from 'react';
import {useDismissAttachmentMenu} from './use-dismiss-attachment-menu';
export function AttachmentFileMenu({name,children}:{name:string;children:ReactNode}) {
  const menu=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(false);
  const close=()=>{if(menu.current)menu.current.open=false;setOpen(false);};
  useDismissAttachmentMenu(open,[menu],close);
  return <details ref={menu} className="attachment-menu" onToggle={event=>setOpen(event.currentTarget.open)} onKeyDown={event=>{if(event.key==='Escape')close();}}>
    <summary aria-label={`${name} 文件操作`}>···</summary><div>{children}</div>
  </details>;
}
