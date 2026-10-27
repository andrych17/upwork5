import type { Metadata } from 'next';
import AfterSessionPage from '@/components/screens/after-session';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('After the session');

export default function Page() {
  return <AfterSessionPage />;
}
