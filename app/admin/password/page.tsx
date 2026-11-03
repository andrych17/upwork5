import type { Metadata } from 'next';
import AdminPassword from '@/components/admin/password';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Password | MeetDoConnect Admin');

export default function Page() {
  return <AdminPassword />;
}
