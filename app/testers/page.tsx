import type { Metadata } from 'next';
import TestersPage from '@/components/screens/testers';
import { memberMeta } from '@/lib/site';

// A link Kelly sends to people who answered her post, so it stays out of search results.
export const metadata: Metadata = memberMeta('Test MeetDoConnect free for 7 days');

export default function Page() {
  return <TestersPage />;
}
