'use client';

// One member beside the list: plan and status, credits, admin access, turn off/on, and bookings.
import { useCallback, useState } from 'react';
import GiveCredits from '@/components/admin/give-credits';
import { useAdmin } from '@/components/admin/shell';
import {
  PROFILE_COLUMNS,
  STATUS_LABEL,
  adminRpc,
  fmtDate,
  fmtWhen,
  fullName,
  statusBadge,
  useLoad,
  type AdminProfile,
  type BillingInterval,
  type PaymentStatus,
  type Tier,
} from '@/lib/admin';

interface Booking {
  id: string;
  status: string;
  credit_type: 'monthly' | 'addon';
  held: boolean;
  release_reason: string | null;
  session: { title: string; starts_at: string } | null;
}

interface Person {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface Plan {
  tier: Tier;
  interval: BillingInterval;
  status: PaymentStatus;
}

interface Props {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
}

export default function MemberDetail({ id, onClose, onChanged, onOpen }: Props) {
  const { supabase, me } = useAdmin();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [giving, setGiving] = useState(false);
  // null = show the saved plan; set once the admin starts editing
  const [planEdit, setPlanEdit] = useState<Plan | null>(null);
  const [offReason, setOffReason] = useState('');

  const fetchMember = useCallback(async () => {
    const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
    const prof = data as unknown as AdminProfile | null;
    if (!prof) return null;
    const [kids, owner, books] = await Promise.all([
      supabase.from('profiles').select('id,first_name,last_name,email').eq('household_owner_id', id),
      prof.household_owner_id
        ? supabase.from('profiles').select('id,first_name,last_name,email').eq('id', prof.household_owner_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('bookings')
        .select('id,status,credit_type,held,release_reason,session:sessions(title,starts_at)')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    return {
      p: prof,
      people: (kids.data ?? []) as Person[],
      holder: (owner.data ?? null) as Person | null,
      bookings: (books.data ?? []) as unknown as Booking[],
    };
  }, [supabase, id]);

  const { data: loaded, loading, reload } = useLoad(fetchMember);

  const run = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    const res = await adminRpc(supabase, fn, args);
    setBusy(false);
    setMsg({ text: res.ok ? done : res.error, error: !res.ok });
    if (res.ok) {
      setPlanEdit(null);
      reload();
      onChanged();
    }
    return res;
  };

  if (!loaded) {
    return (
      <aside className="adm-card adm-panel">
        <p className="adm-empty">{loading ? 'Loading…' : 'Member not found.'}</p>
      </aside>
    );
  }

  const { p, people, holder, bookings } = loaded;
  const plan: Plan = planEdit ?? { tier: p.tier, interval: p.billing_interval, status: p.payment_status };
  const setPlan = setPlanEdit;

  const isMe = p.id === me.id;
  const isHouseholdPerson = Boolean(p.household_owner_id);
  const planChanged = plan.tier !== p.tier || plan.interval !== p.billing_interval || plan.status !== p.payment_status;
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.session && new Date(b.session.starts_at) > new Date());

  return (
    <aside className="adm-card adm-panel" aria-label={`Member ${fullName(p)}`}>
      <div className="adm-card-head">
        <div>
          <h2>{fullName(p)}</h2>
          <span className="adm-sub">{p.email}</span>
        </div>
        <button type="button" className="adm-btn adm-btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="adm-card-body">
        {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
        <dl className="adm-dl">
          <dt>Status</dt>
          <dd>
            {p.disabled_at ? (
              <span className="adm-badge adm-badge-bad">Turned off {fmtDate(p.disabled_at)}</span>
            ) : (
              <span className={statusBadge(p.payment_status)}>{STATUS_LABEL[p.payment_status]}</span>
            )}{' '}
            {p.is_admin && <span className="adm-badge adm-badge-accent">Admin</span>}
          </dd>
          <dt>Credits</dt>
          <dd>
            {p.monthly_credits} monthly, {p.addon_credits} extra
          </dd>
          <dt>Billing day</dt>
          <dd>Day {p.billing_date}</dd>
          <dt>Hello Video</dt>
          <dd>{p.hello_status}</dd>
          <dt>Joined</dt>
          <dd>{fmtDate(p.created_at)}</dd>
        </dl>
      </div>

      <div className="adm-section">
        <h3>Plan and payment</h3>
        {isHouseholdPerson ? (
          <p className="adm-sub">
            Part of {holder ? fullName(holder) : 'a'} Household. The plan and credits belong to the account holder.{' '}
            {holder && (
              <button type="button" className="adm-btn adm-btn-sm" onClick={() => onOpen(holder.id)}>
                Open holder
              </button>
            )}
          </p>
        ) : (
          <form
            className="adm-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                'admin_update_member',
                { p_profile: p.id, p_tier: plan.tier, p_billing_interval: plan.interval, p_payment_status: plan.status },
                'Plan saved.',
              );
            }}
          >
            <div className="adm-form-grid">
              <label className="adm-field">
                <span>Plan</span>
                <select
                  className="adm-select"
                  value={plan.tier}
                  onChange={(e) => setPlan({ ...plan, tier: e.target.value as Tier })}
                >
                  <option value="individual">Solo</option>
                  <option value="household">Household</option>
                </select>
              </label>
              <label className="adm-field">
                <span>Billing</span>
                <select
                  className="adm-select"
                  value={plan.interval}
                  onChange={(e) => setPlan({ ...plan, interval: e.target.value as BillingInterval })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </label>
              <label className="adm-field">
                <span>Payment status</span>
                <select
                  className="adm-select"
                  value={plan.status}
                  onChange={(e) => setPlan({ ...plan, status: e.target.value as PaymentStatus })}
                >
                  {(Object.keys(STATUS_LABEL) as PaymentStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <small className="adm-sub">
              Past due works like a failed renewal (monthly credits wait for payment). Active again gives this
              month’s credits right away. Charges and refunds still happen in the payment processor.
            </small>
            <div>
              <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !planChanged}>
                Save plan
              </button>
            </div>
          </form>
        )}
        {people.length > 0 && (
          <>
            <h3 style={{ marginTop: '1rem' }}>Household people</h3>
            <ul className="adm-list">
              {people.map((person) => (
                <li key={person.id}>
                  <span>
                    {fullName(person)}
                    <span className="adm-sub">{person.email}</span>
                  </span>
                  <button type="button" className="adm-btn adm-btn-sm" onClick={() => onOpen(person.id)}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="adm-section">
        <h3>Credits</h3>
        {giving ? (
          <GiveCredits
            member={{ id: p.id, name: fullName(p), addonCredits: p.addon_credits }}
            onCancel={() => setGiving(false)}
            onDone={(result) => {
              setGiving(false);
              setMsg({
                text:
                  `${result.amount} extra ${result.amount === 1 ? 'credit' : 'credits'} given` +
                  (result.shared ? ", added to the Household's shared credits." : '.'),
                error: false,
              });
              reload();
              onChanged();
            }}
          />
        ) : (
          <button type="button" className="adm-btn" onClick={() => setGiving(true)}>
            Give credits
          </button>
        )}
      </div>

      <div className="adm-section">
        <h3>Bookings</h3>
        {bookings.length === 0 ? (
          <p className="adm-sub">No bookings yet.</p>
        ) : (
          <ul className="adm-list">
            {bookings.map((b) => {
              const canCancel = upcoming.some((u) => u.id === b.id);
              return (
                <li key={b.id}>
                  <span>
                    {b.session?.title ?? 'Session'}
                    <span className="adm-sub">
                      {fmtWhen(b.session?.starts_at)} · {b.status.replace('_', ' ')}
                      {b.held ? ' · held' : ''}
                      {b.release_reason ? ` · ${b.release_reason}` : ''}
                    </span>
                  </span>
                  {canCancel && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-sm adm-btn-danger"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt('Reason for cancelling (the credit goes back to the member):');
                        if (reason?.trim()) {
                          void run(
                            'admin_cancel_booking',
                            { p_booking: b.id, p_refund: true, p_reason: reason },
                            'Booking cancelled and the credit returned.',
                          );
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="adm-section">
        <h3>Access</h3>
        {isMe ? (
          <p className="adm-sub">This is your account. Another admin has to change your access.</p>
        ) : (
          <div className="adm-form">
            <div>
              <button
                type="button"
                className="adm-btn"
                disabled={busy}
                onClick={() =>
                  void run(
                    'admin_set_admin',
                    { p_profile: p.id, p_is_admin: !p.is_admin },
                    p.is_admin ? 'Admin access removed.' : 'Admin access given.',
                  )
                }
              >
                {p.is_admin ? 'Remove admin access' : 'Make admin'}
              </button>
            </div>
            {p.disabled_at ? (
              <div>
                <button
                  type="button"
                  className="adm-btn"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      'admin_set_disabled',
                      { p_profile: p.id, p_disabled: false, p_reason: null },
                      'Turned back on. They can sign in again.',
                    )
                  }
                >
                  Turn back on
                </button>
              </div>
            ) : (
              <form
                className="adm-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!window.confirm(`Turn off ${fullName(p)}? They are signed out and future bookings are cancelled.`)) return;
                  void run(
                    'admin_set_disabled',
                    { p_profile: p.id, p_disabled: true, p_reason: offReason },
                    'Turned off. Signed out everywhere, future bookings cancelled with credits returned.',
                  ).then((res) => res.ok && setOffReason(''));
                }}
              >
                <label className="adm-field">
                  <span>Turn off this account</span>
                  <input
                    className="adm-input"
                    required
                    maxLength={300}
                    placeholder="Reason (kept in the activity log)"
                    value={offReason}
                    onChange={(e) => setOffReason(e.target.value)}
                  />
                  <small>Blocks sign-in and cancels upcoming bookings. Membership billing is not changed.</small>
                </label>
                <div>
                  <button type="submit" className="adm-btn adm-btn-danger" disabled={busy}>
                    Turn off
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
