// Checks the admin Usage thresholds without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { level } from '../lib/usage-level.ts';

assert.deepEqual(level(0, 10000), { pct: 0, tone: 'good', label: 'Fine' });
assert.equal(level(7999, 10000).tone, 'good');
assert.equal(level(8000, 10000).tone, 'warn');
assert.equal(level(9999, 10000).tone, 'warn');
assert.equal(level(10000, 10000).tone, 'bad');
assert.equal(level(25000, 10000).pct, 250);
assert.deepEqual(level(500, 0), { pct: 0, tone: 'none', label: 'No limit set' });
console.log('usage checks: ok');
