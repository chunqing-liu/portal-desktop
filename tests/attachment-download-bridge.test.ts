import {afterEach,describe,it,expect,vi} from 'vitest';
import {registerDownloadBridge} from '../desktop/renderer/chat/services/attachment-download-bridge';
afterEach(()=>vi.unstubAllGlobals());
describe('attachment preview operations',()=>{
 it('executes once for repeated cards, validates scope and releases the final listener',async()=>{
  const parent={},target=Object.assign(new EventTarget(),{parent});
  vi.stubGlobal('window',target);vi.stubGlobal('location',{search:'?revision=current'});
  const fetch=vi.fn(async()=>Response.json({downloaded:true}));vi.stubGlobal('fetch',fetch);
  const first=registerDownloadBridge('https://echo.beings.town/a','att_one');
  const second=registerDownloadBridge('https://echo.beings.town/a','att_one');
  const send=(changes={})=>{const event=new Event('message');Object.assign(event,{source:parent,origin:'beings://desktop',ports:[{postMessage:vi.fn()}],data:{type:'beings:image-download',revision:'current',endpoint:'https://echo.beings.town/a',id:'att_one',action:'reveal',...changes}});target.dispatchEvent(event);};
  try{
   send();expect(fetch).toHaveBeenCalledTimes(1);
   send({endpoint:'https://echo.beings.town/b'});send({revision:'stale'});expect(fetch).toHaveBeenCalledTimes(1);
   first();send();expect(fetch).toHaveBeenCalledTimes(2);
   second();send();expect(fetch).toHaveBeenCalledTimes(2);
  }finally{first();second();}
 });
});
