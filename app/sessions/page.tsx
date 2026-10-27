import type { Metadata } from 'next';
import MySessionsPage from '@/components/screens/my-sessions';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('My sessions');

export default function Page() {
  return <MySessionsPage />;
}
