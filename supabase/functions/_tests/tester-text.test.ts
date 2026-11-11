// node supabase/functions/_tests/tester-text.test.ts
import assert from 'node:assert/strict';
import { testDay, testerText } from '../_shared/tester-text.ts';

const item = {
  id: 't1',
  first_name: 'Ana',
  email: 'ana@example.test',
  code: 'WELCOME7',
  starts: '2026-11-23',
  ends: '2026-11-29',
  contact_email: 'hello@meetdoconnect.com',
};

// A calendar date never moves a day, whatever the server's clock zone.
assert.equal(testDay('2026-11-23'), 'Monday, November 23');
assert.equal(testDay('2026-11-29'), 'Sunday, November 29');

const mail = testerText(item, 'https://meetdoconnect.com/');
assert.equal(mail.subject, 'Your free week at MeetDoConnect starts Monday, November 23');
assert.ok(
  mail.text.startsWith(
    'Hi Ana,\n\nWelcome to the MeetDoConnect test. Your free week runs Monday, November 23 to Sunday, November 29.',
  ),
);
assert.ok(mail.text.includes('Your code: WELCOME7'));
assert.ok(mail.text.includes('1. Go to https://meetdoconnect.com and create your account.'));
assert.ok(mail.text.includes('by Sunday, November 29 to earn your second free week'));
assert.ok(mail.text.includes('write to hello@meetdoconnect.com'));
assert.ok(mail.text.endsWith('Kelly\nMeetDoConnect'));
assert.ok(mail.html.includes('Your code: <strong>WELCOME7</strong>'));
assert.ok(mail.html.includes('<a href="https://meetdoconnect.com">https://meetdoconnect.com</a>'));
assert.ok(mail.html.includes('<ol><li>'));

// Names typed on the public form are escaped; no name falls back to "Hi,".
const evil = testerText({ ...item, first_name: '<img src=x>' }, 'https://x.test');
assert.ok(!evil.html.includes('<img'));
assert.ok(evil.html.startsWith('<p>Hi &lt;img src=x&gt;,</p>'));
assert.ok(testerText({ ...item, first_name: '  ' }, 'https://x.test').text.startsWith('Hi,\n'));
assert.ok(
  testerText({ ...item, contact_email: null }, 'https://x.test').text.includes('write to hello@meetdoconnect.com'),
);

console.log('tester-text: ok');
