import type { Metadata } from 'next';
import AdminPayments from '@/components/admin/payments';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Payments | MeetDoConnect Admin');

export default function Page() {
  return <AdminPayments />;
}
