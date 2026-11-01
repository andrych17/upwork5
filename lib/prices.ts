// Membership and extra-session prices in US dollars. The database charges from plan_price_cents() and
// extras_price_cents() in supabase/schema.sql (section 23); keep both the same.
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
