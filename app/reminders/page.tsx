import type { Metadata } from 'next';
import RemindersPage from '@/components/screens/reminders';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Reminders');

export default function Page() {
  return <RemindersPage />;
}
