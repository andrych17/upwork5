import { Suspense } from 'react';
import { BookFromQuery } from '@/components/screens/book';
import { memberMeta } from '@/lib/site';

export const metadata = memberMeta('Book a session');

// Any session from the database: /book?s=<slug>. The twelve catalog rooms also keep /book/<room>.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <BookFromQuery />
    </Suspense>
  );
}
