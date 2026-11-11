// Runs both Edge Functions against a fake network: Supabase, push services, Resend, Twilio and R2 are
// all answered by the fetch stub below, so nothing leaves the machine. Run by supabase/tests/run-deno.sh.
import { createECDH, randomBytes } from 'node:crypto';
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { forgetKeys } from '../_shared/http.ts';

type Handler = (req: Request) => Response | Promise<Response>;
type Call = { method: string; url: URL; body: string; auth: string | null };

function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(label);
}

let calls: Call[] = [];
let answer: (call: Call) => Response = () => new Response('unexpected', { status: 599 });
// What Admin > Settings has stored in Vault (schema section 32); read by loadKeys() through the service_keys RPC.
let storedKeys: { name: string; value: string }[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const call = {
    method: req.method,
    url: new URL(req.url),
    body: await req.text(),
    auth: req.headers.get('Authorization'),
  };
  if (call.url.pathname === '/rest/v1/rpc/service_keys') return Response.json(storedKeys);
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
      JSON.stringify({
        claimed: 2,
        push: 1,
        email: 1,
        sms: 1,
        failed: 0,
        removed_devices: 1,
        notices: 0,
        notices_failed: 0,
        codes: 0,
        codes_failed: 0,
      }),
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
        {
          id: 'n2',
          kind: 'hello_redo',
          note: 'Too <dark>',
          first_name: null,
          email: 'pat@example.test',
          held_count: 0,
        },
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
  assert(
    mails[0].subject === 'Your Hello Video is approved' && mails[0].text.includes('now confirmed'),
    'approved email',
  );
  assert(mails[1].html.includes('Too &lt;dark&gt;') && !mails[1].html.includes('<dark>'), 'the team note is escaped');
  const noticeRows = JSON.parse(
    calls.find((c) => c.url.pathname === '/rest/v1/rpc/record_notice_results')!.body,
  ).p_results;
  assert(
    noticeRows[0].email_sent === true &&
      noticeRows[2].email_sent === false &&
      noticeRows[2].error === 'no email address',
    JSON.stringify(noticeRows),
  );

  // Free-week codes for testers: one batch, replies to the contact email, results recorded per person.
  calls = [];
  answer = ({ url }) => {
    if (url.pathname === '/rest/v1/rpc/claim_due_reminders') return json({ tz: 'America/Chicago', items: [] });
    if (url.pathname === '/rest/v1/rpc/claim_member_notices') return json([]);
    if (url.pathname === '/rest/v1/rpc/claim_tester_codes') {
      const week = {
        code: 'WELCOME7',
        starts: '2026-11-23',
        ends: '2026-11-29',
        contact_email: 'hello@meetdoconnect.com',
      };
      return json([
        { id: 't1', first_name: 'Ana', email: 'ana@example.test', ...week },
        { id: 't2', first_name: 'Ben', email: null, ...week },
      ]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(1);
    if (url.host === 'api.resend.com') return json({ data: [{ id: 'e1' }] });
    return new Response('unexpected', { status: 599 });
  };
  const codeRes = await handler(
    new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }),
  );
  const codeSummary = await codeRes.json();
  assert(codeSummary.codes === 1 && codeSummary.codes_failed === 1, JSON.stringify(codeSummary));
  const codeMails = JSON.parse(calls.find((c) => c.url.host === 'api.resend.com')!.body);
  assert(
    codeMails.length === 1 &&
      codeMails[0].to[0] === 'ana@example.test' &&
      codeMails[0].reply_to === 'hello@meetdoconnect.com' &&
      codeMails[0].subject === 'Your free week at MeetDoConnect starts Monday, November 23' &&
      codeMails[0].text.includes('Your code: WELCOME7'),
    JSON.stringify(codeMails[0]),
  );
  const codeRows = JSON.parse(calls.find((c) => c.url.pathname === '/rest/v1/rpc/record_tester_codes')!.body).p_results;
  assert(
    codeRows[0].sent === true && codeRows[1].sent === false && codeRows[1].error === 'no email address',
    JSON.stringify(codeRows),
  );

  // Without Resend nothing is claimed, so the notices wait instead of being lost.
  Deno.env.delete('RESEND_API_KEY');
  calls = [];
  await handler(new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }));
  assert(!calls.some((c) => c.url.pathname === '/rest/v1/rpc/claim_member_notices'), 'no claim without Resend');
  assert(!calls.some((c) => c.url.pathname === '/rest/v1/rpc/claim_tester_codes'), 'no code claimed without Resend');
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

