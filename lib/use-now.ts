'use client';

// The current time for render code, refreshed every 30 seconds, so things like "Room is open" or
// "Booking has closed" change on their own while the page stays open. Server render gets 0.
import { useSyncExternalStore } from 'react';

const TICK_MS = 30_000;
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
      now = 0;
    }
  };
}

const snapshot = () => (now ||= Date.now());

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
