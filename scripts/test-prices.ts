// Checks the plan price parsing without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { DEFAULT_PLANS, parsePlans, usd } from '../lib/prices.ts';

// Nothing or nonsense keeps the defaults.
assert.deepEqual(parsePlans(null), DEFAULT_PLANS);
assert.deepEqual(parsePlans({ individual: { monthly_cents: 'free', credits: -3 }, extras: 'x' }), DEFAULT_PLANS);

// Saved prices replace the defaults, in dollars, and the Household size reaches the text.
const set = parsePlans({
  individual: { monthly_cents: 2900, annual_cents: 29000, credits: 12 },
  household: { monthly_cents: 3490, annual_cents: 34900, credits: 20, people: 5 },
  extras: [
    { amount: 1, cents: 500 },
    { amount: 5, cents: 1700 },
  ],
});
assert.equal(set.plans.individual.monthly, 29);
assert.equal(set.plans.individual.credits, 12);
assert.equal(set.plans.household.monthly, 34.9);
assert.equal(set.plans.household.people, 'Up to 5 people');
assert.equal(set.plans.household.name, 'Household');
assert.deepEqual(
  set.extras.map((e) => [e.amount, e.price]),
  [
    [1, 5],
    [5, 17],
  ],
);

// A missing pack keeps its default price.
assert.equal(parsePlans({ extras: [{ amount: 5, cents: 1700 }] }).extras[0]?.price, 4);

assert.equal(usd(26), '$26');
assert.equal(usd(34.9), '$34.90');
console.log('price checks: ok');
