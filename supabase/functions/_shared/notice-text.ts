// Words for the emails about the Hello Video and held bookings. Pure functions, same style as reminder-text.ts.
import { escapeHtml } from './reminder-text.ts';

export type NoticeKind = 'hello_approved' | 'hello_redo' | 'hello_declined' | 'hold_released';

export interface NoticeItem {
  id: string;
  kind: NoticeKind;
  /** The team's note (redo, declined) or the session title (hold_released) */
  note: string | null;
  first_name: string | null;
  email: string | null;
  /** Bookings still waiting for the video to be approved */
  held_count: number;
}

export interface NoticeText {
  subject: string;
  text: string;
  html: string;
}

export function noticeText(item: NoticeItem, siteUrl: string): NoticeText {
  const site = siteUrl.replace(/\/+$/, '');
  const note = (item.note ?? '').trim();
  let subject: string;
  let lines: string[];
  let link: string;
  let linkLabel: string;

  switch (item.kind) {
    case 'hello_approved':
      subject = 'Your Hello Video is approved';
      lines = [
        'Thanks for saying hello. Your Hello Video is approved and the video itself was deleted.',
        item.held_count > 0
          ? 'The sessions you booked while you waited are now confirmed.'
          : 'You can book sessions any time.',
      ];
      link = `${site}/sessions`;
      linkLabel = 'See your sessions';
      break;
    case 'hello_redo':
      subject = 'Please record your Hello Video again';
      lines = [
        'Thanks for sending your Hello Video. We could not use this one, so please record a new one.',
        ...(note ? [`Note from the team: ${note}`] : []),
        ...(item.held_count > 0 ? ['The sessions you booked stay held while you do.'] : []),
      ];
      link = `${site}/hello-video`;
      linkLabel = 'Record a new Hello Video';
      break;
    case 'hello_declined':
      subject = 'We could not approve your Hello Video';
      lines = [
        'We could not approve your Hello Video, so this membership cannot book sessions.',
        ...(note ? [`Note from the team: ${note}`] : []),
        'The sessions you booked were released and the credits went back. Any payment for this membership will be refunded. Reply to this email if you have questions.',
      ];
      link = site;
      linkLabel = 'MeetDoConnect';
      break;
    case 'hold_released':
      subject = `${note || 'Your booking'} was released`;
      lines = [
        `Your Hello Video was not approved in time, so we released your seat in ${note || 'the session'} and the credit went back to your plan.`,
        'Once your video is approved you can book again.',
      ];
      link = `${site}/calendar`;
      linkLabel = 'See the calendar';
      break;
  }

  const greeting = item.first_name?.trim() ? `Hi ${item.first_name.trim()},` : 'Hi,';
  const text = [greeting, '', ...lines.flatMap((line) => [line, '']), `${linkLabel}: ${link}`].join('\n');
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') +
    `<p><a href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a></p>`;
  return { subject, text, html };
}
