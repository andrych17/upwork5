// Shared by the public /testers form and Admin > Testers. tester_join() (schema section 37) accepts these times.
export const TIME_ZONES = [
  ['America/New_York', 'Eastern (ET)'],
  ['America/Chicago', 'Central (CT)'],
  ['America/Denver', 'Mountain (MT)'],
  ['America/Phoenix', 'Arizona (MST)'],
  ['America/Los_Angeles', 'Pacific (PT)'],
  ['America/Anchorage', 'Alaska (AKT)'],
  ['Pacific/Honolulu', 'Hawaii (HT)'],
  ['Other', 'Outside the US'],
] as const;

export const TIMES = [
  ['weekday_mornings', 'Weekday mornings'],
  ['weekday_evenings', 'Weekday evenings'],
  ['weekend_mornings', 'Weekend mornings'],
  ['weekend_evenings', 'Weekend evenings'],
] as const;

const label = (list: readonly (readonly [string, string])[], key: string): string =>
  list.find(([k]) => k === key)?.[1] ?? key;

export const zoneLabel = (zone: string): string => label(TIME_ZONES, zone);
export const timeLabel = (time: string): string => label(TIMES, time);

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** A calendar date from the database: '2026-11-23' -> 'Monday, November 23', whatever the visitor's time zone. */
export const testDay = (date: string): string => DAY.format(new Date(`${date}T12:00:00Z`));
