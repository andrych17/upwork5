// Checks the survey after each session (lib/feedback.ts): device, what is sent, and the spreadsheet: npm test
import assert from 'node:assert/strict';
import {
  csvCell,
  detectDevice,
  EMPTY_ANSWERS,
  feedbackCsv,
  feedbackPayload,
  type FeedbackRow,
} from '../lib/feedback.ts';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

assert.equal(detectDevice(ANDROID, true), 'android_app');
assert.equal(detectDevice(IPHONE, true), 'apple_app');
assert.equal(detectDevice(IPAD, true), 'apple_app'); // iPadOS says Macintosh
assert.equal(detectDevice(ANDROID, false), 'website'); // the browser, not the installed app
assert.equal(detectDevice(IPHONE, false), 'website');
assert.equal(detectDevice(WINDOWS, true), 'website'); // installed on a computer: still the website

const S = '00000000-0000-4000-8000-000000000001';
const full = { ...EMPTY_ANSWERS, join_ease: 4, av: 'yes' as const, roles: 5, comfort: 5 };

assert.equal(feedbackPayload(S, 'website', EMPTY_ANSWERS).ok, false);
assert.equal(feedbackPayload(S, 'website', { ...full, roles: null }).ok, false);
assert.equal(feedbackPayload(S, 'website', { ...full, join_ease: 6 }).ok, false);

const sent = feedbackPayload(S, 'apple_app', full);
assert.ok(sent.ok);
assert.deepEqual(sent.payload, {
  session_id: S,
  device: 'apple_app',
  join_ease: 4,
  av: 'yes',
  av_note: null,
  roles: 5,
  comfort: 5,
  comfort_note: null,
  confusing: null,
});

// Typed in a box, then the answer changed so the box hid: the hidden text is not sent.
const changed = feedbackPayload(S, 'website', { ...full, av_note: 'Echo', comfort_note: 'Loud room' });
assert.ok(changed.ok);
assert.equal(changed.payload.av_note, null);
assert.equal(changed.payload.comfort_note, null);

const notes = feedbackPayload(S, 'website', {
  ...full,
  av: 'mostly',
  av_note: '  Sound cut out once ',
  comfort: 3,
  comfort_note: ' ',
  confusing: ' The timer ',
});
assert.ok(notes.ok);
assert.equal(notes.payload.av_note, 'Sound cut out once');
assert.equal(notes.payload.comfort_note, null);
assert.equal(notes.payload.confusing, 'The timer');
assert.equal(feedbackPayload(S, 'website', { ...full, confusing: 'x'.repeat(1001) }).ok, false);

// Spreadsheet: quotes, commas, line breaks, and comments that look like formulas.
assert.equal(csvCell('plain'), 'plain');
assert.equal(csvCell('a, "b"'), '"a, ""b"""');
assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
assert.equal(csvCell('-1'), "'-1");
assert.equal(csvCell('@me'), "'@me");
assert.equal(csvCell(5), '5');
assert.equal(csvCell(null), '');

const row: FeedbackRow = {
  id: 'r1',
  device: 'android_app',
  join_ease: 2,
  av: 'no',
  av_note: 'No sound\nat all',
  roles: 4,
  comfort: 3,
  comfort_note: null,
  confusing: '+ the timer',
  created_at: '2026-11-23T01:00:00Z',
  updated_at: '2026-11-23T01:05:00Z',
  profiles: { first_name: 'Fern', last_name: 'Ng', email: 'fern@example.com' },
  sessions: { title: 'Quiet Co-Work', starts_at: '2026-11-23T00:00:00Z' },
};
const csv = feedbackCsv([row], (iso) => iso.slice(0, 16));
const lines = csv.split('\r\n');
assert.ok(csv.startsWith('﻿Sent,Member,Email,Session,'));
assert.equal(
  lines[1] + '\r\n' + lines[2],
  '2026-11-23T01:05,Fern Ng,fern@example.com,Quiet Co-Work,2026-11-23T00:00,Android app,2,No,"No sound\nat all",4,3,,\'+ the timer\r\n',
);
console.log('feedback checks: ok');
