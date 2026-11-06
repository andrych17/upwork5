-- Checks for sections 18-20 of schema.sql (Give credits, Hello Video, reminders) and the booking gate.
-- Run through tests/run.sh. Any failed check stops the run with "FAIL: ...".
\o /dev/null
\set A '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
\set H '00000000-0000-0000-0000-00000000000c'
\set M '00000000-0000-0000-0000-00000000000d'
\set N '00000000-0000-0000-0000-00000000000e'

create function t(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Sign-ups start unpaid (section 23). Most checks want people who have paid.
create function paid(ids uuid[]) returns void language sql as $$
  update profiles set payment_status = 'active', monthly_credits = plan_credits(tier),
         credits_cycle_start = (now() at time zone 'America/Chicago')::date
  where id = any(ids);
$$;

-- People: an admin, a Solo member, a Household holder with one invited member, and another Solo.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A', 'admin@example.com', '{"first_name": "Kelly"}'),
  (:'S', 'solo@example.com', '{"first_name": "Sam"}'),
  (:'H', 'owner@example.com', '{"first_name": "Hana", "tier": "household"}'),
  (:'N', 'other@example.com', '{"first_name": "Nico"}');
update profiles set is_admin = true where id = :'A';
select paid(array[:'A', :'S', :'H', :'N']::uuid[]);

select set_config('request.jwt.claim.sub', :'H', false);
set role authenticated;
select t((invite_household_member('member@example.com')->>'success')::boolean, 'owner invites a household member');
reset role;
insert into auth.users (id, email, raw_user_meta_data) values (:'M', 'member@example.com', '{"first_name": "Mia"}');
select t((select household_owner_id from profiles where id = :'M') = :'H', 'invited email joins the household');

-- 18. Give credits
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select t(admin_give_credits(:'S', 2, 'test')->>'error' = 'Only an admin can give credits.', 'members cannot give credits');
select t((select count(*) from credit_grants) = 0, 'members cannot read the grant log');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select t(admin_give_credits(:'M', 0, 'x')->>'error' = 'Give between 1 and 50 credits.', 'amount must be 1 to 50');
select t(admin_give_credits(:'M', 2, '  ')->>'error' like 'Add a short reason%', 'a reason is required');
select t((admin_give_credits(:'M', 3, 'Room froze on Tuesday')->>'shared')::boolean,
  'credits for a household member go to the account holder');
select t((select count(*) from credit_grants where for_profile_id = :'M' and profile_id = :'H' and granted_by = :'A') = 1,
  'the grant is logged with who and why');
reset role;
select t((select addon_credits from profiles where id = :'H') = 3, 'account holder has 3 extra credits');

-- 19. Hello Video (the Edge Function calls these with the service role)
set role service_role;
select hello_video_start(:'S', 'video/webm', 1000000, 45) as v1 \gset
select t((:'v1'::jsonb->>'success')::boolean and :'v1'::jsonb->>'key' like 'hello/' || :'S' || '/%.webm',
  'start gives a file name per person');
select hello_video_start(:'S', 'video/mp4', 2000000, 60) as v2 \gset
select t(:'v2'::jsonb->'replaced_keys' ? (:'v1'::jsonb->>'key'), 'recording again replaces the earlier try');
select t(hello_video_start(:'S', 'video/avi', 1, 45)->>'error' like '%unsupported%', 'other video types are refused');
select t(hello_video_start(:'S', 'video/webm', 1, 10)->>'error' like '%30 to 60%', 'under 30 seconds is refused');
select t(hello_video_start(:'S', 'video/webm', 1000000, 90)->>'error' like '%30 to 60%', 'over a minute is refused');
select t(hello_video_start(:'S', 'video/webm', 200000000, 60)->>'error' like '%too large%', 'over 100 MB is refused');
select t(hello_video_uploaded(:'S', (:'v1'::jsonb->>'id')::uuid, 1000)->>'error' like '%replaced%',
  'a replaced upload cannot be finished');
select t((hello_video_uploaded(:'S', (:'v2'::jsonb->>'id')::uuid, 1900000)->>'success')::boolean,
  'a finished upload waits for review');
select t((select hello_status from profiles where id = :'S') = 'pending', 'profile shows pending');
select t(jsonb_array_length(hello_video_queue()) = 1 and hello_video_queue()->0->>'name' = 'Sam',
  'the admin queue lists it with the name');
select t(hello_video_review(:'S', (:'v2'::jsonb->>'id')::uuid, true)->>'error' like 'Only an admin%', 'only admins review');
select t(hello_video_review(:'A', (:'v2'::jsonb->>'id')::uuid, true)->>'status' = 'approved', 'admin approves');
select t(hello_video_review(:'A', (:'v2'::jsonb->>'id')::uuid, false)->>'error' like '%already reviewed%',
  'a video is reviewed once');
select t((select hello_status from profiles where id = :'S') = 'approved', 'profile shows approved');
select t(jsonb_array_length(hello_video_queue()) = 0, 'the queue is empty again');
select t(hello_video_start(:'S', 'video/webm', 1000, 45)->>'error' like '%already approved%', 'no new video after approval');
reset role;

select set_config('request.jwt.claim.sub', :'N', false);
set role authenticated;
do $$ begin
  perform hello_video_start(auth.uid(), 'video/webm', 1000, 40);
  raise exception 'FAIL: members called hello_video_start';
exception when insufficient_privilege then raise notice 'ok: members cannot call hello_video_start directly';
end $$;
do $$ begin
  perform claim_due_reminders();
  raise exception 'FAIL: members claimed reminders';
exception when insufficient_privilege then raise notice 'ok: members cannot claim reminders';
end $$;
select t((select count(*) from hello_videos) = 0, 'members cannot see other people''s videos');
reset role;

-- Booking gate (off by default)
insert into sessions (id, title, slug, starts_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Quiet Co-Work', 'quiet-co-work', now() + interval '3 days');
update app_config set require_hello_video = true;
select set_config('request.jwt.claim.sub', :'N', false);
set role authenticated;
select t(book_session('00000000-0000-0000-0000-0000000000a1')->>'error' like 'Record your Hello Video%',
  'gate on: no approved video, no booking');
reset role;
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select t((book_session('00000000-0000-0000-0000-0000000000a1')->>'success')::boolean, 'gate on: approved video can book');
reset role;
update app_config set require_hello_video = false;
select set_config('request.jwt.claim.sub', :'N', false);
set role authenticated;
select t((book_session('00000000-0000-0000-0000-0000000000a1')->>'success')::boolean, 'gate off: anyone active can book');
reset role;

-- 19b. Held bookings: book before the video is approved (hello_hold_bookings)
\set P '00000000-0000-0000-0000-00000000000f'
\set Q '00000000-0000-0000-0000-000000000010'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'P', 'held@example.com', '{"first_name": "Pia"}'),
  (:'Q', 'held2@example.com', '{"first_name": "Quinn"}');
select paid(array[:'P', :'Q']::uuid[]);
insert into sessions (id, title, slug, starts_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'Hold Far', 'hold-far', now() + interval '3 days'),
  ('00000000-0000-0000-0000-0000000000c2', 'Hold Soon', 'hold-soon', now() + interval '40 minutes'),
  ('00000000-0000-0000-0000-0000000000c3', 'Hold Later', 'hold-later', now() + interval '4 days');
select monthly_credits as p0 from profiles where id = :'P' \gset
update app_config set require_hello_video = true;

select set_config('request.jwt.claim.sub', :'P', false);
set role authenticated;
select t(book_session('00000000-0000-0000-0000-0000000000c1')->>'error' like 'Record your Hello Video%',
  'hold off: still no booking without an approved video');
reset role;
update app_config set hello_hold_bookings = true;
set role authenticated;
select t((book_session('00000000-0000-0000-0000-0000000000c1')->>'held')::boolean, 'hold on: booking before approval is held');
select t((book_session('00000000-0000-0000-0000-0000000000c2')->>'held')::boolean, 'a second held booking');
reset role;
select t((select monthly_credits from profiles where id = :'P') = :p0 - 2, 'held bookings take a credit each');
select t((select count(*) from bookings where session_id = '00000000-0000-0000-0000-0000000000c2' and status = 'confirmed') = 1,
  'a held booking keeps the seat');

set role service_role;
select t(release_unapproved_holds() = 1, 'only the session starting within an hour is released');
reset role;
select t((select status from bookings where session_id = '00000000-0000-0000-0000-0000000000c2' and user_id = :'P') = 'cancelled'
  and (select release_reason from bookings where session_id = '00000000-0000-0000-0000-0000000000c2' and user_id = :'P') like '%in time',
  'the late hold is cancelled with a reason');
select t((select monthly_credits from profiles where id = :'P') = :p0 - 1, 'its credit comes back');

-- declined: every held booking is released and the person cannot book or record again
set role service_role;
select hello_video_start(:'P', 'video/webm', 1000000, 45) as pv \gset
select hello_video_uploaded(:'P', (:'pv'::jsonb->>'id')::uuid, 1000000);
select hello_video_review(:'A', (:'pv'::jsonb->>'id')::uuid, false, 'Not suitable', true) as pr \gset
select t(:'pr'::jsonb->>'status' = 'declined' and (:'pr'::jsonb->>'released')::int = 1, 'declining releases the held booking');
reset role;
select t((select monthly_credits from profiles where id = :'P') = :p0, 'all credits are back after a decline');
select t((select count(*) from bookings where user_id = :'P' and status = 'confirmed') = 0, 'nothing stays booked');
select set_config('request.jwt.claim.sub', :'P', false);
set role authenticated;
select t(book_session('00000000-0000-0000-0000-0000000000c3')->>'error' like '%was not approved%', 'declined people cannot book');
reset role;
set role service_role;
select t(hello_video_start(:'P', 'video/webm', 1000000, 45)->>'error' like '%not approved%', 'declined people cannot record again');
reset role;

-- asked to record again keeps the hold, approval makes it a normal booking
select set_config('request.jwt.claim.sub', :'Q', false);
set role authenticated;
select t((book_session('00000000-0000-0000-0000-0000000000c3')->>'held')::boolean, 'Quinn books while waiting');
reset role;
set role service_role;
select hello_video_start(:'Q', 'video/webm', 1000000, 45) as q1 \gset
select hello_video_uploaded(:'Q', (:'q1'::jsonb->>'id')::uuid, 1000000);
select t(hello_video_review(:'A', (:'q1'::jsonb->>'id')::uuid, false, 'Too dark')->>'status' = 'rejected', 'asked to record again');
select t((select held from bookings where user_id = :'Q' and status = 'confirmed'), 'the booking stays held meanwhile');
select hello_video_start(:'Q', 'video/webm', 1000000, 45) as q2 \gset
select hello_video_uploaded(:'Q', (:'q2'::jsonb->>'id')::uuid, 1000000);
select t(hello_video_review(:'A', (:'q2'::jsonb->>'id')::uuid, true)->>'status' = 'approved', 'second video approved');
reset role;
select t((select not held from bookings where user_id = :'Q' and status = 'confirmed'), 'approval turns the hold into a normal booking');

update app_config set require_hello_video = false, hello_hold_bookings = false;

-- 19c. Emails queued by the Hello Video steps and by released holds
set role service_role;
select claim_member_notices() as n1 \gset
select t(jsonb_array_length(:'n1'::jsonb) = 5, 'five notices were queued so far');
select t((select count(*) from jsonb_array_elements(:'n1'::jsonb) i where i->>'kind' = 'hello_approved') = 2
  and (select count(*) from jsonb_array_elements(:'n1'::jsonb) i where i->>'kind' = 'hold_released' and i->>'note' = 'Hold Soon') = 1
  and (select count(*) from jsonb_array_elements(:'n1'::jsonb) i where i->>'kind' = 'hello_declined') = 1
  and (select count(*) from jsonb_array_elements(:'n1'::jsonb) i where i->>'kind' = 'hello_redo' and i->>'note' = 'Too dark') = 1,
  'approved, redo, declined and released-hold notices all exist');
select t((select count(*) from jsonb_array_elements(:'n1'::jsonb) i where i->>'email' = 'held@example.com') = 2,
  'a declined release sends one declined notice plus the earlier late-release notice, not one per booking');
select t(jsonb_array_length(claim_member_notices()) = 0, 'a second claim returns nothing');
select t(record_notice_results(jsonb_build_array(jsonb_build_object(
    'id', :'n1'::jsonb->0->>'id', 'email_sent', true, 'error', null))) = 1, 'results are recorded');
reset role;

-- Refund list
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select t(hello_declined_list()->>'error' like 'Only an admin%', 'members cannot see the refund list');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select t(jsonb_array_length(hello_declined_list()->'items') = 1
  and hello_declined_list()->'items'->0->>'name' = 'Pia'
  and hello_declined_list()->'items'->0->>'refunded_at' is null, 'the declined person is on the list');
select t((hello_mark_refunded(:'P')->>'success')::boolean, 'marked as refunded');
select t(hello_declined_list()->'items'->0->>'refunded_at' is not null, 'the list shows the refund');
select t(hello_mark_refunded(:'Q')->>'error' like '%not declined%', 'only declined people can be marked');
reset role;

-- Kelly 6 Nov: "Contact us" goes to the admin email, and a declined person can be let back in to record again
update app_config set contact_email = 'hello@meetdoconnect.com' where id = 1;
set role service_role;
select t(hello_video_start(:'P', 'video/webm', 1000000, 45)->>'error'
         = 'Your Hello Video was not approved. Please contact us at hello@meetdoconnect.com.', 'the decline message gives the email');
reset role;
select set_config('request.jwt.claim.sub', :'P', false);
set role authenticated;
select t(get_my_membership()->>'contact_email' = 'hello@meetdoconnect.com', 'the membership page gets the email');
select t(hello_video_reopen(:'P')->>'error' = 'Only an admin can do this.', 'members cannot reopen their own video');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select t(hello_video_reopen(:'Q')->>'error' = 'This person was not declined.', 'only declined people can be let back in');
select t((hello_video_reopen(:'P', '  Faces were not visible, please sit near a light.  ')->>'success')::boolean,
         'admin lets the declined person record again');
select t(jsonb_array_length(hello_declined_list()->'items') = 0, 'they leave the refund list');
reset role;
select t((select hello_status = 'rejected' and hello_refunded_at is null from profiles where id = :'P'),
         'back to "record again", refund mark cleared');
select t((select reject_reason from hello_videos where user_id = :'P' order by created_at desc limit 1)
         = 'Faces were not visible, please sit near a light.', 'their video page shows the new note');
select t(exists (select 1 from member_notices where user_id = :'P' and kind = 'hello_redo'
                 and note = 'Faces were not visible, please sit near a light.' and claimed_at is null),
         'an email asking for a new video is queued');
select t(exists (select 1 from admin_log where profile_id = :'P' and action = 'hello_reopened'), 'the reopen is logged');
set role service_role;
select t(hello_video_start(:'P', 'video/webm', 1000000, 45) ? 'id', 'they can record again');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select t(admin_update_config('{"contact_email": "not an email"}')->>'error' = 'Check the contact email address.',
         'a bad contact email is refused');
select t(admin_update_config('{"contact_email": 5}')->>'error' = 'A setting has the wrong type.', 'contact email must be text');
select t((admin_update_config('{"contact_email": " "}')->>'success')::boolean, 'an empty contact email is saved');
select t((select contact_email from app_config where id = 1) is null, 'an empty contact email turns the link off');
reset role;
set role service_role;
update profiles set hello_status = 'declined' where id = :'P';
select t(hello_video_start(:'P', 'video/webm', 1000000, 45)->>'error' = 'Your Hello Video was not approved. Please contact us.',
         'no email set, no address in the message');
update profiles set hello_status = 'none' where id = :'P';
reset role;

-- Kelly 6 Nov: a screen name from the sign-up form is what other members see
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'nick@example.com', '{"first_name": "Katherine", "screen_name": "  Kat   C  "}'),
  ('00000000-0000-0000-0000-0000000005a2', 'long@example.com', '{"first_name": "Lou", "screen_name": "x"}'),
  ('00000000-0000-0000-0000-0000000005a3', 'ctrl@example.com', '{"first_name": "Ola", "screen_name": "Bad\u0007name"}');
