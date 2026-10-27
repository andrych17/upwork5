import type { Metadata } from 'next';
import P2Workspace from '@/components/screens/p2';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Member and admin tools');

export default function Page() {
  return <P2Workspace />;
}
