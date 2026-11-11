// The live room's step guide reads every prep card's run text: npm test
import assert from 'node:assert/strict';
import { runSteps } from '../lib/run-steps.ts';
import { prepCards } from '../lib/session-data.ts';

const short = (run: string, total = 60) => runSteps(run, total).map((s) => [s.minutes, s.start, s.last, s.text]);

// Two-digit minutes stay whole (11 Nov: "50 min" came out as a 0-minute step).
assert.deepEqual(short('5 min: Introductions. 50 min: Play MeetDoConnect trivia. 5 min: Say goodbye.'), [
  [5, 0, false, 'Introductions.'],
  [50, 5, false, 'Play MeetDoConnect trivia.'],
  [5, 55, false, 'Say goodbye.'],
]);
// "Last 10 min" is counted back from the end.
assert.deepEqual(short('5 min: Say hello. 45 min: Silent work. Last 10 min: Check out.'), [
  [5, 0, false, 'Say hello.'],
  [45, 5, false, 'Silent work.'],
  [10, 50, true, 'Check out.'],
]);
assert.deepEqual(short(''), []);
assert.deepEqual(short('Just talk.'), []);

// Every catalog card: the minutes as written, steps one after another. (Botanical Sketch Night's steps add up to
// 75 minutes; the room just never reaches the last one. Flagged to Kelly 11 Nov.)
for (const card of prepCards) {
  const plan = runSteps(card.run, 60);
  const written = [...card.run.matchAll(/(?<!\d)(\d+)\s*min:/gi)].map((m) => Number(m[1]));
  assert.deepEqual(
    plan.map((s) => s.minutes),
    written,
    `${card.slug}: every step keeps its minutes`,
  );
  plan.forEach((s, i) => {
    assert.ok(s.minutes > 0 && s.text, `${card.slug}: ${s.text}`);
    if (i > 0 && !s.last) assert.equal(s.start, plan[i - 1].start + plan[i - 1].minutes, `${card.slug}: in order`);
  });
}

console.log('run steps: ok');