select t((select screen_name from profiles where id = '00000000-0000-0000-0000-0000000005a1') = 'Kat C',
         'screen name saved with spaces tidied');
select t((select screen_name is null from profiles where id = '00000000-0000-0000-0000-0000000005a2')
         and (select screen_name is null from profiles where id = '00000000-0000-0000-0000-0000000005a3'),
         'too short or odd screen names are dropped, sign-up still works');
select t((select public_name(p) from profiles p where id = '00000000-0000-0000-0000-0000000005a1') = 'Kat C'
         and (select public_name(p) from profiles p where id = '00000000-0000-0000-0000-0000000005a2') = 'Lou',
         'others see the screen name, or the first name without one');
select t(not exists (select 1 from profiles where screen_name is not null and screen_name <> btrim(screen_name)),
         'no screen name has stray spaces');

-- Weekly limit counted for the whole Household (default) or per person
-- extra credits can go past the weekly limit, so the holder has none left for this check
update profiles set addon_credits = 0 where id = :'H';
update app_config set max_weekly_sessions = 2;
insert into sessions (id, title, slug, starts_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'Week One', 'week-one', date_trunc('week', now()) + interval '9 days 12 hours'),
  ('00000000-0000-0000-0000-0000000000d2', 'Week Two', 'week-two', date_trunc('week', now()) + interval '10 days 12 hours'),
  ('00000000-0000-0000-0000-0000000000d3', 'Week Three', 'week-three', date_trunc('week', now()) + interval '11 days 12 hours');
