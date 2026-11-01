import type { Metadata } from 'next';
import HelloVideoPage from '@/components/screens/hello-video';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Hello Video');

export default function Page() {
  return <HelloVideoPage />;
}
