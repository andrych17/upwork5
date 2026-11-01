'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { fmtWhen } from '@/lib/admin';

interface Stats {
  members: number;
  active: number;
  pastDue: number;
  off: number;
  hello: number;
  seats: number;
}

interface NextSession {
  id: string;
  title: string;
  starts_at: string;
  capacity: number;
  bookings: { count: number }[];
}

export default function AdminOverview() {
  const { supabase } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [next, setNext] = useState<NextSession[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const now = new Date().toISOString();
    const week = new Date(Date.now() + 7 * 864e5).toISOString();
    const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
      Promise.resolve(q).then((r) => {
        if (r.error) throw r.error;
        return r.count ?? 0;
      });
    const profiles = () => supabase.from('profiles').select('id', { count: 'exact', head: true });

    Promise.all([
      count(profiles()),
      count(profiles().eq('payment_status', 'active').is('disabled_at', null)),
      count(profiles().eq('payment_status', 'past_due')),
      count(profiles().not('disabled_at', 'is', null)),
      count(profiles().eq('hello_status', 'pending')),
      count(
        supabase
          .from('bookings')
          .select('id, sessions!inner(starts_at)', { count: 'exact', head: true })
          .eq('status', 'confirmed')
          .gte('sessions.starts_at', now)
          .lt('sessions.starts_at', week),
      ),
      supabase
        .from('sessions')
        .select('id,title,starts_at,capacity,bookings(count)')
        .eq('bookings.status', 'confirmed')
        .gte('starts_at', now)
        .order('starts_at')
        .limit(6),
    ])
      .then(([members, active, pastDue, off, hello, seats, sessions]) => {
        setStats({ members, active, pastDue, off, hello, seats });
        if (sessions.error) throw sessions.error;
        setNext((sessions.data ?? []) as NextSession[]);
      })
      .catch(() => setError('Could not load the dashboard. Refresh to try again.'));
  }, [supabase]);

  const tiles: { label: string; value: number | undefined; href: Route }[] = [
    { label: 'Members', value: stats?.members, href: '/admin/members' },
    { label: 'Active', value: stats?.active, href: '/admin/members' },
    { label: 'Past due', value: stats?.pastDue, href: '/admin/members' },
    { label: 'Turned off', value: stats?.off, href: '/admin/members' },
    { label: 'Hello Videos to review', value: stats?.hello, href: '/admin/hello-videos' },
    { label: 'Seats booked, next 7 days', value: stats?.seats, href: '/admin/bookings' },
  ];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p>Members, reviews and the rooms coming up.</p>
        </div>
      </header>
      {error && <p className="adm-msg adm-msg-error">{error}</p>}
      <div className="adm-stats">
        {tiles.map((tile) => (
          <Link key={tile.label} className="adm-stat" href={tile.href}>
            <span>{tile.label}</span>
            <strong>{tile.value ?? '–'}</strong>
          </Link>
        ))}
      </div>
      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Next sessions</h2>
          <Link className="adm-btn adm-btn-sm" href="/admin/sessions">
            All sessions
          </Link>
        </div>
        {next.length === 0 ? (
          <p className="adm-empty">No upcoming sessions.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Starts</th>
                  <th>Seats</th>
                </tr>
              </thead>
              <tbody>
                {next.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{fmtWhen(s.starts_at)}</td>
                    <td>
                      {s.bookings[0]?.count ?? 0} of {s.capacity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
