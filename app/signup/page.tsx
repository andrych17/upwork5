import type { Metadata } from 'next';
import SignupPage from '@/components/screens/signup';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/signup');

export default function Page() {
  return <SignupPage />;
}
