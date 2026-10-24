import type { Metadata } from 'next';
import JsonLd from '@/components/json-ld';
import SlowChess from '@/components/slow-chess';
import { Eyebrow, Lead } from '@/components/ui';
import { SITE_URL, metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/slow-chess');

const HOW_IT_WORKS = [
  'Tap a piece, then tap where it goes. Dots show legal moves.',
  'After your move, copy the link and send it. Your opponent opens it, sees your move and plays theirs.',
  'The whole game lives in the link, so nothing is stored on a server. Your games on this device are also saved in this browser.',
  'All the rules are in: castling, en passant, promotion, check, checkmate, stalemate, the 50-move rule and repetition.',
  'Want automatic invites and a "your move" reminder? That comes with member accounts, which are not built yet.',
];

export default function SlowChessPage() {
  return (
    <>
      <main
        id="main"
        className="grid items-start gap-[clamp(28px,4vw,48px)] pt-[clamp(24px,6vw,64px)] lg:grid-cols-[5fr_7fr] lg:gap-x-14"
      >
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Slow Chess',
            url: `${SITE_URL}/slow-chess`,
            applicationCategory: 'GameApplication',
            operatingSystem: 'Any',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          }}
        />
        <header className="grid content-start gap-4 lg:sticky lg:top-(--sticky-top)">
          <Eyebrow>Take your time · Free</Eyebrow>
          <h1 className="text-[clamp(3rem,9vw,6rem)] leading-[0.92] tracking-[-0.05em]">Slow Chess</h1>
          <Lead>
            Play a friend over hours or days. Make your move, send them the link, and walk away. Whoever opens the
            newest link plays next.
          </Lead>
          <details className="mt-2 border-y border-line">
            <summary className="py-3.5 font-bold">How it works</summary>
            <ul className="list-disc pb-4 pl-5 text-muted">
              {HOW_IT_WORKS.map((line) => (
                <li key={line} className="my-1">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        </header>
        <SlowChess />
      </main>
      <p className="mt-[clamp(48px,8vw,96px)] max-w-prose text-sm text-muted">
        Slow Chess is an original MeetDoConnect game. Piece symbols come from your device&apos;s fonts.
      </p>
    </>
  );
}
