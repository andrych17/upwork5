import type { Metadata } from 'next';
import { Suspense } from 'react';
import AfterSessionPage from '@/components/screens/after-session';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('After the session');

// /after-session?s=<session slug> picks people from that session; ?buddy=<id> opens a Buddy Room.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AfterSessionPage />
    </Suspense>
  );
}
