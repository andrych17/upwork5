import type { Metadata } from 'next';
import AdminOverview from '@/components/admin/overview';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Admin Dashboard | MeetDoConnect');

export default function Page() {
  return <AdminOverview />;
}
