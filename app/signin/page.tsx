import type { Metadata } from 'next';
import SigninPage from '@/components/screens/signin';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/signin');

export default function Page() {
  return <SigninPage />;
}