Deno.test('room-join creates the Daily room once and gives a token only to people the database lets in', async () => {
  const user = '55555555-5555-5555-5555-555555555555';
  const session = '66666666-6666-6666-6666-666666666666';
  const call = (h: Handler, body: unknown) =>
    h(
      new Request('https://fn.test', {
        method: 'POST',
        headers: { Authorization: 'Bearer t' },
        body: JSON.stringify(body),
      }),
    );

  Deno.env.delete('DAILY_API_KEY');
  const off = await load('../room-join/index.ts?off');
  assert((await call(off, { session_id: session })).status === 503, 'no key: not configured');

  Deno.env.set('DAILY_API_KEY', 'daily-key');
  Deno.env.set('DAILY_MONTHLY_MINUTES', '0'); // the minutes limit has its own checks below
  const handler = await load('../room-join/index.ts?on');
  const endsAt = new Date(Date.now() + 50 * 60_000).toISOString();
  let allowed = true;
  let roomExists = false;
  calls = [];
  answer = ({ url, method, body }) => {
    if (url.pathname === '/auth/v1/user') return json({ id: user, aud: 'authenticated', role: 'authenticated' });
    if (url.pathname === '/rest/v1/rpc/room_join') {
      const args = JSON.parse(body);
      assert(args.p_user === user && args.p_session === session, 'asks the database about this person');
      return json(
        allowed
          ? {
              success: true,
              title: 'Quiet Co-Work',
              slug: 'quiet-co-work',
              starts_at: endsAt,
              ends_at: endsAt,
              locks_at: endsAt,
              capacity: 12,
              name: 'Rita',
              camera_off: true,
              is_admin: false,
              people: [],
            }
          : { success: false, error: 'You don’t have a seat in this session.' },
      );
    }
    if (url.host === 'api.daily.co' && url.pathname === `/v1/rooms/mdc-${session}` && method === 'GET')
      return roomExists ? json({ url: 'https://mdc.daily.co/r' }) : json({ error: 'not-found' }, 404);
    if (url.host === 'api.daily.co' && url.pathname === '/v1/rooms' && method === 'POST') {
      roomExists = true;
      return json({ url: 'https://mdc.daily.co/r' });
    }
    if (url.host === 'api.daily.co' && url.pathname === '/v1/meeting-tokens') return json({ token: 'meeting-token' });
    return new Response('unexpected', { status: 599 });
  };

  assert((await call(handler, { session_id: 'nope' })).status === 400, 'bad session id');
  const first = await call(handler, { session_id: session });
  const firstBody = await first.json();
  assert(
    first.status === 200 && firstBody.token === 'meeting-token' && firstBody.url === 'https://mdc.daily.co/r',
    'joins',
  );
  assert(!('capacity' in firstBody) && !('success' in firstBody), 'only what the page needs');
  const made = JSON.parse(calls.find((c) => c.url.pathname === '/v1/rooms' && c.method === 'POST')!.body);
  assert(made.privacy === 'private' && made.properties.max_participants === 14, 'private room capped at seats + 2');
  const tokenReq = JSON.parse(calls.find((c) => c.url.pathname === '/v1/meeting-tokens')!.body).properties;
  assert(
    tokenReq.user_id === user && tokenReq.start_video_off === true && tokenReq.is_owner === false,
    'token for this person',
  );
  assert(calls.find((c) => c.url.host === 'api.daily.co')!.method === 'GET', 'looks for the room first');

  calls = [];
  await call(handler, { session_id: session });
  assert(!calls.some((c) => c.url.pathname === '/v1/rooms' && c.method === 'POST'), 'room reused');

  allowed = false;
  calls = [];
  const refused = await call(handler, { session_id: session });
  assert(refused.status === 403 && (await refused.json()).error.message.includes('seat'), 'database says no');
  assert(!calls.some((c) => c.url.host === 'api.daily.co'), 'no Daily call when refused');

  // Minutes limit: Daily's meeting list over the last 31 days; people still in a call count from when they joined.
  Deno.env.set('DAILY_MONTHLY_MINUTES', '100');
  const capped = await load('../room-join/index.ts?cap');
  allowed = true;
  let used = 90 * 60;
  let dailyUp = true;
  const base = answer;
  answer = (c) => {
    if (c.url.host === 'api.daily.co' && c.url.pathname === '/v1/meetings') {
      if (!dailyUp) return json({ error: 'server-error' }, 500);
      const days = (Date.now() / 1000 - Number(c.url.searchParams.get('timeframe_start'))) / 86_400;
      assert(days > 30.9 && days < 31.1, 'counts the last 31 days, whatever day billing starts');
      const now = Math.floor(Date.now() / 1000);
      return json({
        data: [
          { id: 'm1', ongoing: false, participants: [{ duration: used / 2 }, { duration: used / 2 - 600 }] },
          { id: 'm2', ongoing: true, participants: [{ join_time: now - 600, duration: null }] },
        ],
      });
    }
    return base(c);
  };
  assert((await call(capped, { session_id: session })).status === 200, 'under the limit: joins');
  used = 100 * 60;
  assert((await call(capped, { session_id: session })).status === 200, 'usage is read again only every few minutes');
  calls = [];
  const full = await call(await load('../room-join/index.ts?cap2'), { session_id: session });
  assert(full.status === 503 && (await full.json()).error.code === 'VIDEO_LIMIT', 'at the limit (with the live call)');
  assert(!calls.some((c) => c.url.pathname === '/v1/meeting-tokens'), 'no token at the limit');

  dailyUp = false;
  const blind = await call(await load('../room-join/index.ts?cap3'), { session_id: session });
  assert(
    blind.status === 503 && (await blind.json()).error.code === 'VIDEO_LIMIT_UNKNOWN',
    'usage unknown: nobody new gets in',
  );
  dailyUp = true;
  used = 1000 * 60;
  Deno.env.delete('DAILY_MONTHLY_MINUTES');
  calls = [];
  assert((await call(await load('../room-join/index.ts?cap4'), { session_id: session })).status === 200, 'default');
  assert(
    calls.some((c) => c.url.pathname === '/v1/meetings'),
    'the default limit is checked when nothing is set',
  );
  used = 9000 * 60;
  assert(
    (await call(await load('../room-join/index.ts?cap5'), { session_id: session })).status === 503,
    'and stops at 8000 minutes',
  );
  Deno.env.set('DAILY_MONTHLY_MINUTES', '0');
  dailyUp = false;
  assert((await call(await load('../room-join/index.ts?cap6'), { session_id: session })).status === 200, '0 = off');

  // A key saved in Admin > Settings wins over the function secret; clearing it there brings the secret back.
  answer = base;
  storedKeys = [{ name: 'DAILY_API_KEY', value: 'key-from-settings' }];
  forgetKeys();
  calls = [];
  assert((await call(handler, { session_id: session })).status === 200, 'joins with the stored key');
  const daily = calls.filter((c) => c.url.host === 'api.daily.co');
  assert(daily.length > 0 && daily.every((c) => c.auth === 'Bearer key-from-settings'), 'Daily called with it');
  storedKeys = [];
  forgetKeys();
  calls = [];
  await call(handler, { session_id: session });
  assert(
    calls.filter((c) => c.url.host === 'api.daily.co').every((c) => c.auth === 'Bearer daily-key'),
    'back to the function secret',
  );

  // The limit can be set in Settings as well (stored keys win over the function secret).
  answer = (c) => (c.url.pathname === '/v1/meetings' ? json({ data: [] }) : base(c));
  storedKeys = [{ name: 'DAILY_MONTHLY_MINUTES', value: '0' }];
  Deno.env.set('DAILY_MONTHLY_MINUTES', '100');
  forgetKeys();
  calls = [];
  await call(await load('../room-join/index.ts?cap7'), { session_id: session });
  assert(!calls.some((c) => c.url.pathname === '/v1/meetings'), 'the Settings value is the one used');
  storedKeys = [];
  forgetKeys();
  Deno.env.delete('DAILY_MONTHLY_MINUTES');
});

