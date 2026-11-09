-- Checks for section 22 (get_schedule, set_booking_camera). Run through tests/run.sh after admin.sql.
\o /dev/null
\set P1 '00000000-0000-0000-0000-0000000000b1'
\set P2 '00000000-0000-0000-0000-0000000000b2'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'P1', 'p1@example.com', '{"first_name": "Pia"}'),
  (:'P2', 'p2@example.com', '{"first_name": "Quinn"}');
select paid(array[:'P1', :'P2']::uuid[]);
insert into sessions (slug, title, starts_at, capacity, published) values
  ('sched-x', 'Sched X', now() + interval '2 days', 2, true),
  ('sched-z', 'Sched Z', now() + interval '2 days 1 minute', 12, true),
  ('sched-hidden', 'Sched Hidden', now() + interval '2 days', 12, false);
select id as x from sessions where slug = 'sched-x' \gset
select id as z from sessions where slug = 'sched-z' \gset

select set_config('request.jwt.claim.sub', :'P1', false);
set role authenticated;
select book_session(:'x', false) as b1 \gset
select t((:'b1'::jsonb->>'success')::boolean, 'member books a session');
reset role;

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t((select count(*) from get_schedule(now(), now() + interval '7 days') where slug like 'sched-%') = 2,
  'visitors see published sessions only');
select t((select booked = 1 and my_booking_id is null from get_schedule(now(), now() + interval '7 days') where slug = 'sched-x'),
  'visitors see the seat count, not who booked');
select t((select count(*) from get_schedule(null, null, 'sched-x')) = 1, 'one session by slug');
reset role;

do $$
begin
  perform * from get_schedule(now(), now() + interval '400 days');
  raise exception 'FAIL: a range over 190 days is refused';
exception when sqlstate '22023' then
  raise notice 'ok: a range over 190 days is refused';
end $$;

select set_config('request.jwt.claim.sub', :'P1', false);
set role authenticated;
select t((select my_booking_id = (:'b1'::jsonb->>'booking_id')::uuid and not my_camera_off
          from get_schedule(null, null, 'sched-x')), 'members see their own seat');
select t((select array_agg(slug) = array['sched-x'] from get_schedule(null, null, null, true)
          where slug like 'sched-%'), 'p_mine lists only your own seats');
reset role;

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t((select count(*) from get_schedule(null, null, null, true)) = 0, 'p_mine is empty when signed out');
reset role;

select set_config('request.jwt.claim.sub', :'P2', false);
set role authenticated;
select t(set_booking_camera((:'b1'::jsonb->>'booking_id')::uuid, true)->>'error' like 'Booking not found%',
  'nobody else can change your camera');
reset role;

update app_config set bhd_per_month = 1;
select set_config('request.jwt.claim.sub', :'P1', false);
set role authenticated;
select t((set_booking_camera((:'b1'::jsonb->>'booking_id')::uuid, true)->>'success')::boolean, 'camera off after booking');
select book_session(:'z', false) as b2 \gset
select t(set_booking_camera((:'b2'::jsonb->>'booking_id')::uuid, true)->>'error' like 'You have used all 1%',
  'camera off counts against the month''s cards');
select t((set_booking_camera((:'b1'::jsonb->>'booking_id')::uuid, false)->>'success')::boolean, 'camera back on');
select t((set_booking_camera((:'b2'::jsonb->>'booking_id')::uuid, true)->>'success')::boolean, 'the freed card can be used again');
reset role;
update app_config set bhd_per_month = 3;

-- Late arrivals (Kelly 6 Nov): with booking_closes_minutes = -10, booking stays open until 10 minutes after the start,
-- when the room locks to newcomers.
\set P3 '00000000-0000-0000-0000-0000000000b3'
insert into auth.users (id, email, raw_user_meta_data) values (:'P3', 'p3@example.com', '{"first_name": "Rae"}');
select paid(array[:'P3']::uuid[]);
insert into sessions (slug, title, starts_at, capacity, published) values
  ('sched-late', 'Sched Late', now() - interval '5 minutes', 12, true),
  ('sched-gone', 'Sched Gone', now() - interval '11 minutes', 12, true);
select id as late from sessions where slug = 'sched-late' \gset
select id as gone from sessions where slug = 'sched-gone' \gset
update app_config set booking_closes_minutes = -10;
select set_config('request.jwt.claim.sub', :'P3', false);
set role authenticated;
select t((book_session(:'late', false)->>'success')::boolean, 'booking 5 minutes after the start is open with -10');
select t(book_session(:'gone', false)->>'error' = 'Booking closed 10 minutes after the start.',
  'booking 11 minutes after the start is closed');
select t((select closes_at = starts_at + interval '10 minutes' from get_schedule(null, null, 'sched-late')),
  'closes_at is 10 minutes after the start');
reset role;
insert into sessions (slug, title, starts_at, capacity, published) values
  ('sched-six', 'Sched Six', now() - interval '6 minutes', 12, true);
select id as six from sessions where slug = 'sched-six' \gset
update app_config set booking_closes_minutes = -5;
select set_config('request.jwt.claim.sub', :'P3', false);
set role authenticated;
select t(book_session(:'six', false)->>'error' = 'Booking closed 5 minutes after the start.',
  'with -5 (Kelly 6 Nov), booking closes 5 minutes after the start');
reset role;
update app_config set booking_closes_minutes = 15;
select set_config('request.jwt.claim.sub', :'P1', false);
set role authenticated;
select t((book_session(:'late', false)->>'error') = 'Booking closes 15 minutes before the start.',
  'positive cutoff still closes before the start');
reset role;

