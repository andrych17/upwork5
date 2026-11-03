import type { Metadata } from 'next';
import PasswordPage from '@/components/screens/password';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Change password | MeetDoConnect');

export default function Page() {
  return <PasswordPage />;
}
