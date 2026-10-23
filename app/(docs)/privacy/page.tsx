import type { Metadata } from 'next';
import { EMAIL, LLC, UPDATED, isDemo, ph } from '@/lib/placeholders';
import { metaFor } from '@/lib/site';
import { Eyebrow } from '@/components/ui';

export const metadata: Metadata = metaFor('/privacy');

const PAYMENTS = ph('PAYMENT PROCESSOR', 'Stripe');

/*
  DRAFT TEMPLATE. This page is a starting outline, not legal advice.
  Update it to match the tools you actually use (payments, email, video, database),
  fill in every placeholder, and have a lawyer review it before launch.
  Delete this comment and the draft notice below when it is final.
*/
export default function Privacy() {
  return (
    <>
      <Eyebrow>Draft</Eyebrow>
      <h1>Privacy Policy</h1>
      <p className="text-[0.92rem] text-muted">Last updated: {UPDATED}</p>
      <p className="my-5 rounded-2xl bg-warn-bg px-4.5 py-3.5 text-[0.93rem] text-warn">
        {isDemo
          ? 'Sample policy for this preview. The final version should match the tools in use and be reviewed by a lawyer.'
          : 'Draft template. Match it to the tools you really use, fill in every [BRACKET], and have a lawyer review it before launch. Remove this notice when it is final.'}
      </p>

      <h2>Who is responsible</h2>
      <p>
        {LLC} runs MeetDoConnect. Contact: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address and phone number.
        </li>
        <li>
          <strong>Membership and bookings:</strong> your plan, credits, sessions booked and attended.
        </li>
        <li>
          <strong>Activity buddy picks:</strong> who you pick after a session. Picks are private and used only to find
          mutual matches.
        </li>
        <li>
          <strong>Reports:</strong> reports you make or that are made about you, so we can keep rooms safe.
        </li>
        <li>
          <strong>Payments:</strong> handled by {PAYMENTS}. We receive confirmation of payment and the last four digits
          of your card, not the full number.
        </li>
        <li>
          <strong>Technical data:</strong> device and browser details and basic usage logs, to keep the site working.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your membership and bookings.</li>
        <li>To send confirmations and reminders by email, and by text if you choose it.</li>
        <li>To match activity buddies and keep sessions safe.</li>
        <li>To improve MeetDoConnect.</li>
      </ul>

      <h2>Who sees it</h2>
      <p>
        Other members see your first name in a room. We share data only with the services that help us run
        MeetDoConnect: {PAYMENTS}, {ph('VIDEO PROVIDER', 'JaaS (Jitsi as a Service)')},{' '}
        {ph('EMAIL PROVIDER', 'Postmark')}, {ph('DATABASE AND HOSTING PROVIDER', 'Supabase and Cloudflare')}. We do not
        sell your personal information. We may share information if the law requires it or to protect someone&apos;s
        safety.
      </p>

      <h2>Sessions are not recorded</h2>
      <p>We do not record sessions. Members agree not to record them either.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep account data while your membership is active and for {ph('PERIOD', '12 months')} afterward. Reports are
        kept for {ph('PERIOD', '24 months')} for safety reasons.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Change your reminder settings at any time.</li>
        <li>
          Ask to see, correct or delete your data by writing to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </li>
        <li>
          {ph(
            'ADD ANY STATE-SPECIFIC PRIVACY RIGHTS. LAWYER TO COMPLETE',
            'Depending on where you live, you may have more rights over your data. Write to us and we will help.',
          )}
          {isDemo ? '' : '.'}
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Accounts are for adults. Children take part only on a household account held by an adult. We do not knowingly
        collect information from children outside of that.
      </p>

      <h2>Cookies and similar tools</h2>
      <p>
        {ph(
          'LIST ANY COOKIES, ANALYTICS OR PUSH-NOTIFICATION SERVICES YOU USE.',
          'We use one cookie to keep you signed in. Your reminder settings are saved on your device. We do not use advertising cookies.',
        )}
      </p>

      <h2>Changes</h2>
      <p>We will tell members about important changes to this policy before they take effect.</p>
    </>
  );
}
