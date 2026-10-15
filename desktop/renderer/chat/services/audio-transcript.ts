/** Remove the parser's fixed presentation preamble, never uncertain speech markers. */
export function displayTranscript(text:string) {
  const preamble='[说话人编号仅在本录音内有效，由模型根据声音区分，不代表真实身份或已确认的销售/客户角色；unknown 表示无法可靠区分。]';
  let value=text.trim();
  if(value.startsWith(preamble))value=value.slice(preamble.length).trim();
  const speakers=[...value.matchAll(/\[说话人 ([A-Z])\]/g)].map(match=>match[1]);
  if(new Set(speakers).size===1 && !value.includes('[说话人不确定]'))value=value.replace(/\[说话人 [A-Z]\]\s*/g,'');
  return value;
}
