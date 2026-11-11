// The free-week code email for people who joined the test on /testers (schema section 37). Kelly's 10 Nov text,
// with her placeholders filled in. Pure function, same style as notice-text.ts.
import { CHIP_STYLE, emailButton, escapeHtml } from './email-layout.ts';

export interface TesterItem {
  id: string;
  first_name: string | null;
  email: string | null;
  code: string;
  /** Test week, 'YYYY-MM-DD' */
  starts: string;
  ends: string;
  /** Where replies go (app_config.contact_email) */
  contact_email: string | null;
}

export interface TesterText {
  subject: string;
  text: string;
  html: string;
}

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** '2026-11-23' -> 'Monday, November 23' (a calendar date, so no time zone shift). */
export function testDay(date: string): string {
  return DAY.format(new Date(`${date}T12:00:00Z`));
}

type Block = { p: string } | { h: string } | { ol: string[] } | { ul: string[] };

export function testerText(item: TesterItem, siteUrl: string): TesterText {
  const site = siteUrl.replace(/\/+$/, '');
  const starts = testDay(item.starts);
  const ends = testDay(item.ends);
  const support = item.contact_email?.trim() || 'hello@meetdoconnect.com';
  const name = item.first_name?.trim();

  const blocks: Block[] = [
    { p: name ? `Hi ${name},` : 'Hi,' },
    { p: `Welcome to the MeetDoConnect test. Your free week runs ${starts} to ${ends}.` },
    { p: `Your code: ${item.code}` },
    { h: 'How to get started' },
    {
      ol: [
        `Go to ${site} and create your account.`,
        'Add your profile photo and record your private Hello Video (30 to 60 seconds).',
        'Enter your code at checkout. You won’t be charged during your test week.',
        'Open the calendar and book 3 to 4 sessions. Each session has a prep card that tells you what to have on hand.',
      ],
    },
    { h: 'What to expect' },
    {
      ul: [
        'Each session is 60 minutes with 2 to 12 people.',
        'There are three rotating roles, a Starter, a Timekeeper and a Closer, and on-screen prompts keep the room warm and on time. You may be chosen by the site to be in any role. No one is in charge, so you don’t need to prepare.',
        'Please keep your camera on, unless you use a Bad Hair Day card.',
        'You’ll get a reminder 24 hours and 1 hour before each session if you opt in through the app.',
      ],
    },
    {
      p: `After each session, please fill out the 2-minute feedback form that opens when you leave the room. Complete 3 to 4 sessions and feedback forms by ${ends} to earn your second free week when we open.`,
    },
    {
      p: `If anything goes wrong, like sign-in, video or booking, reply to this email or write to ${support} and we’ll fix it quickly.`,
    },
    { p: 'Thank you for helping shape this.' },
    { p: 'Kelly\nMeetDoConnect' },
  ];

  const text = blocks
    .map((b) =>
      'p' in b
        ? b.p
        : 'h' in b
          ? b.h
          : 'ol' in b
            ? b.ol.map((line, i) => `${i + 1}. ${line}`).join('\n')
            : b.ul.map((line) => `- ${line}`).join('\n'),
    )
    .join('\n\n');

  const html = blocks
    .map((b) => {
      if ('p' in b) return `<p>${escapeHtml(b.p).replace(/\n/g, '<br>')}</p>`;
      if ('h' in b) return `<p><strong>${escapeHtml(b.h)}</strong></p>`;
      const tag = 'ol' in b ? 'ol' : 'ul';
      const lines = 'ol' in b ? b.ol : b.ul;
      const list = `<${tag}>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</${tag}>`;
      // The steps end with the button for step 1 (email only; the plain text already has the address).
      return 'ol' in b ? list + emailButton(`${site}/signup`, 'Create your account') : list;
    })
    .join('')
    // The code and the site address stand out in the email.
    .replace(
      `<p>${escapeHtml(`Your code: ${item.code}`)}</p>`,
      `<p style="${CHIP_STYLE};font-size:20px">Your code: <strong>${escapeHtml(item.code)}</strong></p>`,
    )
    .replace(escapeHtml(`Go to ${site} `), `Go to <a href="${escapeHtml(site)}">${escapeHtml(site)}</a> `);

  return { subject: `Your free week at MeetDoConnect starts ${starts}`, text, html };
}
