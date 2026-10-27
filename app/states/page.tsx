import type { Metadata } from 'next';
import P1StatesPage from '@/components/screens/states';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Screen states');

export default function Page() {
  return <P1StatesPage />;
}
