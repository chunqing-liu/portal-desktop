import {describe,it,expect} from 'vitest';
import {historyWindowStart,historyRevealStart,HISTORY_WINDOW_PAGE} from '../desktop/renderer/chat/hooks/use-history-window';
const rows=(n:number)=>Array.from({length:n},(_,i)=>({kind:'separator' as const,id:String(i),text:''}));
describe('progressive chat history window',()=>{
 it('search expands older history without removing messages already visible',()=>{
  expect(historyRevealStart(rows(100),'20','80')).toBe(20);
  expect(historyRevealStart(rows(100),'60','25')).toBe(15);
 });
 it('initially exposes only the latest page',()=>{
  expect(rows(300).slice(historyWindowStart(rows(300)))).toHaveLength(HISTORY_WINDOW_PAGE);
  expect(historyWindowStart(rows(12))).toBe(0);
 });
 it('keeps the first visible message when newer replies arrive or older history is prepended',()=>{
  expect(historyWindowStart(rows(305),'260')).toBe(260);
  expect(historyWindowStart([{kind:'separator',id:'older',text:''},...rows(300)],'260')).toBe(261);
 });
 it('falls back safely after a full history rebuild replaces row identities',()=>{
  expect(historyWindowStart(rows(100),'removed')).toBe(60);
 });
});
