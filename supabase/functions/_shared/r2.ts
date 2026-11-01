// Private Cloudflare R2 bucket for Hello Videos, through R2's S3 API.
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (token scoped to this bucket only).
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { env } from './http.ts';

export interface R2 {
  presignPut(key: string, contentType: string, seconds: number): Promise<string>;
  presignGet(key: string, seconds: number): Promise<string>;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

export function r2(): R2 | null {
  const account = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET');
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return null;

  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}/`;
  const objectUrl = (key: string, seconds?: number) => {
    const url = new URL(base + key.split('/').map(encodeURIComponent).join('/'));
    if (seconds) url.searchParams.set('X-Amz-Expires', String(seconds));
    return url;
  };

  return {
    // Content-Type is part of the signature, so the browser must upload exactly that type.
    async presignPut(key, contentType, seconds) {
      const signed = await client.sign(
        new Request(objectUrl(key, seconds), { method: 'PUT', headers: { 'Content-Type': contentType } }),
        { aws: { signQuery: true, allHeaders: true } },
      );
      return signed.url;
    },
    async presignGet(key, seconds) {
      const signed = await client.sign(new Request(objectUrl(key, seconds), { method: 'GET' }), {
        aws: { signQuery: true },
      });
      return signed.url;
    },
    async size(key) {
      const res = await client.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
      return Number(res.headers.get('Content-Length') ?? '0');
    },
    async remove(key) {
      const res = await client.fetch(objectUrl(key), { method: 'DELETE' });
      // 204 when deleted; a missing file is fine too.
      if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`);
    },
  };
}
