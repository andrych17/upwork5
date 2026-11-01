'use client';

// "Continue with Google" for sign-in and sign-up. Supabase sends the person to Google and back to `next`,
// where the client picks the session up from the URL (detectSessionInUrl). A first Google sign-in creates the
// account; handle_new_user() fills the name from the Google profile.
import { useState } from 'react';
import { nextFromQuery } from '@/lib/account';
import { getSupabase } from '@/lib/supabase';

interface GoogleButtonProps {
  next: string;
  label?: string;
  onError: (message: string) => void;
}

export default function GoogleButton({ next, label = 'Continue with Google', onError }: GoogleButtonProps) {
  const [busy, setBusy] = useState(false);
  const supabase = getSupabase();
  if (!supabase) return null;

  const start = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${nextFromQuery(next)}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setBusy(false);
      onError(error.message);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          background: '#fff',
          color: '#1f2937',
          fontSize: '15px',
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
          />
          <path
            fill="#FBBC05"
            d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
          />
        </svg>
        {busy ? 'Opening Google…' : label}
      </button>
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '18px 0',
          color: '#6b7280',
          fontSize: '13px',
        }}
      >
        <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        or with email
        <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      </div>
    </>
  );
}
