'use client';

// Email and SMS reminder choices for the signed-in person (set_reminder_prefs, schema section 20).
// Email is on by default. SMS needs a number with country code and an explicit opt-in (US carrier rules).
import { useEffect, useState } from 'react';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';

type Prefs = MembershipSummary['reminders'];

export default function ReminderPrefs() {
  const live = Boolean(getSupabase());
  const [prefs, setPrefs] = useState<Prefs | null>(() => (live ? null : { email: true, sms: false, phone: null }));
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let current = true;
    (async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      const { data } = await supabase.rpc('get_my_membership');
      const summary = data as MembershipSummary | null;
      if (current && summary?.reminders) {
        setPrefs(summary.reminders);
        setPhone(summary.reminders.phone ?? '');
      }
    })();
    return () => {
      current = false;
    };
  }, []);

  if (!prefs) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const supabase = getSupabase();
    if (!supabase) {
      setMessage({ tone: 'ok', text: 'Saved. (Preview: nothing is sent until accounts are connected.)' });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('set_reminder_prefs', {
      p_email: prefs.email,
      p_sms: prefs.sms,
      p_phone: phone.trim() || null,
    });
    setBusy(false);
    const res = data as { success: boolean; error?: string } | null;
    if (error || !res?.success) {
      setMessage({ tone: 'error', text: error?.message || res?.error || 'Could not save. Please try again.' });
      return;
    }
    setMessage({ tone: 'ok', text: 'Saved.' });
  };

  return (
    <form className="reminders-card reminder-prefs" onSubmit={save}>
      <h2>Email and text</h2>
      <label className="reminder-toggle">
        <input
          type="checkbox"
          checked={prefs.email}
          onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
        />
        <span>
          <strong>Email reminders</strong> 24 hours and 1 hour before each session you book.
        </span>
      </label>
      <label className="reminder-toggle">
        <input type="checkbox" checked={prefs.sms} onChange={(e) => setPrefs({ ...prefs, sms: e.target.checked })} />
        <span>
          <strong>Text reminders</strong> 1 hour before each session you book.
        </span>
      </label>
      {prefs.sms && (
        <label className="reminder-phone">
          Mobile number with country code
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <small>
            By turning on text reminders you agree to get session reminders from MeetDoConnect by SMS, one for each
            session you book. Message and data rates may apply. Reply STOP to cancel, HELP for help.
          </small>
        </label>
      )}
      <button className="enter-room" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'} <span aria-hidden="true">→</span>
      </button>
      {message && (
        <p className={`reminders-message ${message.tone}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
