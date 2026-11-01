import type { Metadata } from 'next';
import AdminReports from '@/components/admin/reports';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Reports | MeetDoConnect Admin');

export default function Page() {
  return <AdminReports />;
}
