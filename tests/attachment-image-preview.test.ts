import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AttachmentCard} from '../desktop/renderer/chat/components/attachments';
import {AttachmentImageUpload} from '../desktop/renderer/chat/components/attachment-image-upload';
const part:any={type:'attachment',attachment_id:'att_image',name:'picture.png',mime:'image/png',size:3,parse_status:'parsing'};
describe('image preview continuity',()=>{
  it('uses the local thumbnail immediately after upload while parsing',()=>{
    const html=renderToStaticMarkup(createElement(AttachmentCard,{part,endpoint:'https://echo.beings.town/a',localImage:{src:'blob:local-preview',blob:new Blob(['png'])}}));
    expect(html).toContain('src="blob:local-preview"');expect(html).not.toContain('attachment-image-placeholder');
  });
  it('overlays progress on the thumbnail and removes only progress on completion',()=>{
    const props={src:'blob:local-preview',name:'picture.png',percent:45,complete:false};
    const pending=renderToStaticMarkup(createElement(AttachmentImageUpload,props));
    expect(pending).toContain('src="blob:local-preview"');expect(pending).toContain('45%');expect(pending).toContain('<progress');
    const done=renderToStaticMarkup(createElement(AttachmentImageUpload,{...props,complete:true,percent:100}));
    expect(done).toContain('src="blob:local-preview"');expect(done).not.toContain('<progress');expect(done).not.toContain('上传完成');
  });
  it('renders a skeleton without loading text for remote images',()=>{
    const html=renderToStaticMarkup(createElement(AttachmentCard,{part,endpoint:'https://echo.beings.town/a'}));
    expect(html).toContain('attachment-image-skeleton');expect(html).toContain('aria-busy="true"');expect(html).not.toContain('正在加载图片…');
  });
});