-- Opening date and Hello Video review time (Kelly 9 Nov, section 8a): sessions look full to visitors and to
-- people who are not approved yet, and book_session refuses them the same way.
update app_config set booking_closes_minutes = -5;
\set P4 '00000000-0000-0000-0000-0000000000b4'
\set P5 '00000000-0000-0000-0000-0000000000b5'
\set P6 '00000000-0000-0000-0000-0000000000b6'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'P4', 'p4@example.com', '{"first_name": "Sol"}'),
  (:'P5', 'p5@example.com', '{"first_name": "Tam"}'),
  (:'P6', 'p6@example.com', '{"first_name": "Uma"}');
select paid(array[:'P4', :'P5']::uuid[]);
update profiles set hello_status = 'approved' where id = :'P4';
update profiles set is_admin = true where id = :'P6';
insert into sessions (slug, title, starts_at, capacity, published) values
  ('open-soon', 'Open Soon', now() + interval '20 hours', 12, true),
  ('open-later', 'Open Later', now() + interval '3 days', 12, true);
select id as soon from sessions where slug = 'open-soon' \gset
select id as later from sessions where slug = 'open-later' \gset
update app_config set opens_at = now() + interval '30 days', require_hello_video = false, hello_wait_hours = 48;

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t((select bool_and(booked = capacity) and count(*) = 2 from get_schedule(now(), now() + interval '7 days')
          where slug like 'open-%'), 'before the opening, visitors see every session as full');
reset role;

select set_config('request.jwt.claim.sub', :'P5', false);
set role authenticated;
select t((select bool_and(booked = capacity) from get_schedule(now(), now() + interval '7 days') where slug like 'open-%'),
  'before the opening, a member who is not approved sees every session as full');
select t(book_session(:'later', false)->>'error' = 'This session is full.', 'and cannot book one');
reset role;

select set_config('request.jwt.claim.sub', :'P4', false);
set role authenticated;
select t((select booked = 0 from get_schedule(null, null, 'open-later')), 'an approved member sees the real seats');
select t((book_session(:'later', false)->>'success')::boolean, 'and can book before the opening');
reset role;

select set_config('request.jwt.claim.sub', :'P6', false);
set role authenticated;
select t((select booked = 1 from get_schedule(null, null, 'open-later')), 'admins see the real seats before the opening');
reset role;

update profiles set hello_status = 'pending' where id = :'P4';
select set_config('request.jwt.claim.sub', :'P4', false);
set role authenticated;
select t((select booked = 1 and my_booking_id is not null from get_schedule(null, null, 'open-later')),
  'a session you hold a seat in keeps its real count');
select t((select booked = capacity from get_schedule(null, null, 'open-soon')), 'other sessions still look full');
reset role;

-- After the opening: only the review time is left, and only with the Hello Video requirement on.
update app_config set opens_at = null, require_hello_video = true, hello_hold_bookings = true;
select set_config('request.jwt.claim.sub', :'P5', false);
set role authenticated;
select t((select booked = capacity from get_schedule(null, null, 'open-soon')),
  'a session within 48 hours looks full to someone not approved yet');
select t((select booked = 1 from get_schedule(null, null, 'open-later')), 'a session 3 days out shows its seats');
select t(book_session(:'soon', false)->>'error' = 'This session is full.', 'booking within 48 hours is refused');
select book_session(:'later', false) as b5 \gset
select t((:'b5'::jsonb->>'success')::boolean and (:'b5'::jsonb->>'held')::boolean,
  'booking 3 days out works, held until the video is approved');
reset role;

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t((select booked = capacity from get_schedule(null, null, 'open-soon')), 'visitors see the same 48 hours as full');
reset role;

update app_config set hello_wait_hours = 0;
select set_config('request.jwt.claim.sub', :'P5', false);
set role authenticated;
select t((select booked = 0 from get_schedule(null, null, 'open-soon')), '0 hours turns the review time off');
reset role;
update app_config set hello_wait_hours = 48, require_hello_video = false;
select set_config('request.jwt.claim.sub', :'P5', false);
set role authenticated;
select t((select booked = 0 from get_schedule(null, null, 'open-soon')), 'without the Hello Video requirement there is no wait');
reset role;

do $$
begin
  set local role authenticated;
  perform looks_full_until(null);
  raise exception 'FAIL: looks_full_until cannot be called directly';
exception when insufficient_privilege then
  raise notice 'ok: looks_full_until cannot be called directly';
end $$;

select set_config('request.jwt.claim.sub', :'P6', false);
set role authenticated;
select t((admin_update_config('{"opens_at": "2026-12-07T06:00:00Z", "hello_wait_hours": 24}')->>'success')::boolean,
  'admin saves the opening date and review hours');
select t(admin_update_config('{"opens_at": "next week"}')->>'error' = 'Check the opening date.', 'a bad date is refused');
select t(admin_update_config('{"opens_at": 5}')->>'error' = 'A setting has the wrong type.', 'a number is not a date');
select t(admin_update_config('{"hello_wait_hours": 200}')->>'error' = 'A setting is out of range.',
  'review time over a week is refused');
reset role;
select t((select opens_at = '2026-12-07T06:00:00Z' and hello_wait_hours = 24 from app_config), 'both values saved');
select set_config('request.jwt.claim.sub', :'P6', false);
set role authenticated;
select t((admin_update_config('{"opens_at": null}')->>'success')::boolean, 'clearing the date saves');
reset role;
select t((select opens_at is null from app_config), 'no date = open to everyone');
update app_config set hello_wait_hours = 48, hello_hold_bookings = false;
update app_config set booking_closes_minutes = 15;
