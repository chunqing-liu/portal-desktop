/** Client receipt protocol; deliberately contains no credentials or image URLs. */
export interface ImageGenerationJob {
  index: number;
  title: string;
  submission: 'accepted' | 'rejected' | 'unknown';
  generation_id: string | null;
  client_request_id: string;
  error_code: string | null;
}
export interface ImageGenerationReceipt {
  type: 'being.image-generation';
  version: 1;
  being_id: string;
  jobs: ImageGenerationJob[];
}
export const generationKey = /^[A-Za-z0-9_-]{1,128}$/;
export const generationId = /^gen_[A-Za-z0-9_-]{1,124}$/;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, any>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const nullableString = (value: unknown) => value === null || typeof value === 'string' && value.length <= 256;

export function isImageGenerationText(text: string) {
  return /^\s*\{/.test(text) && /"type"\s*:\s*"being\.image-generation"/.test(text.slice(0, 4096));
}
export function parseImageGenerationReceipt(text: string): ImageGenerationReceipt | null {
  if (text.length > 64 * 1024) return null;
  try {
    const value = JSON.parse(text);
    if (!object(value) || !exactKeys(value, ['type', 'version', 'being_id', 'jobs']) || value.type !== 'being.image-generation' || value.version !== 1 ||
        typeof value.being_id !== 'string' || !generationKey.test(value.being_id) || !Array.isArray(value.jobs) || !value.jobs.length || value.jobs.length > 24) return null;
    const keys = new Set<string>(), ids = new Set<string>();
    for (const [i, job] of value.jobs.entries()) {
      if (!object(job) || !exactKeys(job, ['index', 'title', 'submission', 'generation_id', 'client_request_id', 'error_code']) ||
          job.index !== i + 1 || typeof job.title !== 'string' || !job.title.trim() || job.title.length > 200 ||
          !['accepted', 'rejected', 'unknown'].includes(job.submission) || typeof job.client_request_id !== 'string' || !generationKey.test(job.client_request_id) ||
          !(job.generation_id === null || typeof job.generation_id === 'string' && generationId.test(job.generation_id)) ||
          job.submission === 'accepted' && job.generation_id === null || job.submission === 'rejected' && job.generation_id !== null || !nullableString(job.error_code) ||
          keys.has(job.client_request_id) || job.generation_id && ids.has(job.generation_id)) return null;
      keys.add(job.client_request_id); if (job.generation_id) ids.add(job.generation_id);
    }
    return value as ImageGenerationReceipt;
  } catch { return null; }
}
export const generationStatuses = ['queued', 'running', 'uncertain', 'succeeded', 'failed', 'cancelled'] as const;
export interface GeneratedImage {
  id: string;
  attachment_id: string;
  view_url: string;
  mime: string;
}
export interface GenerationSnapshot {
  id: string;
  client_request_id: string;
  status: typeof generationStatuses[number];
  stage: string;
  deadline: number;
  poll_after_ms: number;
  required_action: string | null;
  error_code: string | null;
  availability: 'pending' | 'available' | 'expired';
  outputs: GeneratedImage[];
}
/** Validate the upstream response, strip echoed prompts and all unrelated fields. */
export function generationSnapshot(value: unknown, gateway: string): GenerationSnapshot {
  if (!object(value) || typeof value.id !== 'string' || !generationId.test(value.id) ||
      typeof value.client_request_id !== 'string' || !generationKey.test(value.client_request_id) || !generationStatuses.includes(value.status) ||
      typeof value.stage !== 'string' || value.stage.length > 128 || !Number.isSafeInteger(value.deadline) || value.deadline <= 0 ||
      !Number.isSafeInteger(value.poll_after_ms) || value.poll_after_ms < 0 || !nullableString(value.error_code) ||
      !(value.required_action === null || value.required_action === 'operator_reconciliation_required') || !['pending', 'available', 'expired'].includes(value.availability)) throw new Error('Invalid generation response');
  const outputs: GeneratedImage[] = [];
  if (value.status === 'succeeded' && value.availability === 'available') {
    if (!object(value.manifest) || value.manifest.version !== 1 || value.manifest.kind !== 'image' || !Array.isArray(value.manifest.outputs) || !value.manifest.outputs.length || value.manifest.outputs.length > 16) throw new Error('Missing image manifest');
    for (const out of value.manifest.outputs) {
      if (!object(out) || typeof out.id !== 'string' || out.id.length > 256 || !object(out.attachment) || out.attachment.source !== 'being-service' ||
          typeof out.attachment.attachment_id !== 'string' || !/^att_[A-Za-z0-9_-]{1,124}$/.test(out.attachment.attachment_id) ||
          !/^image\/(png|jpeg|webp|gif|avif)$/.test(out.mime) || typeof out.view_url !== 'string' || out.view_url.length > 16384) throw new Error('Invalid image output');
      const url = new URL(out.view_url);
      if (url.origin !== gateway || url.protocol !== 'https:' || url.username || url.password || url.hash ||
          url.pathname !== `/api/being-service/v1/assets/${out.attachment.attachment_id}/view` || !url.searchParams.get('token')) throw new Error('Invalid image URL');
      outputs.push({id: out.id, attachment_id: out.attachment.attachment_id, view_url: out.view_url, mime: out.mime});
    }
  }
  return {id:value.id, client_request_id:value.client_request_id, status:value.status, stage:value.stage,
    deadline:value.deadline, poll_after_ms:value.poll_after_ms, required_action:value.required_action,
    error_code:value.error_code, availability:value.availability, outputs};
}
export function generationWait(snapshot: GenerationSnapshot, now = Date.now()): {delay?: number; notice?: string} {
  if (snapshot.status === 'uncertain' || snapshot.required_action) return {notice:'结果待核对，需要人工对账；不会自动重新生成。'};
  if (['succeeded', 'failed', 'cancelled'].includes(snapshot.status)) return {};
  if (snapshot.deadline <= now) return {notice:'已超过任务截止时间，结果待核对。可重新查询，不会重新生成。'};
  return {delay:Math.min(Math.max(1000, snapshot.poll_after_ms), 60000, snapshot.deadline - now)};
}
