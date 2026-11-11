// node supabase/functions/_tests/email-layout.test.ts
import assert from 'node:assert/strict';
import { emailButton, emailFrame, escapeHtml, preheaderOf } from '../_shared/email-layout.ts';
import { noticeText } from '../_shared/notice-text.ts';
import { reminderText } from '../_shared/reminder-text.ts';
import { testerText } from '../_shared/tester-text.ts';

const site = 'https://meetdoconnect.com/';

// The frame: logo from the site, the card, the footer, the inbox preview.
const mail = emailFrame({ site, body: '<p>Card</p>', preheader: 'Soon <b>', footer: 'Why <a href="#">x</a>' });
assert.ok(mail.startsWith('<!doctype html>'));
assert.ok(
  mail.includes('<img src="https://meetdoconnect.com/email/logo.png" width="180" height="32" alt="MeetDoConnect"'),
);
assert.ok(mail.includes('<p>Card</p>'), 'the card goes in as is');
assert.ok(mail.includes('>Soon &lt;b&gt;</div>'), 'the preview is escaped');
assert.ok(mail.includes('Why <a href="#">x</a>'), 'the footer goes in as is');
assert.ok(mail.includes('>meetdoconnect.com</a>'));
assert.ok(!emailFrame({ site, body: '' }).includes('display:none'), 'no preview, no hidden div');

assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
const button = emailButton('https://x.test/?a=1&b="2"', 'Go <now>');
assert.ok(button.includes('href="https://x.test/?a=1&amp;b=&quot;2&quot;"'));
assert.ok(button.includes('>Go &lt;now&gt;</a>'));
assert.ok(
  emailButton('{{ .ConfirmationURL }}', 'Reset').includes('href="{{ .ConfirmationURL }}"'),
  'Supabase tag kept',
);

assert.equal(preheaderOf('Hi Ann,\n\nTomorrow: Trivia at 7 pm.\nmore'), 'Tomorrow: Trivia at 7 pm.');
assert.equal(preheaderOf('Hi,\n\n' + 'x'.repeat(200)).length, 140);
assert.equal(preheaderOf(''), '');

// The three senders use the button; the reminder keeps its footer out of the card.
const reminder = reminderText(
  { booking_id: 'b1', kind: '24h', first_name: 'Ann', title: 'Trivia', prep: null, starts_at: '2026-11-07T00:00:00Z' },
  'America/New_York',
  site,
  new Date('2026-11-06T17:00:00Z'),
);
assert.ok(
  reminder.html.includes('href="https://meetdoconnect.com/sessions"') && reminder.html.includes('See your session'),
);
assert.ok(!reminder.html.includes('Change reminders'));
assert.ok(reminder.footer.includes('href="https://meetdoconnect.com/reminders"'));

const notice = noticeText(
  { id: 'n1', kind: 'hello_redo', note: null, first_name: null, email: 'a@x.test', held_count: 0 },
  site,
);
assert.ok(
  notice.html.includes('href="https://meetdoconnect.com/hello-video"') && notice.html.includes('border-radius:999px'),
);

const tester = testerText(
  {
    id: 't1',
    first_name: 'Ann',
    email: 'a@x.test',
    code: 'WELCOME7',
    starts: '2026-11-23',
    ends: '2026-11-29',
    contact_email: null,
  },
  site,
);
assert.ok(
  tester.html.includes('href="https://meetdoconnect.com/signup"') && tester.html.includes('Create your account'),
);
assert.ok(tester.html.includes('background:#ffcf46') && tester.html.includes('Your code: <strong>WELCOME7</strong>'));
assert.ok(!tester.text.includes('/signup'), 'the plain text keeps Kelly’s words');

console.log('email-layout: ok');
