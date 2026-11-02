'use client';

// "Install the app" for the PWA, in three places that share one state:
// - InstallButton: a quiet button in the site footer and on the Reminders page.
// - InstallCard: a small card at the bottom of the screen, shown on every visit until "Not now" (which hides it
//   for the rest of that visit) or until the app is installed.
// - the account menu, which calls useInstallMode + startInstall.
// How installing works per browser:
// - Chrome, Edge and Android hand us a beforeinstallprompt event; Install opens the browser's install dialog.
// - Android before that event (Chrome waits for a tap and some time on the site): we explain the ⋮ menu.
// - iPhone and iPad have no install API, so we explain Safari's Add to Home Screen.
// - Nothing shows when the site already runs as an installed app, or on desktop browsers that offer no install.
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { HIDDEN } from './member-tabs';
import { Button } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export type InstallMode = 'prompt' | 'ios' | 'android' | 'installed' | 'none';

// The event fires once per page load, so listen as soon as this module loads (the root layout imports it).
// The browser's own install banner is left alone; these are extra ways in.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
// The menu asked for the install steps, so the card opens with them even after "Not now".
let helpAsked = false;
const DISMISS_KEY = 'mdc-install-card-dismissed';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getMode(): InstallMode {
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  if (standalone || installed) return 'installed';
  if (deferred) return 'prompt';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'none';
}

export function useInstallMode() {
  return useSyncExternalStore(subscribe, getMode, () => 'none' as InstallMode);
}

/** True when there is something to offer: the install dialog or the steps for this phone. */
export const canInstall = (mode: InstallMode) => mode === 'prompt' || mode === 'ios' || mode === 'android';

async function openDialog() {
  if (!deferred) return;
  const event = deferred;
  await event.prompt();
  await event.userChoice;
  deferred = null;
  emit();
}

/** Opens the browser's install dialog, or the card with the steps where there is no dialog. */
export function startInstall() {
  if (deferred) return openDialog();
  helpAsked = true;
  emit();
}

const HELP = {
  ios: 'In Safari, tap the Share button, then Add to Home Screen. MeetDoConnect opens from your home screen like an app.',
  android:
    'In Chrome, tap the ⋮ menu at the top right, then Install app (or Add to Home screen). MeetDoConnect opens from your home screen like an app.',
} as const;

export default function InstallButton() {
  const mode = useInstallMode();
  const [showHelp, setShowHelp] = useState(false);

  if (!canInstall(mode)) return null;
  const style = 'justify-self-start ring-1 ring-line';
  const label = mode === 'ios' ? 'Add to Home Screen' : 'Install the app';

  if (mode === 'prompt') {
    return (
      <div className="grid">
        <Button variant="quiet" onClick={openDialog} className={style}>
          {label}
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Button variant="quiet" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)} className={style}>
        {label}
      </Button>
      {showHelp && (
        <p role="status" className="max-w-prose text-sm text-muted">
          {HELP[mode as keyof typeof HELP]}
        </p>
      )}
    </div>
  );
}

// Card state: hidden after "Not now" for this visit (sessionStorage, so a new visit shows it again),
// unless the menu asked for the steps.
type CardState = 'hidden' | 'shown' | 'help';
function getCardState(): CardState {
  if (helpAsked) return 'help';
  try {
    if (sessionStorage.getItem(DISMISS_KEY)) return 'hidden';
  } catch {
    // Storage blocked: show the card; "Not now" still hides it until the next page load.
  }
  return 'shown';
}

// Waits a moment after the page opens so the card doesn't land on top of the first thing people read.
const CARD_DELAY_MS = 2500;
// Pages where the card would get in the way: the ones without the tab bar, plus Reminders, which has its own button.
const CARD_HIDDEN = [...HIDDEN, '/reminders'];

export function InstallCard() {
  const mode = useInstallMode();
  const card = useSyncExternalStore(subscribe, getCardState, () => 'hidden' as CardState);
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const [ready, setReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // The home hero's "Find something to do" button sits where the card goes at every screen size,
  // so on that page the card waits until the button has scrolled away. Holds the path it was seen on.
  const [heroCtaOn, setHeroCtaOn] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), CARD_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const cta = document.querySelector('.hero-cta');
    if (!cta) return;
    const observer = new IntersectionObserver(([entry]) => setHeroCtaOn(entry.isIntersecting ? pathname : null));
    observer.observe(cta);
    return () => observer.disconnect();
  }, [pathname]);

  const help = showHelp || card === 'help';
  const blocked = heroCtaOn === pathname || CARD_HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!canInstall(mode) || card === 'hidden' || (card === 'shown' && (!ready || blocked))) return null;

  const dismiss = () => {
    helpAsked = false;
    setShowHelp(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage blocked: hidden until the next page load only.
    }
    emit();
  };

  return (
    <aside className="install-card" aria-label="Install MeetDoConnect">
      <img src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className="install-card-copy">
        <strong>{mode === 'ios' ? 'Add MeetDoConnect to your Home Screen' : 'Install the MeetDoConnect app'}</strong>
        <p aria-live="polite">
          {help && mode !== 'prompt'
            ? HELP[mode as keyof typeof HELP]
            : 'Opens like an app, one tap away when your next session starts.'}
        </p>
      </div>
      <div className="install-card-actions">
        {mode === 'prompt' ? (
          <button type="button" className="install-card-go" onClick={openDialog}>
            Install
          </button>
        ) : (
          !help && (
            <button type="button" className="install-card-go" onClick={() => setShowHelp(true)}>
              Show me how
            </button>
          )
        )}
        <button type="button" className="install-card-later" onClick={dismiss}>
          {help && mode !== 'prompt' ? 'Got it' : 'Not now'}
        </button>
      </div>
    </aside>
  );
}
