// Checks where an unfinished sign-up resumes and when sign-in sends people back to it: npm test
import assert from 'node:assert/strict';
import { mustFinishSignup, resumeStep } from '../lib/signup-step.ts';

const done = {
  terms_accepted: true,
  role: 'individual',
  payment_status: 'active',
  hello_status: 'approved',
} as const;

assert.equal(resumeStep(null), 2);
assert.equal(resumeStep({ ...done, terms_accepted: false }), 2);
assert.equal(resumeStep({ ...done, payment_status: 'pending' }), 3);
assert.equal(resumeStep({ ...done, role: 'member', payment_status: 'pending' }), 5); // household member pays nothing
assert.equal(resumeStep({ ...done, hello_status: 'none' }), 4);
assert.equal(resumeStep(done), 5);

// The case from 6 Nov: confirmed by the email link, account exists, never got to the plan.
assert.equal(
  mustFinishSignup({ ...done, terms_accepted: false, payment_status: 'pending', hello_status: 'none' }),
  true,
);
assert.equal(mustFinishSignup({ ...done, payment_status: 'pending' }), true);
assert.equal(mustFinishSignup({ ...done, hello_status: 'none' }), false); // Hello Video left for later
assert.equal(mustFinishSignup(done), false);
assert.equal(mustFinishSignup(null), false); // lookup failed: keep the old behaviour (calendar)
console.log('signup checks: ok');
