// App notifications for booked sessions: this device's push subscription, saved to Supabase
// (save_push_subscription, schema section 20) so the send-reminders Edge Function can reach it.
import { getSupabase } from '@/lib/supabase';

/** Public half of the VAPID key pair; the private half is a send-reminders secret. */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function isSignedIn(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/** Subscribes this device (or reuses its subscription) and saves it for the signed-in person. */
export async function savePushSubscription(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !VAPID_PUBLIC_KEY || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
    }));
  const { endpoint, keys } = subscription.toJSON();
  const { data, error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys?.p256dh,
    p_auth: keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  const res = data as { success: boolean; error?: string } | null;
  if (error || !res?.success) return error?.message || res?.error || 'Could not save this device. Please try again.';
  return null;
}

/** Stops reminders on this device only. */
export async function removePushSubscription(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await getSupabase()?.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
