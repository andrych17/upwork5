// node supabase/functions/_tests/reminder-text.test.ts
import assert from 'node:assert/strict';
import { dayWord, reminderText } from '../_shared/reminder-text.ts';

const tz = 'America/Chicago';
// Saturday 7 Nov 2026, 10:00 am CST
const start = '2026-11-07T16:00:00Z';
const base = {
  booking_id: 'b1',
  first_name: 'Sam',
  title: 'Quiet Co-Work',
  prep: 'Bring the task you want to finish.',
  starts_at: start,
};

const day = reminderText({ ...base, kind: '24h' }, tz, 'https://meetdoconnect.com/', new Date('2026-11-06T17:00:00Z'));
assert.equal(day.title, 'Tomorrow: Quiet Co-Work at 10:00 am CST');
assert.equal(day.body, 'Bring the task you want to finish. Tap to see your session.');
assert.equal(day.url, '/sessions');
assert.equal(day.tag, 'reminder-b1-24h');
assert.match(day.text, /https:\/\/meetdoconnect\.com\/sessions/);

const hour = reminderText(
  { ...base, kind: '1h', prep: null },
  tz,
  'https://meetdoconnect.com',
  new Date('2026-11-07T15:00:00Z'),
);
assert.equal(hour.title, 'Quiet Co-Work starts in 1 hour');
assert.equal(hour.body, 'The room opens at 9:50 am. Tap to check your camera and mic.');
assert.equal(hour.url, '/camera-check');
assert.equal(
  hour.sms,
  'MeetDoConnect: Quiet Co-Work starts in 1 hour (10:00 am CST). Room opens 9:50 am. https://meetdoconnect.com/camera-check Reply STOP to opt out.',
);

// Names and titles typed by people are escaped in the email.
const evil = reminderText(
  { ...base, kind: '24h', first_name: '<b>x</b>', title: 'A & "B"' },
  tz,
  'https://x.test',
  new Date('2026-11-06T17:00:00Z'),
);
assert.ok(!evil.html.includes('<b>x</b>'));
assert.ok(evil.html.includes('A &amp; &quot;B&quot;'));
assert.ok(evil.html.startsWith('<p>Hi &lt;b&gt;x&lt;/b&gt;,</p>'));

// Same calendar day in the club's zone says "today"; two days out says the weekday.
assert.equal(dayWord(new Date(start), new Date('2026-11-07T07:00:00Z'), tz), 'today');
assert.equal(dayWord(new Date(start), new Date('2026-11-05T16:00:00Z'), tz), 'Saturday');
// 11:30 pm Chicago on 6 Nov is still "tomorrow" for a 7 Nov session, even though UTC is already 7 Nov.
assert.equal(dayWord(new Date(start), new Date('2026-11-07T05:30:00Z'), tz), 'tomorrow');

console.log('reminder-text: ok');
