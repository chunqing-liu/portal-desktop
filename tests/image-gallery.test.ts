import { describe, expect, it } from 'vitest';
import { imageGallery } from '../desktop/shared/image-gallery';

describe('desktop image gallery boundary', () => {
  const item = {src:'https://beings.town/image?token=a%2Fb',name:'第一张'};
  it('preserves order and signed URLs, deduplicates identical images', () => {
    expect(imageGallery({id:'batch',items:[item,{...item,name:'duplicate'}]})).toEqual({id:'batch',items:[item]});
    expect(imageGallery({id:'batch',items:[]})).toEqual({id:'batch',items:[]});
  });
  it('rejects malformed messages, unsafe image URLs, and unbounded batches', () => {
    for (const value of [null,{}, {id:'',items:[]}, {id:'x',items:[null]}, {id:'x',items:Array(385).fill(item)},
      ...['file:///etc/passwd','javascript:alert(1)','http://example.com/a','https://user:password@example.com/a'].map(src=>({id:'x',items:[{...item,src}]}))]) {
      expect(imageGallery(value)).toBeNull();
    }
  });
});
