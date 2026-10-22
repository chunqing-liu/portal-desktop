import { generationWait, type GenerationSnapshot, type ImageGenerationJob } from '../../../shared/image-generation';

export interface GenerationViewState {
  snapshot?: GenerationSnapshot;
  notice?: string;
  busy: boolean;
  canQuery: boolean;
}
export class GenerationQueryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export type GenerationQuery = (path: string, signal: AbortSignal) => Promise<GenerationSnapshot>;
export function imageGenerationQuery(endpoint: string, being: string): GenerationQuery {
  return async (path, signal) => {
    const response = await fetch(path, {headers:{'X-Portal-Being-Endpoint':endpoint, 'X-Portal-Generation-Being':being},
      signal, cache:'no-store', credentials:'omit'});
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new GenerationQueryError(typeof data?.error === 'string' ? data.error : '暂时无法查询生成状态。', response.status);
    }
    return response.json();
  };
}
/** One read-only polling lifecycle. A restored history receipt starts a fresh GET, never a POST. */
export function watchImageGeneration(job: ImageGenerationJob, query: GenerationQuery, update: (state: GenerationViewState) => void) {
  let stopped = false, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let snapshot: GenerationSnapshot | undefined, failures = 0;
  function publish(notice?: string, busy = false, canQuery = false) { if (!stopped) update({snapshot, notice, busy, canQuery}); }
  function schedule(delay: number) { timer = setTimeout(() => { timer = undefined; void poll(); }, delay); }
  async function poll() {
    if (stopped || controller) return;
    if (job.submission === 'rejected') { publish(`提交未受理${job.error_code ? `：${job.error_code}` : ''}`); return; }
    const current = new AbortController(); controller = current;
    publish(undefined, true);
    try {
      const id = snapshot?.id || job.generation_id;
      const result = await query('/api/image-generations/' + (id || `by-request/${job.client_request_id}`),
        AbortSignal.any([current.signal, AbortSignal.timeout(30000)]));
      if (current.signal.aborted || stopped) return;
      if (!result || result.client_request_id !== job.client_request_id || id && result.id !== id) throw new GenerationQueryError('任务标识与回执不一致，请核对回执。', 409);
      snapshot = result; failures = 0;
      const next = generationWait(result);
      publish(next.notice, false, !!next.notice);
      if (next.delay !== undefined) schedule(next.delay);
    } catch (error) {
      if (current.signal.aborted || stopped) return;
      const permanent = error instanceof GenerationQueryError && [400,401,403,404,409,405].includes(error.status);
      failures++;
      const retrying = !permanent && failures < 5;
      publish(error instanceof GenerationQueryError ? error.message + (retrying ? ' 正在自动重连…' : '') : retrying ? '连接中断，正在重连…' : '查询连接中断，请重新查询。', false, !retrying);
      if (retrying) schedule(Math.min(2000 * 2 ** (failures - 1), 30000));
    } finally { if (controller === current) controller = undefined; }
  }
  void poll();
  return {
    retry() { if (stopped || controller) return; clearTimeout(timer); failures = 0; void poll(); },
    stop() { stopped = true; clearTimeout(timer); controller?.abort(); },
  };
}
