import type { Metadata } from 'next';
import AdminFeedback from '@/components/admin/feedback';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Feedback | MeetDoConnect Admin');

export default function Page() {
  return <AdminFeedback />;
}
