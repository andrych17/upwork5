// Hello Video: members upload straight to a private R2 bucket with a 10-minute signed link,
// admins watch through 15-minute signed links, and the file is deleted when it is reviewed.
// POST { action: 'start', mime, size, duration } -> { id, upload_url, content_type }
// POST { action: 'finish', id }                  -> { status: 'pending' }
// POST { action: 'queue' }                       -> { items: [...] }      (admins)
// POST { action: 'review', id, approve, reason, release? } -> { status, released }  (admins)
//   approve false = record again (held bookings stay); approve false + release true = declined, held bookings are released
// The browser sends the Supabase session token; supabase.functions.invoke does that.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, body, caller, cors, fail, json } from '../_shared/http.ts';
import { r2, type R2 } from '../_shared/r2.ts';

const MAX_BYTES = 104_857_600; // 100 MB, same as the database check
const UPLOAD_SECONDS = 600;
const VIEW_SECONDS = 900;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rpc = { success: boolean; error?: string; [key: string]: unknown };

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as Rpc;
}

async function isAdmin(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (error) throw new Error(`profiles: ${error.message}`);
  return data?.is_admin === true;
}

async function objectKey(
  db: SupabaseClient,
  id: string,
): Promise<{ key: string; user_id: string; status: string } | null> {
  const { data, error } = await db
    .from('hello_videos')
    .select('object_key, user_id, status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`hello_videos: ${error.message}`);
  return data ? { key: data.object_key, user_id: data.user_id, status: data.status } : null;
}

async function start(req: Request, db: SupabaseClient, store: R2, userId: string, input: Record<string, unknown>) {
  const mime = typeof input.mime === 'string' ? input.mime.split(';')[0].trim().toLowerCase() : '';
  const size = Number(input.size);
  const duration = Math.round(Number(input.duration));
  if (!Number.isFinite(size) || !Number.isFinite(duration)) {
    return fail(req, 400, 'BAD_REQUEST', 'Send the video type, size and length.');
  }

  const result = await rpc(db, 'hello_video_start', {
    p_user: userId,
    p_mime: mime,
    p_size: size,
    p_duration: duration,
  });
  if (!result.success) return fail(req, 409, 'NOT_ALLOWED', result.error ?? 'Could not start the upload.');

  // Earlier tries nobody reviewed yet: their files go now.
  const replaced = Array.isArray(result.replaced_keys) ? (result.replaced_keys as string[]) : [];
  await Promise.all(replaced.map((key) => store.remove(key).catch((e) => console.error('remove replaced', key, e))));

  const uploadUrl = await store.presignPut(String(result.key), mime, UPLOAD_SECONDS);
  return json(req, { id: result.id, upload_url: uploadUrl, content_type: mime, expires_in: UPLOAD_SECONDS });
}

async function finish(req: Request, db: SupabaseClient, store: R2, userId: string, input: Record<string, unknown>) {
  const id = typeof input.id === 'string' && UUID.test(input.id) ? input.id : null;
  if (!id) return fail(req, 400, 'BAD_REQUEST', 'Missing upload id.');
  const video = await objectKey(db, id);
  if (!video || video.user_id !== userId) return fail(req, 404, 'NOT_FOUND', 'That upload was not found.');
  if (video.status !== 'uploading')
    return fail(req, 409, 'NOT_ALLOWED', 'That upload was replaced. Please record again.');

  // Trust the size R2 reports, not the one the browser sent.
  const size = await store.size(video.key);
  if (size === null || size < 1)
    return fail(req, 409, 'NOT_UPLOADED', 'The video did not finish uploading. Please try again.');
  if (size > MAX_BYTES) {
    await store.remove(video.key);
    return fail(req, 413, 'TOO_LARGE', 'The video is too large. Please record a shorter one.');
  }

  const result = await rpc(db, 'hello_video_uploaded', { p_user: userId, p_id: id, p_size: size });
  if (!result.success) return fail(req, 409, 'NOT_ALLOWED', result.error ?? 'Could not save the upload.');
  return json(req, { status: 'pending' });
}

async function queue(req: Request, db: SupabaseClient, store: R2) {
  const { data, error } = await db.rpc('hello_video_queue', { p_limit: 50 });
  if (error) throw new Error(`hello_video_queue: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  // Signing is local (no network call per video); the bucket key itself is not sent to the browser.
  const items = await Promise.all(
    rows.map(async ({ key, ...row }) => ({ ...row, url: await store.presignGet(String(key), VIEW_SECONDS) })),
  );
  return json(req, { items, expires_in: VIEW_SECONDS });
}

async function review(req: Request, db: SupabaseClient, store: R2, adminId: string, input: Record<string, unknown>) {
  const id = typeof input.id === 'string' && UUID.test(input.id) ? input.id : null;
  if (!id || typeof input.approve !== 'boolean')
    return fail(req, 400, 'BAD_REQUEST', 'Send the video id and approve true or false.');
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 300) : null;

  const video = await objectKey(db, id);
  if (!video || video.status !== 'pending') {
    return fail(req, 409, 'NOT_ALLOWED', 'This video was already reviewed or replaced.');
  }
  // Delete first: once someone is reviewed, their video must be gone.
  await store.remove(video.key);
  const result = await rpc(db, 'hello_video_review', {
    p_admin: adminId,
    p_id: id,
    p_approve: input.approve,
    p_reason: reason,
    p_release: input.release === true && input.approve === false,
  });
  if (!result.success) return fail(req, 409, 'NOT_ALLOWED', result.error ?? 'Could not save the review.');
  return json(req, { status: result.status, released: result.released ?? 0 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fail(req, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');

  const store = r2();
  if (!store) return fail(req, 503, 'NOT_CONFIGURED', 'Hello Video uploads are not set up yet.');

  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return fail(req, 401, 'UNAUTHORIZED', 'Please sign in again.');
    const input = await body(req);
    if (!input) return fail(req, 400, 'BAD_REQUEST', 'Send a JSON body.');

    switch (input.action) {
      case 'start':
        return await start(req, db, store, user.id, input);
      case 'finish':
        return await finish(req, db, store, user.id, input);
      case 'queue':
        if (!(await isAdmin(db, user.id))) return fail(req, 403, 'FORBIDDEN', 'Only admins can see Hello Videos.');
        return await queue(req, db, store);
      case 'review':
        if (!(await isAdmin(db, user.id))) return fail(req, 403, 'FORBIDDEN', 'Only admins can review Hello Videos.');
        return await review(req, db, store, user.id, input);
      default:
        return fail(req, 400, 'BAD_REQUEST', 'Unknown action.');
    }
  } catch (e) {
    console.error('hello-video', e);
    return fail(req, 500, 'SERVER_ERROR', 'Something went wrong. Please try again.');
  }
});
