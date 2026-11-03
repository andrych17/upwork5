'use client';

// Change password, for members and admins (admin skin inside the admin shell, member skin on /password).
// Normally it asks for the current password first. After a reset-email link (`recovery`) there is no current
// password to ask for: the link itself proved who is here. Other devices are signed out once it is saved.
import { useState } from 'react';
import PasswordInput from '@/components/password-input';
import { MIN_PASSWORD, passwordProblem } from '@/lib/password';
import { getSupabase } from '@/lib/supabase';

interface Props {
  variant: 'member' | 'admin';
  email: string;
  recovery?: boolean;
}

export default function PasswordForm({ variant, email, recovery = false }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const admin = variant === 'admin';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase)
      return setMsg({ text: 'Passwords can be changed once the site is connected to its database.', error: true });
    const problem = passwordProblem(current, next, again, !recovery);
    if (problem) return setMsg({ text: problem, error: true });
    setBusy(true);
    setMsg(null);
    if (!recovery) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: current });
      if (error) {
        setBusy(false);
        return setMsg({ text: 'Your current password is not right.', error: true });
      }
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      setBusy(false);
      return setMsg({ text: error.message, error: true });
    }
    await supabase.auth.signOut({ scope: 'others' }); // an old session on a lost phone should not survive this
    setBusy(false);
    setCurrent('');
    setNext('');
    setAgain('');
    setMsg({ text: 'Password changed. Other devices were signed out.', error: false });
  };

  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <label className={admin ? 'adm-field' : 'full-field'}>
      <span>{label}</span>
      <PasswordInput
        className={admin ? 'adm-input' : undefined}
        autoComplete={auto}
        required
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  const note = msg && (
    <p
      role={msg.error ? 'alert' : 'status'}
      className={
        admin ? (msg.error ? 'adm-msg adm-msg-error' : 'adm-msg') : msg.error ? 'pw-msg pw-msg-error' : 'pw-msg'
      }
    >
      {msg.text}
    </p>
  );

  return (
    <form className={admin ? 'adm-form' : undefined} onSubmit={submit}>
      {note}
      <div className={admin ? 'adm-form-grid' : 'form-grid'}>
        {!recovery && field('Current password', current, setCurrent, 'current-password')}
        {field('New password', next, setNext, 'new-password')}
        {field('New password again', again, setAgain, 'new-password')}
      </div>
      <small className={admin ? 'adm-sub' : 'pw-hint'}>At least {MIN_PASSWORD} characters.</small>
      <div style={{ marginTop: '1rem' }}>
        {admin ? (
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        ) : (
          <button
            className="signup-next"
            type="submit"
            disabled={busy}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {busy ? 'Saving…' : 'Change password'} <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </form>
  );
}
