import {afterEach,describe,expect,it,vi} from 'vitest';
import {imagePreviewSize,rememberImageSize} from '../desktop/renderer/chat/services/image-preview-size';
afterEach(()=>vi.unstubAllGlobals());
describe('image thumbnail size reservations',()=>{
 it('restores actual thumbnail bounds across scenes without enlarging small images',()=>{
  const store=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>store.get(key),setItem:(key:string,value:string)=>store.set(key,value)});
  rememberImageSize('a','portrait',200,1000);expect(imagePreviewSize('a','portrait')).toEqual({width:66,height:322});
  rememberImageSize('a','landscape',1000,200);expect(imagePreviewSize('a','landscape')).toEqual({width:222,height:46});
  rememberImageSize('a','small',40,30);expect(imagePreviewSize('a','small')).toEqual({width:42,height:32});
  expect(imagePreviewSize('b','small')).toBeUndefined();
 });
 it('ignores corrupt metadata and unavailable storage',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>'{bad',setItem:()=>{throw Error('denied');}});
  expect(imagePreviewSize('a','x')).toBeUndefined();expect(()=>rememberImageSize('a','x',100,100)).not.toThrow();
 });
});
