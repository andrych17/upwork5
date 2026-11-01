// CORS and JSON replies shared by the Edge Functions.
// SITE_ORIGINS: comma-separated list of sites allowed to call (e.g. "https://meetdoconnect.com,https://dev.meetdoconnect.com").
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const allowed = (Deno.env.get('SITE_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

export function fail(req: Request, status: number, code: string, message: string): Response {
  return json(req, { error: { code, message } }, status);
}

export function env(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

// Service-role client: bypasses RLS, so every call must pass a user id that came from a verified sign-in.
export function admin(): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// The signed-in person behind the request, checked with Supabase Auth (not just decoded).
export async function caller(req: Request, db: SupabaseClient): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

export async function body(req: Request, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (raw.length > maxBytes) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
