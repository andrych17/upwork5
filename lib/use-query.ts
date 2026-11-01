'use client';

// One value from the page's ?query, without useSearchParams (which needs a Suspense boundary in a static
// export). null on the server and during hydration.
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
