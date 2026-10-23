import type { Metadata } from 'next';
import JsonLd from '@/components/json-ld';
import { Eyebrow, Lead } from '@/components/ui';
import WordRush from '@/components/word-rush';
import { SITE_URL, metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/widgets-while-you-wait');

const HOW_TO = [
  'You get 7 tiles. Tap tiles (or type the letters) to spell a word, then press Play word or Enter.',
  'A valid word scores its tile values plus a bonus for longer words, and you draw new tiles right away.',
  'There is no turn order. Play whenever you have a word. Each word scores once per game.',
  'Stuck? Trade any tiles for new ones, at a cost of 2 points per trade.',
  'Race the House if you want an opponent that plays the same deal. Most points when time runs out wins.',
  'Rare letters (J, X, K, Q, Z) are worth the most. Words of 4 or more letters earn a bonus.',
];

export default function Widgets() {
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
            name: 'Word Rush',
            url: `${SITE_URL}/widgets-while-you-wait`,
            applicationCategory: 'GameApplication',
            operatingSystem: 'Any',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          }}
        />
        <header className="grid content-start gap-4 lg:sticky lg:top-(--sticky-top)">
          <Eyebrow>Widgets While You Wait · Free</Eyebrow>
          <h1 className="text-[clamp(3rem,9vw,6rem)] leading-[0.92] tracking-[-0.05em]">Word Rush</h1>
          <Lead>
            Build words from your seven tiles as fast as you can. You score the moment you play, so nobody waits on
            anybody. Most points when the clock runs out wins.
          </Lead>
          <details className="mt-2 border-y border-line">
            <summary className="py-3.5 font-bold">How to play</summary>
            <ul className="list-disc pb-4 pl-5 text-muted">
              {HOW_TO.map((line) => (
                <li key={line} className="my-1">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        </header>
        <WordRush />
      </main>
      <p className="mt-[clamp(48px,8vw,96px)] max-w-prose text-sm text-muted">
        Word list: Hunspell en_US dictionary (SCOWL, by Kevin Atkinson and contributors). Some valid words may be
        missing, and Word Rush is an original game, not affiliated with any commercial word game.
      </p>
    </>
  );
}
