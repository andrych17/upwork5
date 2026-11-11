// The frame every MeetDoConnect email shares: the logo, a card with the site's black outline, one yellow button,
// and a small footer. send-reminders wraps the reminder, Hello Video and tester emails in it, and
// scripts/auth-emails.ts builds the Supabase sign-up and password emails (supabase/templates/) from it.
// Tables and inline styles only, because Gmail and Outlook drop <style> blocks and most CSS layout. The logo is a
// PNG on the site (public/email/logo.png, made by local/gp-check/make-email-logo.py): email apps don't show SVG
// or web fonts. No imports, so it runs in Deno (Edge Functions) and Node (scripts, tests).

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

const FONT = "'DM Sans', Arial, Helvetica, sans-serif";
const INK = '#171717';
const MUTED = '#55524c';
const CREAM = '#f5f0e7';
const PAPER = '#fffdf7';
const SUN = '#ffcf46';

/** The logo PNG is 990 x 176; shown at 180 px wide. */
const LOGO_WIDTH = 180;
const LOGO_HEIGHT = 32;

/** A yellow box with the black outline, for the line they must not miss (the tester code). */
export const CHIP_STYLE = `margin:16px 0;padding:12px 16px;background:${SUN};border:2px solid ${INK};border-radius:12px;text-align:center`;

/** The chip with a big code in it (the sign-up code). */
export const CODE_STYLE = `${CHIP_STYLE};font-size:28px;font-weight:800;letter-spacing:4px`;

/** Small grey text inside the card. */
export const NOTE_STYLE = `margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED}`;

export function emailButton(href: string, label: string): string {
  return (
    `<p style="margin:24px 0 16px"><a href="${escapeHtml(href)}" style="display:inline-block;background:${SUN};` +
    `color:${INK};border:2px solid ${INK};border-radius:999px;padding:12px 24px;font-family:${FONT};font-size:16px;` +
    `font-weight:700;text-decoration:none">${escapeHtml(label)}</a></p>`
  );
}

/** The line inbox lists show after the subject: the first line of the plain text that isn't the greeting. */
export function preheaderOf(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^Hi\b/.test(l));
  return (line ?? '').slice(0, 140);
}

export interface EmailFrame {
  /** The site address, e.g. https://meetdoconnect.com (a trailing slash is fine). */
  site: string;
  /** The card's HTML, already escaped. */
  body: string;
  /** Inbox preview text (plain). */
  preheader?: string;
  /** HTML under the card, already escaped, e.g. why they get the email. */
  footer?: string;
}

export function emailFrame({ site, body, preheader, footer }: EmailFrame): string {
  const home = escapeHtml(site.replace(/\/+$/, ''));
  const host = escapeHtml(site.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    '<title>MeetDoConnect</title></head>',
    `<body style="margin:0;padding:0;background:${CREAM}">`,
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>`
      : '',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM}">`,
    '<tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">',
    `<tr><td style="padding:0 4px 18px"><a href="${home}" style="text-decoration:none">`,
    `<img src="${home}/email/logo.png" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="MeetDoConnect" `,
    `style="display:block;border:0;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;font-family:${FONT};font-size:22px;font-weight:800;color:${INK}">`,
    '</a></td></tr>',
    `<tr><td style="background:${PAPER};border:2px solid ${INK};border-radius:16px;padding:12px 28px;`,
    `font-family:${FONT};font-size:16px;line-height:1.55;color:${INK}">`,
    body,
    '</td></tr>',
    `<tr><td style="padding:18px 4px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED}">`,
    footer ? `<p style="margin:0 0 8px">${footer}</p>` : '',
    `<p style="margin:0">MeetDoConnect &middot; <a href="${home}" style="color:${MUTED}">${host}</a></p>`,
    '</td></tr></table></td></tr></table></body></html>',
  ].join('\n');
}