Deno.test('room-history shows admins who was in each room, from Daily, mapped to members and sessions', async () => {
  const adminId = '77777777-7777-7777-7777-777777777777';
  const memberId = '88888888-8888-8888-8888-888888888888';
  const session = '99999999-9999-9999-9999-999999999999';
  let caller = adminId;
  const call = (h: Handler, body: unknown = {}) =>
    h(
      new Request('https://fn.test', {
        method: 'POST',
        headers: { Authorization: 'Bearer t' },
        body: JSON.stringify(body),
      }),
    );

  Deno.env.delete('DAILY_API_KEY');
  assert((await call(await load('../room-history/index.ts?off'))).status === 503, 'no key: not configured');
  Deno.env.set('DAILY_API_KEY', 'daily-key');
  const handler = await load('../room-history/index.ts?on');

  const t0 = Math.floor(Date.now() / 1000) - 3600;
  calls = [];
  answer = ({ url }) => {
    if (url.pathname === '/auth/v1/user') return json({ id: caller, aud: 'authenticated', role: 'authenticated' });
    if (url.pathname === '/rest/v1/profiles' && url.searchParams.get('select') === 'is_admin')
      return json({ is_admin: url.searchParams.get('id') === `eq.${adminId}` });
    if (url.pathname === '/rest/v1/profiles')
      return json([
        { id: memberId, first_name: 'Troy', last_name: 'D', email: 't@example.com', is_admin: false },
        { id: adminId, first_name: 'Kelly', last_name: 'C', email: 'k@example.com', is_admin: true },
      ]);
    if (url.pathname === '/rest/v1/sessions')
      return json([{ id: session, title: 'Trivia', starts_at: new Date(t0 * 1000).toISOString() }]);
    if (url.pathname === '/v1/meetings')
      return json({
        data: [
          {
            id: 'm2',
            room: `mdc-${session}`,
            ongoing: true,
            participants: [{ user_id: memberId, user_name: 'Troy', join_time: t0 + 1800, duration: null }],
          },
          {
            id: 'm1',
            room: `mdc-${session}`,
            ongoing: false,
            participants: [
              { user_id: memberId, user_name: 'Troy', join_time: t0, duration: 600 },
              { user_id: adminId, user_name: 'Kelly', join_time: t0 + 60, duration: 125 },
              { user_id: null, user_name: 'Guest', join_time: t0 + 120, duration: 30 },
            ],
          },
          { id: 'm0', room: 'someone-elses-room', participants: [{ user_id: memberId, join_time: t0, duration: 9 }] },
        ],
      });
    return new Response('unexpected', { status: 599 });
  };

  caller = memberId;
  assert((await call(handler)).status === 403, 'members cannot read the history');

  caller = adminId;
  const res = await call(handler, { days: 7 });
  assert(res.status === 200, `admin gets the history (${res.status})`);
  const { days, rows } = (await res.json()) as {
    days: number;
    rows: {
      name: string;
      is_admin: boolean;
      minutes: number;
      ongoing: boolean;
      left_at: string | null;
      title: string;
    }[];
  };
  const daily = calls.find((c) => c.url.pathname === '/v1/meetings');
  assert(daily?.auth === 'Bearer daily-key', 'asks Daily with the key');
  assert(days === 7 && daily.url.searchParams.get('timeframe_start') !== null, 'looks back the asked number of days');
  assert(rows.length === 4, 'one row per visit in our rooms only');
  assert(rows[0].name === 'Troy D' && rows[0].ongoing && rows[0].left_at === null, 'newest first, still in the room');
  const kelly = rows.find((r) => r.name === 'Kelly C');
  assert(kelly?.is_admin && kelly.minutes === 3 && kelly.left_at !== null, 'admin visit with minutes and leave time');
  assert(
    rows.some((r) => r.name === 'Guest' && !r.is_admin),
    'someone without a member id keeps the Daily name',
  );
  assert(
    rows.every((r) => r.title === 'Trivia'),
    'mapped to the session title',
  );
  assert((await call(handler, { days: 999 })).status === 200, 'out-of-range days fall back to 30');
});
