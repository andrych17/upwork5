import type { Metadata } from 'next';
import Link from 'next/link';
import { EMAIL, LLC, UPDATED, isDemo, ph } from '@/lib/placeholders';
import { metaFor } from '@/lib/site';
import { Eyebrow } from '@/components/ui';

export const metadata: Metadata = metaFor('/terms');

/*
  DRAFT TEMPLATE. This page is a starting outline, not legal advice.
  Fill in every placeholder (ph(...) and the values in lib/placeholders.ts), then have a lawyer review it before you take payments.
  Delete this comment and the draft notice below when it is final.
*/
export default function Terms() {
  return (
    <>
      <Eyebrow>Draft</Eyebrow>
      <h1>Terms of Service</h1>
      <p className="text-[0.92rem] text-muted">Last updated: {UPDATED}</p>
      <p className="my-5 rounded-2xl bg-warn-bg px-4.5 py-3.5 text-[0.93rem] text-warn">
        {isDemo
          ? 'Sample terms for this preview. The final version needs a lawyer to review it before launch.'
          : 'Draft template. Fill in every [BRACKET] and have a lawyer review this page before launch. Remove this notice when it is final.'}
      </p>

      <h2>1. Who we are</h2>
      <p>
        MeetDoConnect is run by {LLC}, a {ph('STATE', 'Texas')} limited liability company (&quot;MeetDoConnect&quot;,
        &quot;we&quot;, &quot;us&quot;). Contact: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>

      <h2>2. Who can join</h2>
      <p>
        You must be at least 18 years old to create an account. Children may take part in family sessions on a household
        account held by an adult who stays in the room.
      </p>

      <h2>3. Your account</h2>
      <p>
        Give accurate information and keep your sign-in details private. You are responsible for activity on your
        account. Each person needs their own account unless you have a household add-on.
      </p>

      <h2>4. Membership, credits and payment</h2>
      <ul>
        <li>
          Membership costs {ph('PRICE', '$26')} per month for individuals ({ph('PRICE', '$260')} annual) or {ph('PRICE', '$34')} per month for households ({ph('PRICE', '$340')} annual), and includes {ph('NUMBER', '13')}{' '}
          session credits each billing month (up to 4 per week).
        </li>
        <li>
          One credit books one standard session. Extra credits cost {ph('PRICE', '$4 each, or $15 for a 5-pack')} and never expire.
        </li>
        <li>
          Unused monthly credits expire at the end of each billing cycle (your sign-up date each month). They do not carry over.
        </li>
        <li>
          If a renewal payment fails, credits are paused and already-booked sessions are held for a 3-day grace period before being released.
        </li>
        <li>Payments are handled securely by {ph('PAYMENT PROCESSOR', 'our payment partner')}. We do not store full card numbers.</li>
        <li>
          Membership renews automatically until you cancel. You can cancel at any time from{' '}
          {ph('WHERE', 'your account settings')}, and it ends at the close of the current billing period.
        </li>
      </ul>

      <h2>5. Booking and cancellations</h2>
      <p>
        You may cancel a booking up to {ph('NUMBER', '24')} hours before it starts and the credit is returned. After
        that the credit is used. We may cancel a session; if we do, we will return the credit.{' '}
        {ph('REFUND POLICY', 'Membership fees already paid for the current month are not refunded.')}
      </p>

      <h2>6. Community Rules</h2>
      <p>
        You agree to follow the <Link href="/rules">Community Rules</Link>. We may remove people from sessions, suspend
        accounts or end memberships that break them, with or without a refund of{' '}
        {ph('REFUND TERMS', 'the current month’s fee')}.
      </p>

      <h2>7. Activities and your own safety</h2>
      <p>
        Sessions include activities such as cooking, crafts, skincare and light movement that you do in your own space.
        You take part at your own risk, follow the safety notes on each supply card, and decide whether an activity is
        right for you. Content is general wellness and activity information, not medical advice.{' '}
        {ph('LAWYER TO REVIEW ASSUMPTION OF RISK AND WAIVER LANGUAGE', 'Stop any activity that feels unsafe for you.')}
      </p>

      <h2>8. Recording and content</h2>
      <p>
        Sessions are not recorded and you may not record them. Anything you share in a session or message stays your
        responsibility. You give us permission to display what you post only as needed to run the service.
      </p>

      <h2>9. Activity buddies</h2>
      <p>
        Buddy picks are private. Contact details are not shared by MeetDoConnect. Anything you choose to share with
        another member is your decision. We cannot guarantee how other members behave. See the Community Rules for how
        to report a problem.
      </p>

      <h2>10. Our service</h2>
      <p>
        We work to keep MeetDoConnect available but cannot promise it will always be uninterrupted. We may change or end
        features with reasonable notice.{' '}
        {ph(
          'LAWYER TO REVIEW DISCLAIMERS AND LIMITATION OF LIABILITY',
          'The service is provided as it is, within the limits the law allows.',
        )}
      </p>

      <h2>11. Ending your membership</h2>
      <p>
        You may stop using MeetDoConnect at any time. We may suspend or end your access if you break these terms or the
        Community Rules, or if we must by law.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>We may update these terms. We will tell members about important changes before they take effect.</p>

      <h2>13. Governing law and disputes</h2>
      <p>
        {ph(
          'GOVERNING STATE AND HOW DISPUTES ARE HANDLED. LAWYER TO COMPLETE',
          'These terms follow Texas law. If something goes wrong, write to us first and we will try to sort it out together.',
        )}
        {isDemo ? '' : '.'}
      </p>

      <h2>14. Contact</h2>
      <p>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a> · {ph('MAILING ADDRESS', '123 Example Street, San Antonio, TX 78205')}
      </p>
    </>
  );
}
