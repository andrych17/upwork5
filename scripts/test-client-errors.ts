// Checks how browser errors are turned into one line for Admin > Activity log > App errors: npm test
import assert from 'node:assert/strict';
import { errorText } from '../lib/client-errors.ts';

assert.equal(errorText('Room is full'), 'Room is full');
assert.equal(errorText(''), '(no message)');
assert.equal(errorText(new Error('boom')), 'boom');
assert.equal(errorText(new DOMException('Permission denied', 'NotAllowedError')), 'NotAllowedError: Permission denied');
// Daily fatal error and non-fatal error events
assert.equal(
  errorText({ action: 'error', errorMsg: 'Meeting has ended', error: { type: 'exp-room', msg: 'Meeting has ended' } }),
  'Meeting has ended · exp-room',
);
assert.equal(
  errorText({ action: 'nonfatal-error', type: 'input-settings-error', errorMsg: 'bad device' }),
  'bad device · input-settings-error',
);
assert.equal(errorText({ code: 42 }), '{"code":42}');
assert.equal(errorText(null), 'null');
console.log('client error checks: ok');
