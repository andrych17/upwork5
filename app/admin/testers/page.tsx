import type { Metadata } from 'next';
import AdminTesters from '@/components/admin/testers';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Testers | MeetDoConnect Admin');

export default function Page() {
  return <AdminTesters />;
}
