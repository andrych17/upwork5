import type { Metadata } from 'next';
import AdminSettings from '@/components/admin/settings';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Settings | MeetDoConnect Admin');

export default function Page() {
  return <AdminSettings />;
}
