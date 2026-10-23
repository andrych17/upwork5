import JsonLd from '../json-ld';
import { SITE_URL, pageMeta } from '../site';
import WordRush from './word-rush';
import './game.css';

export const metadata = pageMeta('/widgets-while-you-wait');

export default function Widgets() {
  return (
    <>
      <main id="main" className="game">
        <JsonLd data={{
          '@type': 'WebApplication',
          name: 'Word Rush',
          url: `${SITE_URL}/widgets-while-you-wait`,
          applicationCategory: 'GameApplication',
          operatingSystem: 'Any',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }} />
        <header className="intro">
          <span className="eyebrow">Widgets While You Wait · Free</span>
          <h1>Word Rush</h1>
          <p className="lead">Build words from your seven tiles as fast as you can. You score the moment you play, so nobody waits on anybody. Most points when the clock runs out wins.</p>
          <details className="how">
            <summary>How to play</summary>
            <ul>
              <li>You get 7 tiles. Tap tiles (or type the letters) to spell a word, then press Play word or Enter.</li>
              <li>A valid word scores its tile values plus a bonus for longer words, and you draw new tiles right away.</li>
              <li>There is no turn order. Play whenever you have a word. Each word scores once per game.</li>
              <li>Stuck? Trade any tiles for new ones, at a cost of 2 points per trade.</li>
              <li>Race the House if you want an opponent that plays the same deal. Most points when time runs out wins.</li>
              <li>Rare letters (J, X, K, Q, Z) are worth the most. Words of 4 or more letters earn a bonus.</li>
            </ul>
          </details>
        </header>
        <WordRush />
      </main>

      <p className="credit small muted">Word list: Hunspell en_US dictionary (SCOWL, by Kevin Atkinson and contributors). Some valid words may be missing, and Word Rush is an original game, not affiliated with any commercial word game.</p>
    </>
  );
}
