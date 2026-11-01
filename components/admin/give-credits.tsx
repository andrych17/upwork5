'use client';

// Customer service: add extra credits to a member (admin_give_credits, schema section 18).
// Household credits are shared, so they land on the account holder. Every grant is logged with its reason.
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface GiveResult {
  amount: number;
  creditedTo: string;
  shared: boolean;
  addonCredits: number;
}

interface Props {
  member: { id: string; name: string; addonCredits: number };
  onDone: (result: GiveResult) => void;
  onCancel: () => void;
}

const field = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
} as const;

export default function GiveCredits({ member, onDone, onCancel }: Props) {
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const supabase = getSupabase();
    if (!supabase) {
      // Preview: no database yet, so only the table on this page changes.
      onDone({ amount, creditedTo: member.id, shared: false, addonCredits: member.addonCredits + amount });
      return;
    }
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('admin_give_credits', {
      p_profile: member.id,
      p_amount: amount,
      p_reason: reason,
    });
    setBusy(false);
    const res = data as {
      success: boolean;
      error?: string;
      credited_to: string;
      shared: boolean;
      addon_credits: number;
    } | null;
    if (rpcError || !res?.success) {
      setError(rpcError?.message || res?.error || 'Could not give credits. Please try again.');
      return;
    }
    onDone({ amount, creditedTo: res.credited_to, shared: res.shared, addonCredits: res.addon_credits });
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'flex-end',
        padding: '14px 20px',
        background: '#fffbeb',
      }}
    >
      <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#4b5563' }}>
        Credits for {member.name}
        <input
          type="number"
          min={1}
          max={50}
          required
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          style={{ ...field, width: '90px' }}
        />
      </label>
      <label
        style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#4b5563', flex: '1 1 260px' }}
      >
        Reason (kept in the log)
        <input
          type="text"
          required
          maxLength={300}
          placeholder="e.g. Host cancelled Tuesday's session"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={field}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        style={{
          ...field,
          border: 'none',
          background: '#b45309',
          color: 'white',
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Saving…' : `Give ${amount} ${amount === 1 ? 'credit' : 'credits'}`}
      </button>
      <button type="button" onClick={onCancel} style={{ ...field, background: 'white', cursor: 'pointer' }}>
        Cancel
      </button>
      {error && (
        <p role="alert" style={{ flexBasis: '100%', margin: 0, fontSize: '13px', color: '#991b1b' }}>
          {error}
        </p>
      )}
    </form>
  );
}
