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
