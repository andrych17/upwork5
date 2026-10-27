import type { Metadata } from 'next';
import GamesPage from '@/components/screens/games';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/games');

export default function Page() {
  return <GamesPage />;
}
