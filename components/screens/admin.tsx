'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

interface AdminMemberItem {
  id: string;
  name: string;
  email: string;
  tier: 'individual' | 'household';
  interval: 'monthly' | 'annual';
  billingDay: number;
  monthlyCredits: number;
  addonCredits: number;
  status: 'active' | 'past_due' | 'paused' | 'canceled';
  graceExpiry?: string;
  joinedDate: string;
}

interface AdminBookingItem {
  id: string;
  sessionTitle: string;
  startsAt: string;
  memberName: string;
  memberEmail: string;
  status: 'confirmed' | 'cancelled';
  capacity: number;
  host: string;
}

const sampleMembers: AdminMemberItem[] = [
  {
    id: 'm-1',
    name: 'Maya Lin',
    email: 'maya.lin@example.com',
    tier: 'individual',
    interval: 'monthly',
    billingDay: 12,
    monthlyCredits: 9,
    addonCredits: 2,
    status: 'active',
    joinedDate: '2026-09-12',
  },
  {
    id: 'm-2',
    name: 'Jonah Vance',
    email: 'jonah.vance@example.com',
    tier: 'individual',
    interval: 'annual',
    billingDay: 4,
    monthlyCredits: 12,
    addonCredits: 0,
    status: 'active',
    joinedDate: '2026-08-04',
  },
  {
    id: 'm-3',
    name: 'Nina Patel',
    email: 'nina.patel@example.com',
    tier: 'household',
    interval: 'monthly',
    billingDay: 28,
    monthlyCredits: 4,
    addonCredits: 5,
    status: 'active',
    joinedDate: '2026-07-28',
  },
  {
    id: 'm-4',
    name: 'Robert Hayes',
    email: 'robert.h@example.com',
    tier: 'individual',
    interval: 'monthly',
    billingDay: 25,
    monthlyCredits: 0,
    addonCredits: 0,
    status: 'past_due',
    graceExpiry: 'Oct 31, 2026 (2 days left)',
    joinedDate: '2026-06-25',
  },
  {
    id: 'm-5',
    name: 'Elena Rostova',
    email: 'elena.r@example.com',
    tier: 'household',
    interval: 'annual',
    billingDay: 18,
    monthlyCredits: 13,
    addonCredits: 1,
    status: 'active',
    joinedDate: '2026-05-18',
  },
];

const sampleBookings: AdminBookingItem[] = [
  {
    id: 'b-1',
    sessionTitle: 'Quiet Evening Co-work',
    startsAt: 'Tonight at 6:30 pm CT',
    memberName: 'Maya Lin',
    memberEmail: 'maya.lin@example.com',
    status: 'confirmed',
    capacity: 6,
    host: 'Kelly C.',
  },
  {
    id: 'b-2',
    sessionTitle: 'Gentle Sketch & Sip',
    startsAt: 'Tomorrow at 8:00 pm CT',
    memberName: 'Jonah Vance',
    memberEmail: 'jonah.vance@example.com',
    status: 'confirmed',
    capacity: 6,
    host: 'Elena R.',
  },
  {
    id: 'b-3',
    sessionTitle: 'Writers’ Warm-Up Hour',
    startsAt: 'Thursday at 6:30 pm CT',
    memberName: 'Nina Patel',
    memberEmail: 'nina.patel@example.com',
    status: 'confirmed',
    capacity: 6,
    host: 'Kelly C.',
  },
  {
    id: 'b-4',
    sessionTitle: 'Weekly Trivia & Laughs',
    startsAt: 'Friday at 8:00 pm CT',
    memberName: 'Maya Lin',
    memberEmail: 'maya.lin@example.com',
    status: 'confirmed',
    capacity: 6,
    host: 'Marcus T.',
  },
];

