-- Checks for section 31 (Trivia, Trivier, Triviest). Run through tests/run.sh.
\o /dev/null
\set T1 '00000000-0000-0000-0000-0000000000e1'
\set T2 '00000000-0000-0000-0000-0000000000e2'
\set T3 '00000000-0000-0000-0000-0000000000e3'
\set TS '00000000-0000-0000-0000-0000000000e4'
\set TL '00000000-0000-0000-0000-0000000000e5'
\set TX '00000000-0000-0000-0000-0000000000e6'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'T1', 't1@example.com', '{"first_name": "Maya"}'),
  (:'T2', 't2@example.com', '{"first_name": "Jonah"}'),
  (:'T3', 't3@example.com', '{"first_name": "Nina"}');
select paid(array[:'T1', :'T2', :'T3']::uuid[]);
insert into sessions (id, title, slug, starts_at) values
  (:'TS', 'Trivia, Trivier, Triviest', 'trivia-trivier-triviest-test', now() - interval '10 minutes'),
  (:'TL', 'Trivia, Trivier, Triviest', 'trivia-trivier-triviest-later', now() + interval '2 hours'),
  (:'TX', 'Quiet Co-Work', 'quiet-co-work-trivia-test', now() - interval '10 minutes');
insert into bookings (session_id, user_id, charged_to, status) values
  (:'TS', :'T1', :'T1', 'confirmed'), (:'TS', :'T2', :'T2', 'confirmed'),
  (:'TL', :'T1', :'T1', 'confirmed'), (:'TX', :'T1', :'T1', 'confirmed');

select t((select count(*) from trivia_categories) = 6 and (select count(*) from trivia_questions) = 89,
         'Kelly''s 89 starter questions in 6 categories');

-- Who may play
select t(trivia_seat(:'T1', :'TS')->>'name' = 'Maya', 'a seat holder plays under their first name');
select t(trivia_seat(:'T3', :'TS')->>'error' = 'You don’t have a seat in this session.', 'no seat, no game');
select t(trivia_seat(:'T1', :'TL')->>'error' like 'The game opens with the room%', 'not before the room opens');
select t(trivia_seat(:'T1', :'TX')->>'error' = 'This session has no trivia game.', 'only Trivia sessions have a game');
update app_config set require_hello_video = true where id = 1;
update profiles set hello_status = 'approved' where id = :'T2';
select t(trivia_seat(:'T1', :'TS')->>'error' like 'Rooms open for you once%', 'Hello Video rule as in the video room');
select t((trivia_seat(:'T2', :'TS')->>'success')::boolean, 'approved video plays');
update app_config set require_hello_video = false where id = 1;

-- Saving moves: one row per session, rev checked, state and secret move together
select t(trivia_save(:'TS', -1, '{"phase": "lobby"}', null, '{"rng": 7}'), 'room created');
select t(not trivia_save(:'TS', -1, '{"phase": "lobby"}', null, '{"rng": 8}'), 'created only once');
select t(trivia_save(:'TS', 0, '{"phase": "spin"}', null, '{"rng": 9}'), 'a move at the current rev is saved');
select t(not trivia_save(:'TS', 0, '{"phase": "move"}', null, '{"rng": 10}'), 'a move on an old rev is refused');
select t((select rev from trivia_rooms where session_id = :'TS') = 1
         and (select state->>'phase' from trivia_rooms where session_id = :'TS') = 'spin'
         and (select secret->>'rng' from trivia_room_secrets where session_id = :'TS') = '9',
         'state and hidden part stay in step');

-- Members only read; answers, secrets and saving are server-only
select t(not has_function_privilege('authenticated', 'trivia_save(uuid, int, jsonb, jsonb, jsonb)', 'EXECUTE')
         and not has_function_privilege('authenticated', 'trivia_seat(uuid, uuid)', 'EXECUTE')
         and not has_function_privilege('anon', 'trivia_save(uuid, int, jsonb, jsonb, jsonb)', 'EXECUTE'),
         'only the server saves moves or checks seats');
select t(not has_table_privilege('authenticated', 'trivia_room_secrets', 'SELECT')
         and not has_table_privilege('authenticated', 'trivia_rooms', 'UPDATE')
         and not has_table_privilege('authenticated', 'trivia_rooms', 'INSERT')
         and not has_table_privilege('anon', 'trivia_rooms', 'SELECT'), 'no direct writes, no secrets');

select set_config('request.jwt.claim.sub', :'T1', false);
set role authenticated;
select t((select count(*) from trivia_rooms) = 1, 'a seat holder sees the room');
select t((select count(*) from trivia_questions) = 0 and (select count(*) from trivia_categories) = 0,
         'members cannot read questions or answers');
reset role;

select set_config('request.jwt.claim.sub', :'T3', false);
set role authenticated;
select t((select count(*) from trivia_rooms) = 0, 'people without a seat do not');
reset role;
