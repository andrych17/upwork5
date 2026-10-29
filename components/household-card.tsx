'use client';

import { useEffect, useState } from 'react';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';

type Household = NonNullable<MembershipSummary['household']>;

interface View {
  role: 'owner' | 'member';
  household: Household;
  monthlyTotal: number;
  weekLimit: number | null;
}

// Shown until Supabase is connected, so the preview site can show how a Household works.
const DEMO: View = {
  role: 'owner',
  monthlyTotal: 16,
  weekLimit: 4,
  household: {
    max_people: 4,
    owner_name: 'Kelly C.',
    people: [
      { id: 'demo-1', name: 'Kelly C.', email: 'kelly@example.com', is_owner: true },
      { id: 'demo-2', name: 'Jordan C.', email: 'jordan@example.com', is_owner: false },
    ],
    invites: ['riley@example.com'],
  },
};

type RpcResult = { success: boolean; error?: string } | null;

// The signed-in person's Household, or null for an Individual plan or a signed-out visitor.
async function fetchView(): Promise<View | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return null;
  const { data, error } = await supabase.rpc('get_my_membership');
  const summary = data as MembershipSummary | null;
  if (error || !summary?.household || summary.role === 'individual') return null;
  return {
    role: summary.role,
    household: summary.household,
    monthlyTotal: summary.monthly_total,
    weekLimit: summary.week_limit,
  };
}

export default function HouseholdCard() {
  const live = Boolean(getSupabase());
  const [view, setView] = useState<View | null>(() => (live ? null : DEMO));
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!live) return;
    let current = true;
    fetchView().then((next) => {
      if (current) setView(next);
    });
    return () => {
      current = false;
    };
  }, [live]);

  if (!view) return null;

  const { household, role } = view;
  const invites = household.invites ?? [];
  const seatsLeft = household.max_people - household.people.length - invites.length;
  const isOwner = role === 'owner';

  const run = async (fn: string, args: Record<string, string>, ok: string, demo: (v: View) => View) => {
    setMessage(null);
    const supabase = getSupabase();
    if (!supabase) {
      setView(demo(view));
      setMessage({ tone: 'ok', text: ok });
      return true;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, args);
    const res = data as RpcResult;
    setBusy(false);
    if (error || !res?.success) {
      setMessage({ tone: 'error', text: error?.message || res?.error || 'Something went wrong. Please try again.' });
      return false;
    }
    setMessage({ tone: 'ok', text: ok });
    setView(await fetchView());
    return true;
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    const done = await run(
      'invite_household_member',
      { p_email: address },
      `Invite saved. Ask them to sign up with ${address} and they join your Household automatically.`,
      (v) => ({ ...v, household: { ...v.household, invites: [...(v.household.invites ?? []), address] } }),
    );
    if (done) setEmail('');
  };

  const cancelInvite = (address: string) =>
    run('cancel_household_invite', { p_email: address }, `Invite for ${address} cancelled.`, (v) => ({
      ...v,
      household: { ...v.household, invites: (v.household.invites ?? []).filter((x) => x !== address) },
    }));

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from your Household? They keep their sign-in but can't book on your plan.`))
      return;
    run('remove_household_member', { p_member_id: id }, `${name} was removed from your Household.`, (v) => ({
      ...v,
      household: { ...v.household, people: v.household.people.filter((p) => p.id !== id) },
    }));
  };

  const weekly = view.weekLimit ? `up to ${view.weekLimit} a week each` : 'as many a week as you like';

  return (
    <section className="billing-section household-section" id="household">
      <div className="billing-heading">
        <p className="section-label">Household</p>
        <h2>Up to {household.max_people} people, one plan.</h2>
      </div>
      <p className="household-intro">
        Everyone gets their own sign-in and books from the same {view.monthlyTotal} sessions a month, {weekly}. When two
        of you join the same session, it uses two sessions.
        {!live && ' (Preview: sample people until accounts are connected.)'}
      </p>

      <div className="payment-history household-people">
        <div className="history-heading">
          <strong>People</strong>
          <span>Role</span>
          <span />
        </div>
        {household.people.map((person) => (
          <div key={person.id}>
            <span>
              <b>{person.name || 'Member'}</b> {person.email}
            </span>
            <strong>{person.is_owner ? 'Account holder' : 'Member'}</strong>
            {isOwner && !person.is_owner ? (
              <button type="button" disabled={busy} onClick={() => remove(person.id, person.name || 'this person')}>
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {invites.map((address) => (
          <div key={address}>
            <span>
              <b>Invited</b> {address}
            </span>
            <strong>Waiting to sign up</strong>
            <button type="button" disabled={busy} onClick={() => cancelInvite(address)}>
              Cancel
            </button>
          </div>
        ))}
      </div>

      {isOwner ? (
        seatsLeft > 0 ? (
          <form className="household-invite" onSubmit={invite}>
            <label htmlFor="household-email">
              Add someone ({seatsLeft} {seatsLeft === 1 ? 'spot' : 'spots'} left)
            </label>
            <div>
              <input
                id="household-email"
                type="email"
                required
                autoComplete="off"
                placeholder="their@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" disabled={busy}>
                Invite
              </button>
            </div>
            <small>Each person needs their own email address to sign in and get reminders.</small>
          </form>
        ) : (
          <p className="household-full">Your Household is full. Remove someone to invite another person.</p>
        )
      ) : (
        <p className="household-full">
          You book on {household.owner_name || 'the account holder'}&apos;s Household plan. They manage who is on it.
        </p>
      )}

      {message && (
        <p className={`household-message ${message.tone}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
