// Blanks the client fills in before launch (with a lawyer for terms and privacy).
// The live build shows them as [BRACKETS]; the Vercel preview (DEMO=1) shows sample values so the pages read whole.
export const isDemo = process.env.DEMO === '1';
export const ph = (label, sample) => (isDemo ? sample : `[${label}]`);

export const EMAIL = ph('EMAIL', 'hello@example.com');
export const UPDATED = ph('DATE', 'October 24, 2026');
export const LLC = ph('LEGAL NAME OF LLC', 'MeetDoConnect LLC');
