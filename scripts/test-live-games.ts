// Kelly's 11 Nov live-room games (lib/live-games.ts): her Basic Rules word for word, and the page and the database
// agree on which session plays which game. The engines themselves are tested in supabase/functions/_tests: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_RULES, type GameKey, gameForSlug, PLAYABLE } from '../lib/live-games.ts';
import { prepCards } from '../lib/session-data.ts';

const FIXTURES: Record<GameKey, string> = {
  'invent-it': 'inventit-rules.txt',
  'guess-whose-story': 'guesswhosstory-rules.txt',
  'puzzle-room': 'puzzleroom-rules.txt',
  'draw-and-guess': 'drawandguess-rules.txt',
};

// Her files use straight quotes and sometimes two spaces; the site uses typographic apostrophes.
const plain = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

for (const game of PLAYABLE) {
  const r = GAME_RULES[game];
  assert.ok(r, `${game} has rules`);
  const lines = readFileSync(new URL(`./fixtures/${FIXTURES[game]}`, import.meta.url), 'utf8').split('\n');
  const under = (heading: string) => lines[lines.indexOf(heading) + 1];
  const start = lines.indexOf('THE RULES');
  const numbered = lines.slice(start + 1).filter((l) => /^\d+\. /.test(l));
  const after = lines.slice(start + 1).filter((l) => l.trim() && !/^\d+\. /.test(l));
  assert.equal(r.players, lines[1], `${game}: players line`);
  assert.equal(plain(r.object), plain(under('OBJECT OF THE GAME')), `${game}: object of the game`);
  assert.equal(plain(r.howToWin), plain(under('HOW TO WIN')), `${game}: how to win`);
  assert.deepEqual(
    r.rules.map(plain),
    numbered.map((l) => plain(l.replace(/^\d+\. /, ''))),
    `${game}: the numbered rules`,
  );
  assert.deepEqual(r.footer ? [plain(r.footer)] : [], after.map(plain), `${game}: the line after the rules`);
}

// game_for_slug() in schema.sql: the same patterns, so the room shows the game the server runs.
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const body = /function game_for_slug[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(schema)?.[1] ?? '';
const sql = [...body.matchAll(/when p_slug ~ '([^']+)' then '([^']+)'/g)].map(([, re, key]) => [new RegExp(re), key]);
assert.equal(sql.length, 4, 'four games in game_for_slug');
const sqlGame = (slug: string) => (sql.find(([re]) => (re as RegExp).test(slug))?.[1] as string) ?? null;
const slugs = [
  'invent-it',
  'invent-it-20261120-1900',
  'invent-items-20261120-1900',
  'guess-whose-story-20261121-1800',
  'guess-who-s-story-20261121-1800',
  'guess-whos-story',
  'puzzle-room-20261122-2000',
  'puzzle-rooms',
  'draw-and-guess-20261123-1700',
  'draw-guess-20261123-1700',
  'trivia-trivier-triviest-20261124-2000',
  'idea-lab',
  '',
];
for (const slug of slugs) assert.equal(gameForSlug(slug), sqlGame(slug), `same game for "${slug}"`);
assert.equal(gameForSlug('draw-guess-20261123-1700'), 'draw-and-guess', '"Draw & Guess" as an admin title');
assert.equal(gameForSlug('invent-items'), null, 'only whole words');
assert.equal(gameForSlug(null), null);

// Every game has a prep card whose slug is the game's own, so Admin > Sessions titles land on it.
for (const game of Object.keys(FIXTURES) as GameKey[])
  assert.equal(gameForSlug(prepCards.find((c) => c.slug === game)?.slug), game, `${game} has a prep card`);

console.log('live games: ok');
