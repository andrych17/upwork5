// Checks the new-password rules without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { MIN_PASSWORD, passwordProblem } from '../lib/password.ts';

const ok = 'a-long-enough-one';
assert.equal(passwordProblem('old-password', ok, ok, true), '');
assert.equal(passwordProblem('', ok, ok, true), 'Enter your current password.');
assert.equal(passwordProblem('', ok, ok, false), ''); // after a reset link there is no current password
assert.match(
  passwordProblem('old-password', 'x'.repeat(MIN_PASSWORD - 1), 'x'.repeat(MIN_PASSWORD - 1), true),
  /at least 8/,
);
assert.equal(passwordProblem('old-password', 'x'.repeat(MIN_PASSWORD), 'x'.repeat(MIN_PASSWORD), true), '');
assert.equal(passwordProblem('old-password', ok, ok + '!', true), 'The two new passwords are not the same.');
assert.equal(passwordProblem(ok, ok, ok, true), 'Choose a password different from your current one.');
assert.equal(passwordProblem(ok, ok, ok, false), ''); // same text is fine when no current password was asked
console.log('password checks: ok');
