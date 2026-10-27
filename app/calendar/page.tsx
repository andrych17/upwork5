import type { Metadata } from 'next';
import SchedulePage from '@/components/screens/calendar';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/calendar');

export default function Page() {
  return <SchedulePage />;
}
