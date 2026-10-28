import type { Metadata } from 'next';
import AdminPage from '@/components/screens/admin';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Admin Dashboard | MeetDoConnect');

export default function Page() {
  return <AdminPage />;
}
