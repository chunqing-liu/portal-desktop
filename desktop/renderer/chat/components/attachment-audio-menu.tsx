import {useDismissAttachmentMenu} from './use-dismiss-attachment-menu';
import {useCallback,useEffect,useId,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {audioMenuPosition} from '../services/audio-menu-position';
/** A top-layer popover tracks its own trigger, independently of the message scroller. */
export function AttachmentAudioMenu({name,children}:{name:string;children:ReactNode}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState<CSSProperties>({});
  useDismissAttachmentMenu(open,[trigger,popup],()=>{if(popup.current?.matches(':popover-open'))popup.current.hidePopover();setOpen(false);});
  const place=useCallback(()=>{
    const button=trigger.current;if(!button)return;
    const p=audioMenuPosition(button.getBoundingClientRect(),{width:innerWidth,height:innerHeight});
    const next={left:p.left,top:p.top,width:p.width,'--submenu-left':`${p.submenuLeft}px`,'--submenu-top':`${p.submenuTop}px`,'--submenu-width':`${p.submenuWidth}px`} as CSSProperties;
    setPosition(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  },[]);
  useEffect(()=>{
    if(!open)return;
    place();let frame=0;
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;place();});};
    const messages=trigger.current?.closest('#messages');
    const mutation=new MutationObserver(schedule);
    if(messages)mutation.observe(messages,{subtree:true,childList:true,characterData:true});
    document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
    return ()=>{cancelAnimationFrame(frame);mutation.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
  },[open,place]);
  return <>
    <button ref={trigger} className="audio-menu-trigger" type="button" aria-label={`${name} 音频操作`} aria-expanded={open} aria-controls={id} popoverTarget={id} onClick={place}>···</button>
    {createPortal(<div ref={popup} id={id} popover="auto" className="audio-floating-menu" style={position} onToggle={event=>setOpen((event.nativeEvent as ToggleEvent).newState==='open')} onMouseDown={event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(target){event.preventDefault();target.focus({preventScroll:true});}}}>{children}</div>,document.body)}
  </>;
}
