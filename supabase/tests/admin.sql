-- Checks for section 21 of schema.sql (admin management). Run through tests/run.sh after features.sql.
\o /dev/null
\set A2 '00000000-0000-0000-0000-00000000ac01'
\set U1 '00000000-0000-0000-0000-00000000ac02'
\set U2 '00000000-0000-0000-0000-00000000ac03'
\set HO '00000000-0000-0000-0000-00000000ac04'
\set HM '00000000-0000-0000-0000-00000000ac05'
\set S1 '00000000-0000-0000-0000-00000000ad01'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'A2', 'boss@example.com', '{"first_name": "Bo"}'),
  (:'U1', 'u1@example.com', '{"first_name": "Uma"}'),
  (:'U2', 'u2@example.com', '{"first_name": "Ugo"}'),
  (:'HO', 'ho@example.com', '{"first_name": "Hal", "tier": "household"}');
update profiles set is_admin = true where id = :'A2';
update profiles set monthly_credits = 5, addon_credits = 1 where id = :'U1';
insert into auth.users (id, email) values (:'HM', 'hm@example.com');
update profiles set household_owner_id = :'HO' where id = :'HM';
insert into auth.sessions (user_id) values (:'U1'), (:'U1');
insert into sessions (id, title, slug, starts_at, capacity) values
  (:'S1', 'Admin Test Room', 'admin-test-room', now() + interval '5 days', 12);

-- Members cannot use any admin function
select set_config('request.jwt.claim.sub', :'U2', false);
set role authenticated;
select t(admin_update_member(:'U1', 'household', 'monthly', 'active')->>'success' = 'false', 'member cannot change plans');
select t(admin_set_admin(:'U2', true)->>'success' = 'false', 'member cannot make themselves admin');
select t(admin_set_disabled(:'U1', true, 'x')->>'success' = 'false', 'member cannot turn others off');
select t(admin_update_config('{"cancel_hours": 1}')->>'success' = 'false', 'member cannot change settings');
select t(admin_save_session(null, 'X', null, null, null, now() + interval '1 day', 60, 12, true)->>'success' = 'false',
  'member cannot create sessions');
select t((select count(*) from admin_log) = 0, 'members cannot read the admin log');
do $$ begin
  perform admin_release_bookings(array[]::uuid[], true, 'x');
  raise exception 'FAIL: admin_release_bookings is callable by members';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Bookings to cancel later
select set_config('request.jwt.claim.sub', :'U1', false);
set role authenticated;
select t((book_session(:'S1')->>'success')::boolean, 'u1 books the admin test room');
reset role;
select t((select monthly_credits from profiles where id = :'U1') = 4, 'booking used one monthly credit');

select set_config('request.jwt.claim.sub', :'A2', false);
set role authenticated;

-- Plan and status
select t(admin_update_member(:'U1', 'household', 'annual', 'active')->>'success' = 'true', 'admin changes the plan');
select t((select tier = 'household' and billing_interval = 'annual' from profiles where id = :'U1'), 'plan saved');
select t(admin_update_member(:'U1', 'gold', 'annual', 'active')->>'error' = 'Unknown plan or status.', 'unknown tier refused');
select t(admin_update_member(:'HM', 'individual', 'monthly', 'active')->>'error' like '%account holder%',
  'household people are changed on the holder');
select t(admin_update_member(:'HO', 'individual', 'monthly', 'active')->>'error' like 'Remove the other Household%',
  'holder with people cannot switch to Solo');
select t(admin_update_member(:'U2', 'individual', 'monthly', 'past_due')->>'success' = 'true', 'mark past due');
select t((select payment_status = 'past_due' and payment_failed_at is not null and monthly_credits = 0
          from profiles where id = :'U2'), 'past due works like a failed payment');
select t(admin_update_member(:'U2', 'individual', 'monthly', 'active')->>'success' = 'true', 'mark active again');
select t((select payment_status = 'active' and payment_failed_at is null from profiles where id = :'U2'),
  'active clears the failed payment');

-- Admin access
select t(admin_set_admin(:'A2', false)->>'error' like 'You cannot change your own%', 'admin cannot remove themselves');
select t(admin_set_admin(:'U2', true)->>'success' = 'true', 'admin grants admin');
select t((select is_admin from profiles where id = :'U2'), 'u2 is now admin');
select t(admin_set_admin(:'U2', false)->>'success' = 'true', 'admin removes admin');

-- Cancel a booking for a member
select id as b1 from bookings where user_id = :'U1' and session_id = :'S1' and status = 'confirmed' \gset
select t(admin_cancel_booking(:'b1', true, '')->>'error' like 'Add a short reason%', 'cancel needs a reason');
select t((admin_cancel_booking(:'b1', true, 'Host is sick')->>'refunded')::boolean, 'admin cancels with refund');
select t(admin_cancel_booking(:'b1', true, 'again')->>'success' = 'false', 'a cancelled booking cannot be cancelled twice');
reset role;
select t((select status from bookings where id = :'b1') = 'cancelled', 'booking is cancelled');
select t((select monthly_credits from profiles where id = :'U1') = 5, 'the credit came back');

