// Runs both Edge Functions against a fake network: Supabase, push services, Resend, Twilio and R2 are
// all answered by the fetch stub below, so nothing leaves the machine. Run by supabase/tests/run-deno.sh.
import { createECDH, randomBytes } from 'node:crypto';
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';

type Handler = (req: Request) => Response | Promise<Response>;
type Call = { method: string; url: URL; body: string };

function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(label);
}

let calls: Call[] = [];
let answer: (call: Call) => Response = () => new Response('unexpected', { status: 599 });
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const call = { method: req.method, url: new URL(req.url), body: await req.text() };
  calls.push(call);
  return answer(call);
};

// Grab the handler each function passes to Deno.serve instead of opening a port.
async function load(path: string): Promise<Handler> {
  let handler: Handler | undefined;
  const serve = Deno.serve;
  (Deno as { serve: unknown }).serve = (h: Handler) => {
    handler = h;
    return {} as Deno.HttpServer;
  };
  await import(path);
  (Deno as { serve: unknown }).serve = serve;
  assert(handler, `no handler in ${path}`);
  return handler;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const device = () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') };
};

Deno.env.set('SUPABASE_URL', 'https://project.supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

Deno.test('send-reminders sends each channel once and cleans up dead devices', async () => {
  Deno.env.set('CRON_SECRET', 'cron-secret');
  const vapid = webpush.generateVAPIDKeys();
  Deno.env.set('VAPID_PUBLIC_KEY', vapid.publicKey);
  Deno.env.set('VAPID_PRIVATE_KEY', vapid.privateKey);
  Deno.env.set('RESEND_API_KEY', 're_test');
  Deno.env.set('RESEND_FROM', 'MeetDoConnect <reminders@meetdoconnect.com>');
  Deno.env.set('TWILIO_ACCOUNT_SID', 'AC123');
  Deno.env.set('TWILIO_AUTH_TOKEN', 'tw-token');
  Deno.env.set('TWILIO_MESSAGING_SERVICE_SID', 'MG123');
  const handler = await load('../send-reminders/index.ts');

  const live = 'https://fcm.googleapis.com/fcm/send/live';
  const gone = 'https://updates.push.services.mozilla.com/wpush/v2/gone';
  const evil = 'https://evil.test/collect';
  const starts = new Date(Date.now() + 55 * 60_000).toISOString();
  calls = [];
  answer = ({ url }) => {
    if (url.pathname === '/rest/v1/rpc/claim_due_reminders') {
      return json({
        tz: 'America/Chicago',
        items: [
          {
            booking_id: '11111111-1111-1111-1111-111111111111',
            kind: '1h',
            user_id: 'u1',
            first_name: 'Sam',
            email: 'sam@example.test',
            phone: '+15551234567',
            title: 'Quiet Co-Work',
            slug: 'quiet-co-work',
            prep: null,
            starts_at: starts,
            minutes: 60,
            push: [
              { endpoint: live, ...device() },
              { endpoint: gone, ...device() },
              { endpoint: evil, ...device() },
            ],
          },
          {
            booking_id: '22222222-2222-2222-2222-222222222222',
            kind: '24h',
            user_id: 'u2',
            first_name: null,
            email: null,
            phone: null,
            title: 'Wind Down',
            slug: 'wind-down',
            prep: 'Bring tea.',
            starts_at: starts,
            minutes: 60,
            push: [],
          },
        ],
      });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(1);
    if (url.href === live) return new Response(null, { status: 201 });
    if (url.href === gone) return new Response(null, { status: 410 });
    if (url.host === 'api.resend.com') return json({ data: [{ id: 'e1' }] });
    if (url.host === 'api.twilio.com') return json({ sid: 'SM1' }, 201);
    return new Response('unexpected', { status: 599 });
  };

  const denied = await handler(
    new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer wrong' } }),
  );
  assert(denied.status === 401, 'wrong secret is refused');
  assert(calls.length === 0, 'nothing claimed without the secret');

  const res = await handler(
    new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }),
  );
  const summary = await res.json();
  assert(res.status === 200, `status ${res.status}`);
  assert(
    JSON.stringify(summary) ===
      JSON.stringify({ claimed: 2, push: 1, email: 1, sms: 1, failed: 0, removed_devices: 1, notices: 0, notices_failed: 0 }),
    JSON.stringify(summary),
  );
  assert(!calls.some((c) => c.url.host === 'evil.test'), 'unknown push host is never called');

  const push = calls.find((c) => c.url.href === live)!;
  assert(push.method === 'POST' && push.body.length > 0, 'encrypted push body');

  const email = JSON.parse(calls.find((c) => c.url.host === 'api.resend.com')!.body);
  assert(email.length === 1 && email[0].to[0] === 'sam@example.test', 'one email, to the person with email on');
  assert(email[0].subject === 'Quiet Co-Work starts in 1 hour', 'email subject');

  const sms = new URLSearchParams(calls.find((c) => c.url.host === 'api.twilio.com')!.body);
  assert(sms.get('To') === '+15551234567' && sms.get('MessagingServiceSid') === 'MG123', 'sms form');
  assert(sms.get('Body')!.startsWith('MeetDoConnect: Quiet Co-Work starts in 1 hour'), 'sms text');

  const dead = JSON.parse(calls.find((c) => c.url.pathname === '/rest/v1/rpc/delete_push_endpoints')!.body);
  assert(JSON.stringify(dead.p_endpoints) === JSON.stringify([gone]), 'gone device removed');

  const recorded = JSON.parse(
    calls.find((c) => c.url.pathname === '/rest/v1/rpc/record_reminder_results')!.body,
  ).p_results;
  assert(
    recorded[0].push_sent === 1 &&
      recorded[0].email_sent === true &&
      recorded[0].sms_sent === true &&
      recorded[0].error === null,
    JSON.stringify(recorded[0]),
  );
  assert(
    recorded[1].push_sent === null && recorded[1].email_sent === null && recorded[1].sms_sent === null,
    JSON.stringify(recorded[1]),
  );

  // Hello Video and held-booking emails: sent once, one failure recorded per person without an address.
  calls = [];
  answer = ({ url }) => {
    if (url.pathname === '/rest/v1/rpc/claim_due_reminders') return json({ tz: 'America/Chicago', items: [] });
    if (url.pathname === '/rest/v1/rpc/claim_member_notices') {
      return json([
        { id: 'n1', kind: 'hello_approved', note: null, first_name: 'Sam', email: 'sam@example.test', held_count: 2 },
        { id: 'n2', kind: 'hello_redo', note: 'Too <dark>', first_name: null, email: 'pat@example.test', held_count: 0 },
        { id: 'n3', kind: 'hold_released', note: 'Quiet Co-Work', first_name: 'Lee', email: null, held_count: 0 },
      ]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(1);
    if (url.host === 'api.resend.com') return json({ data: [{ id: 'e1' }, { id: 'e2' }] });
    return new Response('unexpected', { status: 599 });
  };
  const noticeRes = await handler(
    new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }),
  );
  const noticeSummary = await noticeRes.json();
  assert(
    noticeSummary.claimed === 0 && noticeSummary.notices === 2 && noticeSummary.notices_failed === 1,
    JSON.stringify(noticeSummary),
  );
  const mails = JSON.parse(calls.find((c) => c.url.host === 'api.resend.com')!.body);
  assert(mails.length === 2 && mails[0].to[0] === 'sam@example.test', 'only people with an address are emailed');
  assert(mails[0].subject === 'Your Hello Video is approved' && mails[0].text.includes('now confirmed'), 'approved email');
  assert(mails[1].html.includes('Too &lt;dark&gt;') && !mails[1].html.includes('<dark>'), 'the team note is escaped');
  const noticeRows = JSON.parse(calls.find((c) => c.url.pathname === '/rest/v1/rpc/record_notice_results')!.body).p_results;
  assert(
    noticeRows[0].email_sent === true && noticeRows[2].email_sent === false && noticeRows[2].error === 'no email address',
    JSON.stringify(noticeRows),
  );

  // Without Resend nothing is claimed, so the notices wait instead of being lost.
  Deno.env.delete('RESEND_API_KEY');
  calls = [];
  await handler(new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }));
  assert(!calls.some((c) => c.url.pathname === '/rest/v1/rpc/claim_member_notices'), 'no claim without Resend');
});

