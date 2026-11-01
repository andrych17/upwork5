-- Checks for section 25 (live rooms and reports). Run through tests/run.sh after payments.sql.
\o /dev/null
\set R1 '00000000-0000-0000-0000-0000000000d1'
\set R2 '00000000-0000-0000-0000-0000000000d2'
\set R3 '00000000-0000-0000-0000-0000000000d3'
\set RA '00000000-0000-0000-0000-0000000000d4'
\set SOPEN '00000000-0000-0000-0000-0000000000e1'
\set SLATER '00000000-0000-0000-0000-0000000000e2'
\set SLOCK '00000000-0000-0000-0000-0000000000e3'
\set SDONE '00000000-0000-0000-0000-0000000000e4'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'R1', 'r1@example.com', '{"first_name": "Rita"}'),
  (:'R2', 'r2@example.com', '{"first_name": "Ravi"}'),
  (:'R3', 'r3@example.com', '{"first_name": "Rex"}'),
  (:'RA', 'ra@example.com', '{"first_name": "Ada"}');
select paid(array[:'R1', :'R2', :'R3', :'RA']::uuid[]);
update profiles set is_admin = true where id = :'RA';
update profiles set hello_status = 'approved' where id in (:'R1', :'R2');
update app_config set require_hello_video = true;
insert into sessions (id, title, slug, starts_at) values
  (:'SOPEN', 'Open Room', 'open-room', now() + interval '5 minutes'),
  (:'SLATER', 'Later Room', 'later-room', now() + interval '2 hours'),
  (:'SLOCK', 'Locked Room', 'locked-room', now() - interval '20 minutes'),
  (:'SDONE', 'Done Room', 'done-room', now() - interval '2 hours');
insert into bookings (session_id, user_id, charged_to) values
  (:'SOPEN', :'R1', :'R1'), (:'SOPEN', :'R2', :'R2'), (:'SOPEN', :'R3', :'R3'),
  (:'SLATER', :'R1', :'R1'), (:'SLOCK', :'R1', :'R1'), (:'SLOCK', :'R2', :'R2'), (:'SDONE', :'R1', :'R1');
update bookings set joined_at = now() - interval '15 minutes' where session_id = :'SLOCK' and user_id = :'R2';

select room_join(:'R1', :'SOPEN') as j1 \gset
select t((:'j1'::jsonb->>'success')::boolean and :'j1'::jsonb->>'name' = 'Rita', 'a booked, approved member gets in');
select t(jsonb_array_length(:'j1'::jsonb->'people') = 3, 'the room lists everyone with a seat');
select t((select joined_at is not null from bookings where session_id = :'SOPEN' and user_id = :'R1'), 'joining marks the seat');
select t(room_join(:'R3', :'SOPEN')->>'error' like 'Rooms open for you once your Hello Video is approved%',
  'no room before the Hello Video is approved');
update bookings set held = true where session_id = :'SOPEN' and user_id = :'R2';
select t(room_join(:'R2', :'SOPEN')->>'error' like 'Rooms open for you once%', 'held seats cannot enter');
update bookings set held = false where session_id = :'SOPEN' and user_id = :'R2';
select t(room_join(:'R1', :'SLATER')->>'error' = 'The room opens 10 minutes before the start.', 'too early');
select t(room_join(:'R2', :'SLATER')->>'error' = 'The room opens 10 minutes before the start.', 'too early, even without a seat');
select t(room_join(:'R1', :'SLOCK')->>'error' like 'The room closed to new arrivals%', 'locked 10 minutes after the start');
select t((room_join(:'R2', :'SLOCK')->>'success')::boolean, 'someone who already joined can come back');
select t(room_join(:'R1', :'SDONE')->>'error' = 'This session has ended.', 'ended sessions are closed');
select t(room_join(:'R3', :'SLOCK')->>'error' = 'You don’t have a seat in this session.', 'no seat, no room');
select t((room_join(:'RA', :'SLOCK')->>'success')::boolean and (room_join(:'RA', :'SLOCK')->>'is_admin')::boolean,
  'admins can enter without a seat');
update profiles set disabled_at = now() where id = :'R2';
select t(room_join(:'R2', :'SOPEN')->>'error' like 'This account can’t join rooms%', 'turned-off accounts stay out');
update profiles set disabled_at = null where id = :'R2';
update app_config set require_hello_video = false;
select t((room_join(:'R3', :'SOPEN')->>'success')::boolean, 'without the Hello Video rule, a seat is enough');

-- Reports
select set_config('request.jwt.claim.sub', :'R1', false);
set role authenticated;
select t(report_participant(:'SOPEN', :'R2', ' ', null)->>'error' = 'Choose what happened.', 'a report needs a reason');
select t(report_participant(:'SOPEN', :'R1', 'Rude', null)->>'error' = 'That person isn’t in this session.', 'no reporting yourself');
select t((report_participant(:'SOPEN', :'R2', 'Rude or disrespectful', 'Kept interrupting')->>'success')::boolean,
  'report someone in the room');
select t((select count(*) from room_reports) = 0, 'members cannot read reports');
select t(admin_resolve_report((select id from room_reports limit 1))->>'error' like 'Only an admin%', 'members cannot resolve');
reset role;
select set_config('request.jwt.claim.sub', :'R2', false);
set role authenticated;
select t(report_participant(:'SDONE', :'R1', 'Rude', null)->>'error' like 'You can only report people from your own session%',
  'outsiders cannot report');
reset role;
select set_config('request.jwt.claim.sub', :'R1', false);
set role authenticated;
select report_participant(:'SOPEN', :'R3', 'Something else', null) from generate_series(1, 9);
select t(report_participant(:'SOPEN', :'R3', 'Something else', null)->>'error' like 'You’ve sent several reports%',
  'at most 10 reports an hour');
reset role;
select set_config('request.jwt.claim.sub', :'RA', false);
set role authenticated;
select t((select count(*) from room_reports where status = 'open') = 10, 'admins see every report');
select t((admin_resolve_report((select id from room_reports where reported_id = :'R2'))->>'success')::boolean, 'admin resolves a report');
select t(admin_resolve_report((select id from room_reports where reported_id = :'R2'))->>'error' like '%already resolved%',
  'no double resolve');
reset role;
