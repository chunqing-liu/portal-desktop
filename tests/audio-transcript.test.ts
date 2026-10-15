import {expect,it} from 'vitest';
import {displayTranscript} from '../desktop/renderer/chat/services/audio-transcript';
it('shows spoken content without the parser preamble for one speaker',()=>{
 expect(displayTranscript('[说话人编号仅在本录音内有效，由模型根据声音区分，不代表真实身份或已确认的销售/客户角色；unknown 表示无法可靠区分。]\n[说话人 A] The order number is 42. Do not cancel it.')).toBe('The order number is 42. Do not cancel it.');
});
it('keeps multiple speakers and uncertain audio markers',()=>{
 const text='[说话人 A] hello\n[说话人 B] [unclear]\n[说话人不确定] no';
 expect(displayTranscript(text)).toBe(text);
});
