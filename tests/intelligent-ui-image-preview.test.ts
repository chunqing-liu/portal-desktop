import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntelligentUI } from '../desktop/renderer/shared/intelligent-ui/view';
import { ContentImage } from '../desktop/renderer/shared/intelligent-ui/content';
import { inlineImageBlob } from '../desktop/shared/remote-image';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('Intelligent UI image previews', () => {
  it.each(['https://images.example/dish?token=signed', png])('gives images a preview control without losing captions or referrer protection', src => {
    const html = renderToStaticMarkup(createElement(ContentImage, {src,label:'凉拌黄瓜',caption:'早餐配菜'}));
    expect(html).toContain('aria-label="预览 凉拌黄瓜"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('<figcaption>早餐配菜</figcaption>');
    expect(html).toContain(`src="${src}"`);
  });

  it('covers image nodes, media cards and gallery images through the full renderer', () => {
    const source = JSON.stringify({version:1,title:'食谱',state:{},body:[
      {id:'image',type:'image',src:png,label:'早餐'},
      {id:'media',type:'media',src:png,label:'午餐',value:'做法说明'},
      {id:'gallery',type:'gallery',children:[{id:'photo',type:'image',src:png,label:'晚餐'}]},
    ]});
    const html = renderToStaticMarkup(createElement(IntelligentUI, {source}));
    for (const name of ['早餐','午餐','晚餐']) expect(html).toContain(`aria-label="预览 ${name}"`);
    expect(html).toContain('做法说明');
  });

  it('uses a caption or default label for unnamed pictures', () => {
    expect(renderToStaticMarkup(createElement(ContentImage, {src:png,caption:'配菜'}))).toContain('aria-label="预览 配菜"');
    expect(renderToStaticMarkup(createElement(ContentImage, {src:png}))).toContain('aria-label="预览 图片"');
  });

  it('turns embedded raster data into the original bytes for desktop preview and download', async () => {
    const blob = inlineImageBlob(png)!;
    expect(blob.type).toBe('image/png');
    expect(Buffer.from(await blob.arrayBuffer())).toEqual(Buffer.from(png.split(',')[1], 'base64'));
  });

  it.each(['data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PGgxPg==', 'data:image/png;base64,A', 'https://images.example/a'])('does not treat unsupported data as an inline raster: %s', src => {
    expect(inlineImageBlob(src)).toBeUndefined();
  });
});
