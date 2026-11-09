// Blanks the client fills in before launch (with a lawyer for terms and privacy).
// The live build shows them as [BRACKETS]; the Vercel preview (DEMO=1) shows sample values so the pages read whole.
import { isDemo } from './site';

export { isDemo };

export const ph = (label: string, sample: string): string => (isDemo ? sample : `[${label}]`);

// The real inbox (Cloudflare Email Routing forwards it to Kelly's Gmail). Also the Contact us link in the footer
// and the account menu.
export const EMAIL = 'hello@meetdoconnect.com';
export const UPDATED = ph('DATE', 'October 24, 2026');
export const LLC = ph('LEGAL NAME OF LLC', 'MeetDoConnect LLC');
