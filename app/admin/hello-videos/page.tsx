import type { Metadata } from 'next';
import AdminHelloVideos from '@/components/admin/hello-videos';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Hello Videos | MeetDoConnect Admin');

export default function Page() {
  return <AdminHelloVideos />;
}
