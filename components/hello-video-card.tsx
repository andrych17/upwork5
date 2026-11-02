'use client';

// Hello Video status on the Membership page. Hidden once approved; the recorder lives on /hello-video.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';

type View = Pick<MembershipSummary, 'hello_status' | 'hello_required' | 'hello_hold'>;

const TEXT: Record<Exclude<View['hello_status'], 'approved'>, { title: string; action: string }> = {
  none: { title: 'Say hi to the team.', action: 'Record your Hello Video' },
  pending: { title: 'Thanks, we’re watching it.', action: 'Record a new one' },
  rejected: { title: 'Please record again.', action: 'Record again' },
  declined: { title: 'We couldn’t approve this video.', action: 'Contact us' },
};

export default function HelloVideoCard() {
  const live = Boolean(getSupabase());
  const [view, setView] = useState<View | null>(() => (live ? null : { hello_status: 'none', hello_required: false, hello_hold: false }));

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let current = true;
    (async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      const { data, error } = await supabase.rpc('get_my_membership');
      const summary = data as MembershipSummary | null;
      if (current && !error && summary)
        setView({
          hello_status: summary.hello_status,
          hello_required: summary.hello_required,
          hello_hold: summary.hello_hold,
        });
    })();
    return () => {
      current = false;
    };
  }, []);

  if (!view || view.hello_status === 'approved') return null;
  const text = TEXT[view.hello_status];

  return (
    <section className="billing-section household-section hello-membership" id="hello-video">
      <div className="billing-heading">
        <p className="section-label">Hello Video</p>
        <h2>{text.title}</h2>
      </div>
      <p className="household-intro">
        30 to 60 seconds, recorded right in your browser: your first name and why you joined. Only the
        MeetDoConnect team watches it, and it’s deleted as soon as it’s reviewed.
        {view.hello_required &&
          view.hello_status !== 'pending' &&
          (view.hello_hold
            ? ' You can book now, and your bookings are held until it’s approved.'
            : ' You can book sessions once it’s approved.')}
        {view.hello_status === 'pending' && ' You’ll see the result here.'}
      </p>
      <Link className="enter-room" href="/hello-video">
        {text.action} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
