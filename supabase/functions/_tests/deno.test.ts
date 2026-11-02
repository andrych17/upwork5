// deno test --allow-env --allow-net=registry.npmjs.org supabase/functions/_tests/deno.test.ts
// (bash supabase/tests/run-deno.sh runs it in Docker)
import { createECDH, randomBytes } from 'node:crypto';
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
// @ts-ignore http_ece ships no types; only decrypt() is used, to play the device's part.
import ece from 'npm:http_ece@1.2.0';
import { r2 } from '../_shared/r2.ts';

function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(label);
}

Deno.test('push payload decrypts on the device side', () => {
  const vapid = webpush.generateVAPIDKeys();
  const device = createECDH('prime256v1');
  device.generateKeys();
  const authSecret = randomBytes(16);
  const payload = JSON.stringify({
    title: 'Quiet Co-Work starts in 1 hour',
    body: 'The room opens at 9:55 am.',
    url: '/camera-check',
  });

  const details = webpush.generateRequestDetails(
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: device.getPublicKey('base64url'), auth: authSecret.toString('base64url') },
    },
    payload,
    { vapidDetails: { subject: 'mailto:hello@meetdoconnect.com', ...vapid }, TTL: 3600, urgency: 'high' },
  );
  const headers = details.headers as Record<string, string>;
  assert(details.method === 'POST', 'method');
  assert(headers['Content-Encoding'] === 'aes128gcm', 'encoding');
  assert(headers.Urgency === 'high' && String(headers.TTL) === '3600', 'urgency and ttl');
  assert(/^vapid t=.+, k=.+$/.test(headers.Authorization), 'vapid header');

  const plain = ece.decrypt(details.body as Uint8Array, { version: 'aes128gcm', privateKey: device, authSecret });
  assert(new TextDecoder().decode(plain) === payload, 'roundtrip');
});

Deno.test('R2 upload link signs the content type and expires', async () => {
  Deno.env.set('R2_ACCOUNT_ID', 'acc123');
  Deno.env.set('R2_ACCESS_KEY_ID', 'AKIDEXAMPLE');
  Deno.env.set('R2_SECRET_ACCESS_KEY', 'secret');
  Deno.env.set('R2_BUCKET', 'hello-videos');
  const store = r2();
  assert(store, 'configured');
  const put = new URL(await store.presignPut('hello/u1/v1.webm', 'video/webm', 600));
  assert(put.origin === 'https://acc123.r2.cloudflarestorage.com', 'host');
  assert(put.pathname === '/hello-videos/hello/u1/v1.webm', 'path');
  assert(put.searchParams.get('X-Amz-Expires') === '600', 'expires');
  assert(put.searchParams.get('X-Amz-SignedHeaders') === 'content-type;host', 'signed headers');
  assert(put.searchParams.get('X-Amz-Signature')?.length === 64, 'signature');
  const get = new URL(await store.presignGet('hello/u1/v1.webm', 900));
  assert(get.searchParams.get('X-Amz-SignedHeaders') === 'host', 'get signed headers');

  Deno.env.delete('R2_BUCKET');
  assert(r2() === null, 'missing secret turns the feature off');
});
