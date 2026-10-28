import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AttachmentProcessing} from '../desktop/renderer/chat/components/attachment-processing';
const render=(message?:any)=>renderToStaticMarkup(createElement(AttachmentProcessing,{items:message?[message]:[]}));
describe('attachment assistant status transitions',()=>{
 it('moves from queued to upload to parse, then disappears when ready',()=>{
  const message:any={kind:'message',role:'user',queued:true,attachmentUploads:[{name:'report.pdf',size:10}]};
  expect(render(message)).toContain('等待发送');
  message.attachmentUploads[0].progress={phase:'uploading',loaded:5,total:10};
  expect(render(message)).toContain('正在上传附件');
  message.attachmentUploads[0].progress.phase='complete';
  expect(render(message)).toContain('正在解析附件');
  message.attachmentViews=[{parts:[{type:'attachment',name:'report.pdf',parse_status:'parsing',progress:{completed:1,total:2,unit:'page'}}]}];
  expect(render(message)).toContain('已处理 1 / 2 页');
  message.attachmentViews[0].parts[0].parse_status='ready';
  expect(render(message)).toBe('');
  message.queued=false;
  expect(render(message)).toBe('');
 });
 it('does not keep a failed send in an endless processing state',()=>{
  expect(render({kind:'message',queued:true,retry:()=>{},attachmentUploads:[{name:'bad.pdf',size:1}]})).toBe('');
 });
});
