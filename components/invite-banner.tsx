'use client';

import { updateBuddyDemo, useBuddyDemo } from '@/lib/buddy-demo';

// Shown on Calendar and Book while a member is picking a session to share with a buddy.
export default function InviteBanner({ place }: { place: 'calendar' | 'book' }) {
  const { inviting } = useBuddyDemo();
  if (!inviting) return null;

  return (
    <div className={`invite-banner invite-banner-${place}`} role="status">
      <div>
        <span>Buddy invite</span>
        <strong>Inviting {inviting}</strong>
        <p>
          {place === 'calendar'
            ? `Pick a session and confirm your seat. ${inviting} gets the invitation in your Buddy Room.`
            : `Confirming sends this session to ${inviting} in your Buddy Room. ${inviting} confirms with their own credit.`}
        </p>
      </div>
      <button type="button" onClick={() => updateBuddyDemo((demo) => ({ ...demo, inviting: null }))}>
        Cancel invite
      </button>
    </div>
  );
}
