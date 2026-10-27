import type { Metadata } from 'next';
import MembershipPage from '@/components/screens/membership';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Membership');

export default function Page() {
  return <MembershipPage />;
}
