-- Checks for section 23 (checkout in test mode). Run through tests/run.sh after schedule.sql.
\o /dev/null
\set J1 '00000000-0000-0000-0000-0000000000c1'
\set J2 '00000000-0000-0000-0000-0000000000c2'
\set JM '00000000-0000-0000-0000-0000000000c3'
\set JA '00000000-0000-0000-0000-0000000000c4'
\set JS '00000000-0000-0000-0000-0000000000c5'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'J1', 'j1@example.com', '{"first_name": "Jo", "tier": "household", "billing_interval": "annual"}'),
  (:'J2', 'j2@example.com', '{"first_name": "Jay"}'),
  (:'JA', 'ja@example.com', '{"first_name": "Jade"}');
select paid(array[:'JA']::uuid[]);
update profiles set terms_accepted_at = now() where id in (:'J1', :'J2');
update profiles set is_admin = true where id = :'JA';
insert into sessions (id, title, slug, starts_at) values (:'JS', 'Pay Room', 'pay-room', now() + interval '3 days');

select t((select payment_status = 'pending' and monthly_credits = 0 and tier = 'household' and billing_interval = 'annual'
          from profiles where id = :'J1'), 'sign-up starts unpaid with the plan from the form');

select set_config('request.jwt.claim.sub', :'J1', false);
set role authenticated;
select t(book_session(:'JS')->>'error' = 'Finish checkout to start booking sessions.', 'unpaid members cannot book');
select t(test_buy_extras(1)->>'error' like 'Start your membership first%', 'no extras before checkout');
select t(test_checkout('household', 'weekly')->>'error' like 'Pick Solo or Household%', 'unknown billing refused');
reset role;
update profiles set terms_accepted_at = null where id = :'J1';
set role authenticated;
select t(test_checkout('household', 'monthly')->>'error' like 'Please accept the community rules%', 'terms come before checkout');
select t((accept_terms()->>'success')::boolean, 'accepting the terms');
select test_checkout('household', 'monthly') as c1 \gset
select t((:'c1'::jsonb->>'success')::boolean and (:'c1'::jsonb->>'amount_cents')::int = 3400, 'household checkout charges $34');
select t((select payment_status = 'active' and monthly_credits = 16 and billing_interval = 'monthly'
          from profiles where id = :'J1'), 'checkout activates the plan with its credits');
select t(test_checkout('household', 'monthly')->>'error' = 'Your membership is already active.', 'no double checkout');
select t((book_session(:'JS')->>'success')::boolean, 'paid members can book');
select test_buy_extras(5) as e1 \gset
select t((:'e1'::jsonb->>'amount_cents')::int = 1500 and (select addon_credits from profiles where id = :'J1') = 5,
  'five extra sessions for $15');
select t(test_buy_extras(3)->>'error' = 'Choose 1 or 5 extra sessions.', 'only packs of 1 or 5');
select t((select count(*) from payments) = 2, 'members see their own payments');
select t(invite_household_member('jm@example.com')->>'success' = 'true', 'holder invites someone');
reset role;

insert into auth.users (id, email, raw_user_meta_data) values (:'JM', 'jm@example.com', '{"first_name": "Jem"}');
select set_config('request.jwt.claim.sub', :'JM', false);
set role authenticated;
select t(test_checkout('individual', 'monthly')->>'error' like 'Your Household account holder pays%',
  'household people do not check out');
select t((test_buy_extras(1)->>'success')::boolean, 'household people can buy extras');
select t((select count(*) from payments) = 1, 'household people see only their own receipts');
reset role;
select t((select addon_credits from profiles where id = :'J1') = 6, 'their extras go to the shared pool');

select set_config('request.jwt.claim.sub', :'J2', false);
set role authenticated;
select t(admin_refund_payment((:'e1'::jsonb->>'payment_id')::uuid, 'test')->>'error' like 'Only an admin%',
  'members cannot refund');
reset role;

select set_config('request.jwt.claim.sub', :'JA', false);
set role authenticated;
select t(admin_refund_payment((:'e1'::jsonb->>'payment_id')::uuid, ' ')->>'error' = 'Add a reason for the refund.',
  'refund needs a reason');
select t((admin_refund_payment((:'e1'::jsonb->>'payment_id')::uuid, 'Changed mind')->>'extras_taken_back')::int = 5,
  'refunding extras takes back the unused ones');
