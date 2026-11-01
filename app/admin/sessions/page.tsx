import type { Metadata } from 'next';
import AdminSessions from '@/components/admin/sessions';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Sessions | MeetDoConnect Admin');

export default function Page() {
  return <AdminSessions />;
}