-- Turn a member off and on
select set_config('request.jwt.claim.sub', :'U1', false);
set role authenticated;
select t((book_session(:'S1')->>'success')::boolean, 'u1 books again');
reset role;
select set_config('request.jwt.claim.sub', :'A2', false);
set role authenticated;
select t(admin_set_disabled(:'A2', true, 'x')->>'error' like 'You cannot turn off your own%', 'admin cannot turn themselves off');
select t(admin_set_disabled(:'U1', true, '')->>'error' like 'Add a short reason%', 'turning off needs a reason');
select t((admin_set_disabled(:'U1', true, 'Spam')->>'bookings_cancelled')::int = 1, 'turning off cancels future bookings');
reset role;
select t((select banned_until = 'infinity' from auth.users where id = :'U1'), 'sign-in is blocked');
select t((select count(*) from auth.sessions where user_id = :'U1') = 0, 'every device is signed out');
select t((select disabled_at is not null and monthly_credits = 5 from profiles where id = :'U1'), 'marked off, credit returned');
select set_config('request.jwt.claim.sub', :'A2', false);
set role authenticated;
select t(admin_set_disabled(:'U1', false, null)->>'success' = 'true', 'turn back on');
reset role;
select t((select banned_until is null from auth.users where id = :'U1'), 'sign-in works again');

-- Sessions
select set_config('request.jwt.claim.sub', :'A2', false);
set role authenticated;
select t(admin_save_session(null, '', null, null, null, now() + interval '1 day', 60, 12, true)->>'error' like 'Title is required%',
  'title is required');
select t(admin_save_session(null, 'Big', null, null, null, now() + interval '1 day', 60, 13, true)->>'error' like 'Seats must be 1 to 12%',
  'at most 12 seats');
select admin_save_session(null, 'Sketch & Sip', 'Bring paper', null, null, '2026-12-01 18:00Z', 60, 8, false) as s2 \gset
select t((:'s2'::jsonb->>'success')::boolean, 'admin creates a session');
select t((select slug = 'sketch-sip-20261201-1800' and host = 'Kelly C.' and not published
          from sessions where id = (:'s2'::jsonb->>'id')::uuid), 'slug from title and time, default host, unpublished');
select t(admin_save_session(null, 'Sketch & Sip', null, null, null, '2026-12-01 18:00Z', 60, 8, false)->>'error' like 'A session with this title%',
  'duplicate title and time refused');
select t((admin_save_session((:'s2'::jsonb->>'id')::uuid, 'Sketch & Sip', null, 'Elena R.', null, '2026-12-01 19:00Z', 90, 6, true)->>'success')::boolean,
  'admin edits a session');
select t((select host = 'Elena R.' and minutes = 90 and capacity = 6 and published
          from sessions where id = (:'s2'::jsonb->>'id')::uuid), 'edit saved');
select t(admin_delete_session(:'S1')->>'error' like 'This session has bookings%', 'booked sessions cannot be deleted');
select t((admin_delete_session((:'s2'::jsonb->>'id')::uuid)->>'success')::boolean, 'an unbooked session can be deleted');

-- Settings
select t(admin_update_config('{"nope": 1}')->>'error' = 'Unknown setting: nope', 'unknown settings refused');
select t(admin_update_config('{"cancel_hours": "12"}')->>'error' = 'A setting has the wrong type.', 'wrong type refused');
select t(admin_update_config('{"cancel_hours": 500}')->>'error' = 'A setting is out of range.', 'out of range refused');
select t(admin_update_config('{"sms_kinds": ["2h"]}')->>'error' = 'A setting is out of range.', 'unknown SMS kind refused');
select t((admin_update_config('{"cancel_hours": 12, "max_weekly_sessions": null, "sms_kinds": ["24h", "1h"], "require_hello_video": false}')->>'success')::boolean,
  'admin saves settings');
reset role;
select t((select cancel_hours = 12 and max_weekly_sessions is null and sms_kinds = '{1h,24h}' from app_config), 'settings saved');

select t((select count(*) from admin_log where admin_id = :'A2') >= 10, 'admin changes are logged');
select t((select count(*) from admin_log where action = 'member_disabled' and details->>'reason' = 'Spam') = 1,
  'turning off is logged with the reason');

-- Google sign-up: names come from given_name/family_name or full_name
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'g1@example.com', '{"given_name": "Ana", "family_name": "Diaz", "full_name": "Ana Diaz"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'g2@example.com', '{"full_name": "Lee Ann Park"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'g3@example.com', '{}');
select t((select first_name = 'Ana' and last_name = 'Diaz' from profiles where email = 'g1@example.com'), 'google given/family name');
select t((select first_name = 'Lee' and last_name = 'Ann Park' from profiles where email = 'g2@example.com'), 'google full name split');
select t((select first_name = 'Member' and last_name = '' from profiles where email = 'g3@example.com'), 'no name falls back to Member');