Deno.test('hello-video signs uploads, rejects oversized files and keeps the queue for admins', async () => {
  Deno.env.set('R2_ACCOUNT_ID', 'acc123');
  Deno.env.set('R2_ACCESS_KEY_ID', 'AKIDEXAMPLE');
  Deno.env.set('R2_SECRET_ACCESS_KEY', 'secret');
  Deno.env.set('R2_BUCKET', 'hello-videos');
  const handler = await load('../hello-video/index.ts');
  const user = '33333333-3333-3333-3333-333333333333';
  const video = '44444444-4444-4444-4444-444444444444';
  const call = (body: unknown, token = 'user-token') =>
    handler(
      new Request('https://fn.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );

  calls = [];
  answer = ({ url, method }) => {
    if (url.pathname === '/auth/v1/user') return json({ id: user, aud: 'authenticated', role: 'authenticated' });
    if (url.pathname === '/rest/v1/rpc/hello_video_start') {
      return json({
        success: true,
        id: video,
        key: `hello/${user}/${video}.webm`,
        replaced_keys: [`hello/${user}/old.webm`],
      });
    }
    if (url.pathname === '/rest/v1/hello_videos')
      return json({ object_key: `hello/${user}/${video}.webm`, user_id: user, status: 'uploading' });
    if (url.pathname === '/rest/v1/profiles') return json({ is_admin: false });
    if (url.host === 'acc123.r2.cloudflarestorage.com' && method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'Content-Length': '200000000' } });
    }
    if (url.host === 'acc123.r2.cloudflarestorage.com' && method === 'DELETE')
      return new Response(null, { status: 204 });
    return new Response('unexpected', { status: 599 });
  };

  const started = await call({ action: 'start', mime: 'video/webm;codecs=vp9,opus', size: 5_000_000, duration: 45 });
  const startBody = await started.json();
  assert(started.status === 200, `start ${started.status} ${JSON.stringify(startBody)}`);
  assert(startBody.content_type === 'video/webm', 'codec part dropped from the type');
  assert(
    new URL(startBody.upload_url).searchParams.get('X-Amz-SignedHeaders') === 'content-type;host',
    'signed upload',
  );
  const startRpc = JSON.parse(calls.find((c) => c.url.pathname === '/rest/v1/rpc/hello_video_start')!.body);
  assert(startRpc.p_user === user, 'user id comes from the verified token');
  assert(
    calls.some((c) => c.method === 'DELETE' && c.url.pathname.endsWith('/old.webm')),
    'replaced try deleted',
  );

  calls = [];
  const finished = await call({ action: 'finish', id: video });
  assert(finished.status === 413, `oversized finish ${finished.status}`);
  assert(
    calls.some((c) => c.method === 'DELETE' && c.url.pathname.endsWith(`${video}.webm`)),
    'oversized file deleted',
  );
  assert(!calls.some((c) => c.url.pathname === '/rest/v1/rpc/hello_video_uploaded'), 'oversized file never queued');

  const queue = await call({ action: 'queue' });
  assert(queue.status === 403, `non-admin queue ${queue.status}`);

  answer = () => json({ msg: 'bad jwt' }, 401);
  const anonymous = await call({ action: 'start' }, 'expired');
  assert(anonymous.status === 401, `expired token ${anonymous.status}`);
});
