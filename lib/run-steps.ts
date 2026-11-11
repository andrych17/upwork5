// The live room's "What we're doing now" guide: a prep card's run text ("5 min: Say hello. 45 min: ... Last 10 min:
// ...") as timed steps. "Last N min" is counted back from the end of the session.

export interface RunStep {
  last: boolean;
  minutes: number;
  text: string;
  /** minutes after the start */
  start: number;
}

// A step starts at "N min:" or "Last N min:" where N is a whole number (not the "0" inside "50"), and runs to the
// next step or the end of the text.
const STEP = /(Last\s+)?(?<!\d)(\d+)\s*min:\s*([\s\S]*?)(?=\s*(?:Last\s+)?(?<!\d)\d+\s*min:|\s*$)/gi;

export function runSteps(run: string | undefined, total: number): RunStep[] {
  const parsed = [...(run ?? '').matchAll(STEP)]
    .map((m) => ({ last: Boolean(m[1]), minutes: Number(m[2]), text: m[3].trim() }))
    .filter((s) => s.text);
  let at = 0;
  return parsed.map((s) => {
    const start = s.last ? total - s.minutes : at;
    at = start + s.minutes;
    return { ...s, start };
  });
}
