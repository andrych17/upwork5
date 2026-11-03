// How full a monthly limit is (admin Usage page). A limit of 0 means "no limit set", so nothing to warn about.
export type Tone = 'none' | 'good' | 'warn' | 'bad';

export function level(used: number, limit: number): { pct: number; tone: Tone; label: string } {
  if (limit <= 0) return { pct: 0, tone: 'none', label: 'No limit set' };
  const pct = Math.floor((used / limit) * 100); // floor: 9,999 of 10,000 must not read as "over"
  if (pct >= 100) return { pct, tone: 'bad', label: 'Over the limit' };
  if (pct >= 80) return { pct, tone: 'warn', label: 'Getting close' };
  return { pct, tone: 'good', label: 'Fine' };
}
