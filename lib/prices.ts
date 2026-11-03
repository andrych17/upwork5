// Membership and extra-session prices in US dollars. These are the defaults shown until the real ones load: the
// admin sets prices in Settings, the database charges from plan_price_cents() and extras_price_cents(), and
// get_plans() (supabase/schema.sql, section 29) hands the same numbers to the pages (lib/use-plans.ts).
export type Tier = 'individual' | 'household';
export type Interval = 'monthly' | 'annual';

export const PLANS: Record<Tier, { name: string; monthly: number; annual: number; credits: number; people: string }> = {
  individual: { name: 'Solo', monthly: 26, annual: 260, credits: 13, people: '1 person' },
  household: { name: 'Household', monthly: 34, annual: 349, credits: 16, people: 'Up to 4 people' },
};

export const EXTRAS = [
  { amount: 1, price: 4, label: 'A little more room' },
  { amount: 5, price: 15, label: 'Keep a few handy' },
] as const;

export const planPrice = (tier: Tier, interval: Interval) => PLANS[tier][interval];

/** 2600 -> "$26.00" */
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export interface Extra {
  amount: number;
  price: number;
  label: string;
}

export interface PlanSet {
  plans: typeof PLANS;
  extras: readonly Extra[];
}

export const DEFAULT_PLANS: PlanSet = { plans: PLANS, extras: EXTRAS };

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** The get_plans() answer as a PlanSet. Anything missing or invalid keeps its default. */
export function parsePlans(raw: unknown): PlanSet {
  const r = rec(raw);
  const plans: typeof PLANS = { individual: { ...PLANS.individual }, household: { ...PLANS.household } };
  for (const tier of ['individual', 'household'] as const) {
    const p = rec(r[tier]);
    const monthly = num(p.monthly_cents);
    const annual = num(p.annual_cents);
    const credits = num(p.credits);
    if (monthly !== null) plans[tier].monthly = monthly / 100;
    if (annual !== null) plans[tier].annual = annual / 100;
    if (credits !== null) plans[tier].credits = credits;
  }
  const people = num(rec(r.household).people);
  if (people !== null && people >= 1) plans.household.people = `Up to ${people} people`;
  const listed = Array.isArray(r.extras) ? r.extras.map(rec) : [];
  const extras = EXTRAS.map((e) => {
    const cents = num(listed.find((x) => x.amount === e.amount)?.cents);
    return cents === null ? e : { ...e, price: cents / 100 };
  });
  return { plans, extras };
}

/** 26 -> "$26", 34.9 -> "$34.90" */
export const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
