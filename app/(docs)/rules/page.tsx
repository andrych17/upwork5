import type { Metadata } from 'next';
import { EMAIL, UPDATED } from '@/lib/placeholders';
import { metaFor } from '@/lib/site';
import { Eyebrow } from '@/components/ui';

export const metadata: Metadata = metaFor('/rules');

export default function Rules() {
  return (
    <>
      <Eyebrow>Plain-language rules</Eyebrow>
      <h1>Community Rules</h1>
      <p className="text-[0.92rem] text-muted">Last updated: {UPDATED}</p>
      <p>
        MeetDoConnect is for people who want a good evening without alcohol and want to find people to do things with.
        These rules keep every room friendly, clean and safe. Agreeing to them is part of joining.
      </p>

      <h2>1. Keep it kind and clean</h2>
      <p>
        No nudity, sexual content, harassment, hate, threats or bullying. Treat everyone in the room the way you would
        like to be treated.
      </p>

      <h2>2. Respect privacy</h2>
      <ul>
        <li>Do not record, screenshot or share anyone else&apos;s image, voice or words.</li>
        <li>Members are shown by first name only. Do not share personal details about another member.</li>
      </ul>

      <h2>3. No selling or recruiting</h2>
      <p>Do not advertise, sell or recruit during sessions or in messages to other members.</p>

      <h2>4. Sessions are alcohol-free</h2>
      <p>Please do not drink alcohol during a session. Everything on the supply cards is made without it.</p>

      <h2>5. Adults hold the account</h2>
      <p>
        Accounts are for adults. Children may join family sessions on a household account, with an adult in the room the
        whole time.
      </p>

      <h2>6. Cameras and sound</h2>
      <p>Cameras are optional. Mute your microphone when you are not talking. Quiet sessions have no talking at all.</p>

      <h2>7. Activity buddies without pressure</h2>
      <ul>
        <li>
          After a session you may pick people you would do it again with. Picks are private. A buddy chat opens only
          when two people pick each other.
        </li>
        <li>
          MeetDoConnect is for friendship first. Do not pressure anyone. If someone says no or goes quiet, leave it
          there.
        </li>
        <li>Do not contact members who did not pick you. A buddy can unmatch or block you at any time.</li>
      </ul>

      <h2>8. Safety tools and what happens next</h2>
      <p>Report, Mute and Leave are always on screen in every room.</p>
      <ul>
        <li>When you report someone, they are removed from the room right away and the account is flagged.</li>
        <li>Two reports from different members within 30 days suspends the account until we review it.</li>
        <li>We review the report queue every week. Serious breaches end the membership.</li>
        <li>
          If you think a decision was wrong, write to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </li>
      </ul>

      <h2>9. Not an emergency service</h2>
      <p>
        MeetDoConnect is not a crisis or medical service. If you or someone else is in danger, contact your local
        emergency number. Session content is general wellness and activity guidance, not medical advice or therapy.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>
    </>
  );
}
