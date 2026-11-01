'use client';

// Bookings: who sits in each upcoming room, with cancel (credit back) for a single seat.
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fullName, useLoad } from '@/lib/admin';

interface Seat {
  id: string;
  held: boolean;
  camera_off: boolean;
  credit_type: 'monthly' | 'addon';
  member: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface Room {
  id: string;
  title: string;
  starts_at: string;
  capacity: number;
  published: boolean;
  bookings: Seat[];
}

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: 'Next 7 days' },
  { days: 14, label: 'Next 14 days' },
] as const;

export default function AdminBookings() {
  const { supabase } = useAdmin();
  const [days, setDays] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select(
        'id,title,starts_at,capacity,published,' +
          'bookings(id,held,camera_off,credit_type,member:profiles!bookings_user_id_fkey(first_name,last_name,email))',
      )
      .eq('bookings.status', 'confirmed')
      .gte('starts_at', new Date().toISOString())
      .lt('starts_at', new Date(Date.now() + days * 864e5).toISOString())
      .order('starts_at')
      .limit(100);
    return { rooms: (data ?? []) as unknown as Room[], error: Boolean(error) };
  }, [supabase, days]);

  const { data: result, loading, reload } = useLoad(fetchRooms);
  const rooms = result?.rooms ?? [];

  const cancel = async (seat: Seat) => {
    const who = seat.member ? fullName(seat.member) : 'this member';
    const reason = window.prompt(`Cancel ${who}'s seat? The credit goes back. Reason:`);
    if (!reason?.trim()) return;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_cancel_booking', { p_booking: seat.id, p_refund: true, p_reason: reason });
    setBusy(false);
    setMsg({ text: res.ok ? `Cancelled ${who}'s seat and returned the credit.` : res.error, error: !res.ok });
    if (res.ok) reload();
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Bookings</h1>
          <p>Confirmed seats in the rooms coming up.</p>
        </div>
        <div className="adm-tabs" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load bookings. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      {!loading && rooms.length === 0 && (
        <section className="adm-card">
          <p className="adm-empty">No sessions in this range.</p>
        </section>
      )}
      {rooms.map((room) => (
        <section key={room.id} className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2>{room.title}</h2>
              <span className="adm-sub">
                {fmtWhen(room.starts_at)} · {room.bookings.length} of {room.capacity} seats
                {room.published ? '' : ' · hidden'}
              </span>
            </div>
          </div>
          {room.bookings.length === 0 ? (
            <p className="adm-empty">No one booked yet.</p>
          ) : (
            <ul className="adm-list adm-card-body">
              {room.bookings.map((seat) => (
                <li key={seat.id}>
                  <span>
                    {seat.member ? fullName(seat.member) : 'Member'}
                    <span className="adm-sub">
                      {seat.member?.email}
                      {seat.credit_type === 'addon' ? ' · extra credit' : ''}
                      {seat.camera_off ? ' · Bad Hair Day' : ''}
                      {seat.held ? ' · held for Hello Video' : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="adm-btn adm-btn-sm adm-btn-danger"
                    disabled={busy}
                    onClick={() => void cancel(seat)}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
