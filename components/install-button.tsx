'use client';

// "Install the app" for the PWA, shown on the home page and in the mobile menu.
// - Chrome, Edge and Android hand us a beforeinstallprompt event; the button opens the browser's install dialog.
// - Android before that event (Chrome waits for a tap and some time on the site): the button explains the ⋮ menu.
// - iPhone and iPad have no install API, so the button explains Safari's Add to Home Screen.
// - Hidden when the site already runs as an installed app, and on desktop browsers that offer no install.
import { useState, useSyncExternalStore } from 'react';
import { Button, cn } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type Mode = 'prompt' | 'ios' | 'android' | 'installed' | 'none';

// The event fires once per page load, so listen as soon as this module loads (SiteHeader imports it on every page).
// The browser's own install banner is left alone; this button is a second way in.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getMode(): Mode {
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  if (standalone) return 'installed';
  if (deferred) return 'prompt';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'none';
}

const HELP = {
  ios: 'In Safari, tap the Share button, then Add to Home Screen. MeetDoConnect opens from your home screen like an app.',
  android:
    'In Chrome, tap the ⋮ menu at the top right, then Install app (or Add to Home screen). MeetDoConnect opens from your home screen like an app.',
} as const;

export default function InstallButton({ inMenu = false }: { inMenu?: boolean }) {
  const mode = useSyncExternalStore(subscribe, getMode, () => 'none' as Mode);
  const [showHelp, setShowHelp] = useState(false);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    emit();
  }

  if (mode === 'installed' || mode === 'none') return null;
  const style = inMenu
    ? 'min-h-11 w-full justify-between rounded-xl px-4 text-[0.95rem] text-fg hover:bg-shell'
    : 'justify-self-start ring-1 ring-line';
  const label = mode === 'ios' ? 'Add to Home Screen' : 'Install the app';

  if (mode === 'prompt') {
    return (
      <div className={cn('grid', inMenu && 'border-t border-line pt-1')}>
        <Button variant="quiet" onClick={install} className={style}>
          {label}
        </Button>
      </div>
    );
  }
  return (
    <div className={cn('grid gap-2', inMenu && 'border-t border-line pt-1')}>
      <Button variant="quiet" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)} className={style}>
        {label}
      </Button>
      {showHelp && (
        <p role="status" className={cn('max-w-prose text-sm text-muted', inMenu && 'px-4 pb-2')}>
          {HELP[mode]}
        </p>
      )}
    </div>
  );
}