export default function AdminPage() {
  const [tab, setTab] = useState<'members' | 'bookings'>('members');
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<AdminMemberItem[]>(sampleMembers);
  const bookings = sampleBookings;
  const isLiveSupabase = Boolean(getSupabase());

  useEffect(() => {
    const supabase = getSupabase();
    if (supabase) {
      // Fetch live data if tables exist
      const loadProfiles = async () => {
        try {
          const { data } = await supabase.from('profiles').select('*');
          if (data && data.length > 0) {
            const mapped: AdminMemberItem[] = data.map((row: Record<string, unknown>, i: number) => ({
              id: (row.id as string) || `user-${i}`,
              name: `${row.first_name || 'Member'} ${row.last_name || ''}`.trim(),
              email: (row.email as string) || 'member@meetdoconnect.com',
              tier: (row.tier as 'individual' | 'household') || 'individual',
              interval: (row.billing_interval as 'monthly' | 'annual') || 'monthly',
              billingDay: (row.billing_date as number) || 1,
              monthlyCredits: (row.monthly_credits as number) ?? 13,
              addonCredits: (row.addon_credits as number) ?? 0,
              status: (row.payment_status as 'active' | 'past_due' | 'paused' | 'canceled') || 'active',
              joinedDate: row.created_at ? new Date(row.created_at as string).toISOString().split('T')[0] : '2026-10-28',
            }));
            setMembers(mapped);
          }
        } catch {
          // Fall back gracefully to preview data if table does not exist yet
        }
      };
      loadProfiles();
    }
  }, []);

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredBookings = bookings.filter(
    (b) =>
      b.sessionTitle.toLowerCase().includes(search.toLowerCase()) ||
      b.memberName.toLowerCase().includes(search.toLowerCase()) ||
      b.memberEmail.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main style={{ minHeight: '100vh', background: '#f9fafb', color: '#111827', fontFamily: 'inherit' }}>
      <header
        style={{
          borderBottom: '1px solid #e5e7eb',
          background: 'white',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/" style={{ textDecoration: 'none', fontWeight: 800, fontSize: '20px', color: '#b45309' }}>
            MeetDoConnect
          </Link>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#fef3c7',
              color: '#92400e',
            }}
          >
            Admin Dashboard
          </span>
          {isLiveSupabase ? (
            <span style={{ fontSize: '12px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669' }} />
              Supabase connected
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Local preview data</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            href="/calendar"
            style={{
              fontSize: '14px',
              color: '#4b5563',
              textDecoration: 'none',
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
          >
            Calendar
          </Link>
          <Link
            href="/signin"
            style={{
              fontSize: '14px',
              color: '#4b5563',
              textDecoration: 'none',
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
            }}
          >
            Sign in
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 6px 0' }}>Admin Overview</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '15px' }}>
            Review active members, monthly session credits, billing cycles, and current bookings.
          </p>
        </div>

        {/* Top metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '28px',
          }}
        >
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Total Members</span>
            <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px' }}>{members.length}</div>
            <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
              {members.filter((m) => m.status === 'active').length} active in good standing
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Bookings This Week</span>
            <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px' }}>{bookings.length}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Max 12 members per room</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Monthly Credit Rule</span>
            <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px' }}>13</div>
            <div style={{ fontSize: '12px', color: '#b45309', marginTop: '4px' }}>Up to 4 sessions / 7 days</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Grace Period</span>
            <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px' }}>3 Days</div>
            <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>Hold seats before auto-release</div>
          </div>
        </div>

        {/* Table card */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setTab('members')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: tab === 'members' ? '#b45309' : '#f3f4f6',
                  color: tab === 'members' ? 'white' : '#4b5563',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Members ({filteredMembers.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('bookings')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: tab === 'bookings' ? '#b45309' : '#f3f4f6',
                  color: tab === 'bookings' ? 'white' : '#4b5563',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Booked Sessions ({filteredBookings.length})
              </button>
            </div>

            <div>
              <input
                type="text"
                placeholder={tab === 'members' ? 'Search by name or email...' : 'Search by session or member...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  width: '260px',
                }}
              />
            </div>
          </div>

          {tab === 'members' ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Member</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Plan & Tier</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Billing Date</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Monthly Credits</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Extra Credits</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Payment Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{m.name}</div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>{m.email}</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                          {m.tier} ({m.interval})
                        </span>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {m.tier === 'individual' ? '$26/mo' : '$34/mo'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div>Day {m.billingDay} each month</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>No carry-over</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontWeight: 600, color: m.monthlyCredits > 0 ? '#059669' : '#dc2626' }}>
                          {m.monthlyCredits} of 13
                        </span>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Max 4/week</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontWeight: 500 }}>{m.addonCredits}</span>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Never expire</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {m.status === 'active' ? (
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '999px',
                              background: '#ecfdf5',
                              color: '#065f46',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            Active
                          </span>
                        ) : (
                          <div>
                            <span
                              style={{
                                padding: '4px 10px',
                                borderRadius: '999px',
                                background: '#fef2f2',
                                color: '#991b1b',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              Past Due
                            </span>
                            {m.graceExpiry && (
                              <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                                {m.graceExpiry}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Session</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Scheduled Time</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Member</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Host</th>
                    <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600 }}>{b.sessionTitle}</td>
                      <td style={{ padding: '14px 20px', color: '#4b5563' }}>{b.startsAt}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 500 }}>{b.memberName}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{b.memberEmail}</div>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#6b7280' }}>{b.host}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          Confirmed
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
