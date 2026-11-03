// Checks the day-picker helper without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { nextDay } from '../lib/date-range.ts';

assert.equal(nextDay('2026-11-03'), '2026-11-04');
assert.equal(nextDay('2026-11-30'), '2026-12-01');
assert.equal(nextDay('2026-12-31'), '2027-01-01');
assert.equal(nextDay('2028-02-28'), '2028-02-29'); // leap year
console.log('date range checks: ok');
