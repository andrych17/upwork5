import type { Metadata } from 'next';
import LiveRoomPage from '@/components/screens/live-room';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Live room');

export default function Page() {
  return <LiveRoomPage />;
}