select set_config('request.jwt.claim.sub', :'H', false);
set role authenticated;
select t((book_session('00000000-0000-0000-0000-0000000000d1')->>'success')::boolean
  and (book_session('00000000-0000-0000-0000-0000000000d2')->>'success')::boolean, 'the account holder books two sessions in a week');
reset role;
select set_config('request.jwt.claim.sub', :'M', false);
set role authenticated;
select t(book_session('00000000-0000-0000-0000-0000000000d3')->>'error' like 'Your household has booked 2 sessions%',
  'household scope: the member shares the holder''s two sessions');
select t((get_my_membership()->>'week_limit_shared')::boolean, 'the member is told the limit is shared');
reset role;
update app_config set weekly_limit_scope = 'person';
set role authenticated;
select t((book_session('00000000-0000-0000-0000-0000000000d3')->'credit_type')::text = '"monthly"', 'person scope: the member has their own two');
reset role;
update app_config set weekly_limit_scope = 'household', max_weekly_sessions = 4;

-- 20. Reminders
insert into sessions (id, title, slug, starts_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'Tomorrow Session', 'tomorrow', now() + interval '23 hours 50 minutes'),
  ('00000000-0000-0000-0000-0000000000b2', 'Soon Session', 'soon', now() + interval '50 minutes'),
  ('00000000-0000-0000-0000-0000000000b3', 'Late Booking', 'late', now() + interval '20 hours'),
  ('00000000-0000-0000-0000-0000000000b4', 'Far Session', 'far', now() + interval '30 hours');
