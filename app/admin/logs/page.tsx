import type { Metadata } from 'next';
import AdminLogs from '@/components/admin/logs';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Activity log | MeetDoConnect Admin');

export default function Page() {
  return <AdminLogs />;
}
