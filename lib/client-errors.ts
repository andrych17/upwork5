// Browser-side errors (Daily video, camera and microphone, room entry, Hello Video upload) sent to
// Admin > Activity log > App errors through log_client_error() (schema section 33). Tested by scripts/test-client-errors.ts.
import { getSupabase } from './supabase.ts';

/** One readable line from whatever was thrown or emitted: Error, DOMException, a Daily event, or a string. */
export function errorText(e: unknown): string {
  if (typeof e === 'string') return e || '(no message)';
  if (e instanceof Error) return e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message || e.name;
  if (e && typeof e === 'object') {
    // Daily events: { errorMsg, error: { type, msg } } for errors, { type, errorMsg } for non-fatal ones.
    const o = e as Record<string, unknown>;
    const inner = (o.error && typeof o.error === 'object' ? o.error : {}) as Record<string, unknown>;
    const parts = [o.errorMsg, inner.type, inner.msg, o.type, o.message].filter(
      (v): v is string => typeof v === 'string' && v !== '',
    );
    if (parts.length) return [...new Set(parts)].join(' · ');
    try {
      return JSON.stringify(e).slice(0, 500);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

const sent = new Set<string>();

/**
 * Records one browser error for the admins. Never throws and never blocks the page; the same kind and message is
 * sent once per page load. Signed-out visitors are skipped (the database refuses them).
 */
export function logClientError(
  kind: string,
  error: unknown,
  opts: { sessionId?: string; details?: Record<string, unknown> } = {},
): void {
  if (typeof window === 'undefined') return;
  const supabase = getSupabase();
  const message = errorText(error);
  const key = `${kind}|${message}`;
  if (!supabase || sent.has(key)) return;
  sent.add(key);
  supabase
    .rpc('log_client_error', {
      p_kind: kind,
      p_message: message,
      p_session: opts.sessionId ?? null,
      p_page: `${location.pathname}${location.search}`,
      p_user_agent: navigator.userAgent,
      p_details: opts.details ?? {},
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
