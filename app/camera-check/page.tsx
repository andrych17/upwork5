import type { Metadata } from 'next';
import CameraCheckPage from '@/components/screens/camera-check';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Camera check');

export default function Page() {
  return <CameraCheckPage />;
}
