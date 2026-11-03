import type { Metadata } from 'next';
import AdminUsage from '@/components/admin/usage';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Usage | MeetDoConnect Admin');

export default function Page() {
  return <AdminUsage />;
}