insert into bookings (session_id, user_id, charged_to, created_at, status) values
  ('00000000-0000-0000-0000-0000000000b1', :'S', :'S', now() - interval '2 days', 'confirmed'),
  ('00000000-0000-0000-0000-0000000000b2', :'S', :'S', now() - interval '2 days', 'confirmed'),
  -- booked inside the 24 hours: no 24h reminder, and the 1h one is not due yet
  ('00000000-0000-0000-0000-0000000000b3', :'S', :'S', now(), 'confirmed'),
  ('00000000-0000-0000-0000-0000000000b4', :'S', :'S', now() - interval '2 days', 'confirmed'),
  ('00000000-0000-0000-0000-0000000000b2', :'N', :'N', now() - interval '2 days', 'cancelled');
-- a held booking gets no reminders (it cannot join), so the count of two reminders below must not change
insert into bookings (session_id, user_id, charged_to, created_at, status, held) values
  ('00000000-0000-0000-0000-0000000000b1', :'N', :'N', now() - interval '2 days', 'confirmed', true);

select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select t((save_push_subscription('https://fcm.googleapis.com/fcm/send/abc123', repeat('A', 87), repeat('b', 22), 'Test')->>'success')::boolean,
  'a Chrome device can subscribe');
select t(save_push_subscription('https://evil.example.com/hook', repeat('A', 87), repeat('b', 22))->>'error' like '%not supported%',
  'unknown push hosts are refused');
