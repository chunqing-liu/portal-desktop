import {describe, expect, it, vi} from 'vitest';
import {AttachmentMessages, messageMarker, messageReferences, validateMessage} from '../desktop/renderer/chat/services/attachment-messages';
const id = 'msg_' + 'a'.repeat(64), other = 'msg_' + 'b'.repeat(64);
const view = {version:1,message_id:id,channel:'portal',scene_id:'room',created_at:1,delivery_status:'pending',parts:[{type:'text',text:'original'}]};
describe('attachment message identity', () => {
  it('takes the last valid standalone marker and preserves order without duplicates', () => {
    expect(messageReferences(`${messageMarker(other)}\ntext\n[attachment-message:v1:${id},${other},${id}]\n[attachment-message:v1:msg_invalid]`)).toEqual([id,other]);
    expect(messageReferences(`inline ${messageMarker(id)}`)).toEqual([]);
  });
  it('coalesces reads and rejects mismatched responses', async () => {
    const request = vi.fn(async () => Response.json(view)); const service = new AttachmentMessages(request);
    const [a,b] = await Promise.all([service.get(id), service.get(id)]); expect(a).toBe(b); expect(request).toHaveBeenCalledTimes(1);
    expect(() => validateMessage(view,other)).toThrow();
  });
  it('lists all pages without treating pending as full history', async () => {
    const request = vi.fn(async (url:string) => Response.json({messages:[url.includes('cursor=') ? {...view,message_id:other} : view],next_cursor:url.includes('cursor=') ? null : 'next'}));
    expect((await new AttachmentMessages(request).list()).map(v => v.message_id)).toEqual([id,other]);
  });
});
