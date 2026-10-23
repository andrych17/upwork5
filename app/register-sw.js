'use client';

import { useEffect } from 'react';

// Registers public/sw.js so the site installs to a phone and opens offline. Skipped in `next dev`.
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
