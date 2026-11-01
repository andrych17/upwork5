import type { Metadata } from 'next';
import AdminMembers from '@/components/admin/members';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Members | MeetDoConnect Admin');

export default function Page() {
  return <AdminMembers />;
}
