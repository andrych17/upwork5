'use client';

// "Install the app" for the PWA. Chrome, Edge and Android hand us a beforeinstallprompt event to show their
// install dialog; iPhone and iPad have no such API, so there the button explains Add to Home Screen instead.
// Hidden when the site already runs as an installed app, or when the browser offers neither.
import { useState, useSyncExternalStore } from 'react';
import { Button } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type Mode = 'prompt' | 'ios' | 'installed' | 'none';

// The event fires once, early, so listen at module load and keep it until the button is pressed.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's own mini bar away; the button below opens the same dialog
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
  const ios =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'none';
}

export default function InstallButton() {
  const mode = useSyncExternalStore(subscribe, getMode, () => 'none' as Mode);
  const [showHelp, setShowHelp] = useState(false);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    emit();
  }

  if (mode === 'prompt') {
    return (
      <Button variant="quiet" onClick={install} className="justify-self-start ring-1 ring-line">
        Install the app
      </Button>
    );
  }
  if (mode !== 'ios') return null;
  return (
    <div className="grid gap-2">
      <Button
        variant="quiet"
        aria-expanded={showHelp}
        onClick={() => setShowHelp(!showHelp)}
        className="justify-self-start ring-1 ring-line"
      >
        Add to Home Screen
      </Button>
      {showHelp && (
        <p role="status" className="max-w-prose text-sm text-muted">
          In Safari, tap the Share button, then Add to Home Screen. MeetDoConnect opens from your home screen like an
          app.
        </p>
      )}
    </div>
  );
}
