// Builds the Supabase Auth emails (sign-up code, password reset) in the same frame as the site's other emails.
// Run: node scripts/auth-emails.ts
// Then paste each file into Supabase Dashboard > Authentication > Emails (Confirm signup, Reset password), with
// the subjects from supabase/config.toml. The {{ .Token }} and {{ .ConfirmationURL }} parts are filled in by Supabase.
import { writeFileSync } from 'node:fs';
import { CODE_STYLE, NOTE_STYLE, emailButton, emailFrame } from '../supabase/functions/_shared/email-layout.ts';

const SITE = 'https://meetdoconnect.com';

const confirmation = emailFrame({
  site: SITE,
  preheader: 'Your MeetDoConnect code: {{ .Token }}',
  body: [
    '<p style="margin:16px 0 8px;font-size:22px;font-weight:800">Confirm your email</p>',
    '<p>Welcome to MeetDoConnect. Enter this code on the sign-up page to confirm your email:</p>',
    `<p style="${CODE_STYLE}">{{ .Token }}</p>`,
    `<p style="${NOTE_STYLE};margin-bottom:16px">The code works for one hour. If you didn’t sign up, you can ignore this email.</p>`,
  ].join('\n'),
});

const recovery = emailFrame({
  site: SITE,
  preheader: 'Choose a new password for your MeetDoConnect account.',
  body: [
    '<p style="margin:16px 0 8px;font-size:22px;font-weight:800">Reset your password</p>',
    '<p>Someone asked to reset the password for this MeetDoConnect account. Use the button to choose a new one.</p>',
    // emailButton only escapes & < > " ', so the {{ .ConfirmationURL }} tag reaches Supabase unchanged.
    emailButton('{{ .ConfirmationURL }}', 'Choose a new password'),
    `<p style="${NOTE_STYLE};margin-bottom:16px">The link works once, for one hour. If you didn’t ask for this, ignore this email and your password stays the same.</p>`,
  ].join('\n'),
});

for (const [name, html] of [
  ['confirmation', confirmation],
  ['recovery', recovery],
] as const) {
  const path = new URL(`../supabase/templates/${name}.html`, import.meta.url);
  writeFileSync(path, `${html}\n`);
  console.log(`wrote supabase/templates/${name}.html (${html.length} chars)`);
}