select t((select addon_credits from profiles where id = :'J1') = 1, 'only the refunded pack is removed');
select t(admin_refund_payment((:'e1'::jsonb->>'payment_id')::uuid, 'again')->>'error' like '%already refunded%',
  'no double refund');
select t((select count(*) from admin_log where action = 'payment_refunded') = 1, 'refunds are logged');
select t((admin_update_member(:'J2', 'individual', 'monthly', 'active')->>'success')::boolean, 'admin can activate without payment');
reset role;
select t((select monthly_credits = 13 from profiles where id = :'J2'), 'activated by an admin gets the plan credits');

-- Past due pays and keeps its billing day; test mode off refuses
update profiles set billing_date = 9 where id = :'J1';
select mark_payment_failed(:'J1');
select set_config('request.jwt.claim.sub', :'J1', false);
set role authenticated;
select t((test_checkout('household', 'monthly')->>'success')::boolean, 'past due can pay');
reset role;
select t((select payment_status = 'active' and billing_date = 9 and monthly_credits = 16 from profiles where id = :'J1'),
  'paying a due membership keeps the billing day and gives the credits');
update app_config set test_payments = false;
select set_config('request.jwt.claim.sub', :'J1', false);
set role authenticated;
select t(test_buy_extras(1)->>'error' = 'Online payments are not open yet.', 'test payments off refuses');
reset role;
update app_config set test_payments = true;

-- Section 24: interests, cancel at period end, test renewals
\set JR '00000000-0000-0000-0000-0000000000c6'
insert into auth.users (id, email, raw_user_meta_data) values (:'JR', 'jr@example.com', '{"first_name": "Rae"}');
update profiles set terms_accepted_at = now() where id = :'JR';
select set_config('request.jwt.claim.sub', :'JR', false);
set role authenticated;
select t(cancel_membership(true)->>'error' like 'There is no running membership%', 'nothing to cancel before checkout');
select t((test_checkout('individual', 'monthly')->>'success')::boolean, 'solo checkout');
select t((select paid_until = (now() at time zone 'America/Chicago')::date + interval '1 month' from profiles where id = :'JR'),
  'checkout pays one month ahead');
select t((save_interests(array['Writing', ' Writing ', 'Crafts', ''])->'interests') = '["Crafts", "Writing"]'::jsonb,
  'interests are trimmed and de-duplicated');
select t(save_interests(array(select 'i' || g from generate_series(1, 21) g))->>'error' = 'Pick up to 20 interests.',
  'at most 20 interests');
select t((cancel_membership(true)->>'message') like 'Your membership ends on%', 'cancel at the end of the period');
select t((get_my_membership()->>'cancel_at_period_end')::boolean, 'membership shows the cancellation');
select t((cancel_membership(false)->>'success')::boolean, 'keep the membership');
select t(not (get_my_membership()->>'cancel_at_period_end')::boolean, 'membership no longer shows the cancellation');
reset role;

-- The paid period ends: renewed with a receipt
update profiles set paid_until = (now() at time zone 'America/Chicago')::date where id = :'JR';
select t(renew_test_memberships() >= 1, 'renewal job runs');
select t((select paid_until > (now() at time zone 'America/Chicago')::date from profiles where id = :'JR'), 'renewal moves the period on');
select t((select count(*) from payments where profile_id = :'JR' and description like '%renewal') = 1, 'renewal leaves a receipt');
-- Cancelled and the period ends: membership stops, no receipt
update profiles set paid_until = (now() at time zone 'America/Chicago')::date, cancel_at_period_end = true where id = :'JR';
select renew_test_memberships();
select t((select payment_status = 'canceled' and monthly_credits = 0 from profiles where id = :'JR'), 'cancelled membership ends');
select t((select count(*) from payments where profile_id = :'JR' and description like '%renewal') = 1, 'no receipt after cancelling');
select set_config('request.jwt.claim.sub', :'JR', false);
set role authenticated;
select t((test_checkout('individual', 'annual')->>'success')::boolean, 'ended membership can restart');
reset role;
select t((select paid_until = (now() at time zone 'America/Chicago')::date + interval '1 year' and payment_status = 'active'
          from profiles where id = :'JR'), 'annual restart pays a year ahead');
-- Test mode off: the job leaves everything to the payment processor
update app_config set test_payments = false;
update profiles set paid_until = (now() at time zone 'America/Chicago')::date where id = :'JR';
select t(renew_test_memberships() = 0, 'no test renewals once a processor is connected');
update app_config set test_payments = true;