select t((select count(*) from push_subscriptions) = 1, 'the member sees their one device');
select t(set_reminder_prefs(true, true, null)->>'error' like 'Add a phone%', 'text reminders need a number');
select t(set_reminder_prefs(true, true, '555-1234')->>'error' like '%country code%', 'the number needs a country code');
select t((set_reminder_prefs(true, true, '+1 (555) 123-4567')->>'success')::boolean, 'text reminders on');
select t((select phone from profiles where id = auth.uid()) = '+15551234567', 'the number is stored as +15551234567');
select t(get_my_membership()->'reminders'->>'phone' = '+15551234567' and get_my_membership()->>'hello_status' = 'approved',
  'membership summary shows reminders and Hello Video');
reset role;

set role service_role;
select claim_due_reminders() as c1 \gset
select t(jsonb_array_length(:'c1'::jsonb->'items') = 2, 'two reminders due: 24h for tomorrow, 1h for soon');
select t((select count(*) from jsonb_array_elements(:'c1'::jsonb->'items') i
          where i->>'kind' = '24h' and i->>'slug' = 'tomorrow' and i->>'phone' is null and jsonb_array_length(i->'push') = 1) = 1,
  '24h reminder: push and email, no SMS by default');
select t((select count(*) from jsonb_array_elements(:'c1'::jsonb->'items') i
          where i->>'kind' = '1h' and i->>'slug' = 'soon' and i->>'phone' = '+15551234567' and i->>'email' = 'solo@example.com') = 1,
  '1h reminder: includes the opted-in phone');
select t(:'c1'::jsonb->>'tz' = 'America/Chicago', 'the time zone comes along');
select t(jsonb_array_length(claim_due_reminders()->'items') = 0, 'a second run sends nothing again');
select t(record_reminder_results(jsonb_build_array(jsonb_build_object(
    'booking_id', :'c1'::jsonb->'items'->0->>'booking_id', 'kind', :'c1'::jsonb->'items'->0->>'kind',
    'push_sent', 1, 'email_sent', true))) = 1, 'results are recorded');
select t(delete_push_endpoints(array['https://fcm.googleapis.com/fcm/send/abc123']) = 1, 'dead devices are removed');
reset role;
