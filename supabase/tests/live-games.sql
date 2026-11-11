-- Checks for section 38 (live-room games). Run through tests/run.sh.
\o /dev/null
\set G1 '00000000-0000-0000-0000-0000000001f1'
\set G2 '00000000-0000-0000-0000-0000000001f2'
\set G3 '00000000-0000-0000-0000-0000000001f3'
\set GS '00000000-0000-0000-0000-0000000001f4'
\set GL '00000000-0000-0000-0000-0000000001f5'
\set GX '00000000-0000-0000-0000-0000000001f6'
\set GE '00000000-0000-0000-0000-0000000001f7'
\set GD '00000000-0000-0000-0000-0000000001f8'

-- Which game a session plays: Kelly's catalog slugs and the "<title>-<date>" slugs Admin > Sessions makes
select t(game_for_slug('invent-it') = 'invent-it' and game_for_slug('invent-it-20261123-0100') = 'invent-it'
         and game_for_slug('guess-whose-story-20261124-0100') = 'guess-whose-story'
         and game_for_slug('guess-who-s-story-20261124-0100') = 'guess-whose-story'
         and game_for_slug('puzzle-room-20261125-0100') = 'puzzle-room'
         and game_for_slug('draw-and-guess-20261126-0100') = 'draw-and-guess'
         and game_for_slug('draw-guess-20261126-0100') = 'draw-and-guess', 'game per slug');
select t(game_for_slug('invent-items') is null and game_for_slug('idea-lab') is null
         and game_for_slug('trivia-trivier-triviest') is null and game_for_slug('') is null, 'other sessions have no game');

insert into auth.users (id, email, raw_user_meta_data) values
  (:'G1', 'g1@example.com', '{"first_name": "Maya"}'),
  (:'G2', 'g2@example.com', '{"first_name": "Jonah"}'),
  (:'G3', 'g3@example.com', '{"first_name": "Nina"}');
select paid(array[:'G1', :'G2', :'G3']::uuid[]);
insert into sessions (id, title, slug, starts_at) values
  (:'GS', 'Invent It', 'invent-it-test', now() - interval '10 minutes'),
  (:'GL', 'Invent It', 'invent-it-later', now() + interval '2 hours'),
  (:'GX', 'Quiet Co-Work', 'quiet-co-work-game-test', now() - interval '10 minutes'),
  (:'GE', 'Puzzle Room', 'puzzle-room-ended', now() - interval '66 minutes'),
  (:'GD', 'Draw and Guess', 'draw-and-guess-test', now() - interval '10 minutes');
insert into bookings (session_id, user_id, charged_to, status) values
  (:'GS', :'G1', :'G1', 'confirmed'), (:'GS', :'G2', :'G2', 'confirmed'),
  (:'GL', :'G1', :'G1', 'confirmed'), (:'GX', :'G1', :'G1', 'confirmed'),
  (:'GE', :'G1', :'G1', 'confirmed'), (:'GD', :'G1', :'G1', 'confirmed');

-- Who may play (same rules as trivia_seat)
select t(game_seat(:'G1', :'GS')->>'name' = 'Maya' and game_seat(:'G1', :'GS')->>'game' = 'invent-it',
         'a seat holder plays the session''s game under their first name');
select t(game_seat(:'G1', :'GD')->>'game' = 'draw-and-guess', 'the game comes from the slug');
select t(game_seat(:'G3', :'GS')->>'error' = 'You don’t have a seat in this session.', 'no seat, no game');
select t(game_seat(:'G1', :'GL')->>'error' like 'The game opens with the room%', 'not before the room opens');
select t(game_seat(:'G1', :'GX')->>'error' = 'This session has no game.', 'only game sessions have a game');
select t(game_seat(:'G1', :'GE')->>'error' = 'This session has ended.', 'closed with the video room');
select t((game_seat(:'G1', :'GS')->>'ends_at')::timestamptz
         = (select starts_at + make_interval(mins => minutes) from sessions where id = :'GS'), 'the session end goes to the engine');
update app_config set require_hello_video = true where id = 1;
update profiles set hello_status = 'approved' where id = :'G2';
select t(game_seat(:'G1', :'GS')->>'error' like 'Rooms open for you once%', 'Hello Video rule as in the video room');
select t((game_seat(:'G2', :'GS')->>'success')::boolean, 'approved video plays');
update app_config set require_hello_video = false where id = 1;

-- Saving: one row per session, rev checked, own views written with the same rev
select t(game_save(:'GS', 'invent-it', -1, '{"phase": "lobby", "rng": 7}', '{"phase": "lobby"}', '{}'), 'room created');
select t(not game_save(:'GS', 'invent-it', -1, '{"phase": "lobby", "rng": 8}', '{"phase": "lobby"}', '{}'), 'created only once');
select t(game_save(:'GS', 'invent-it', 0, '{"phase": "stage", "rng": 9}', '{"phase": "stage"}',
                   jsonb_build_object(:'G1', '{"phase": "stage", "word": "kite"}'::jsonb)), 'a move at the current rev is saved');
select t(not game_save(:'GS', 'invent-it', 0, '{"phase": "rate", "rng": 10}', '{"phase": "rate"}', '{}'), 'a move on an old rev is refused');
select t((select rev from game_rooms where session_id = :'GS') = 1
         and (select state->>'rng' from game_rooms where session_id = :'GS') = '9'
         and (select rev from game_views where session_id = :'GS') = 1
         and (select view->>'phase' from game_views where session_id = :'GS') = 'stage'
         and (select rev from game_private_views where session_id = :'GS' and user_id = :'G1') = 1,
         'state, shared view and own view stay in step');
select t(game_save(:'GS', 'invent-it', 1, '{"phase": "rate"}', '{"phase": "rate"}', '{}'), 'next move saved');
select t((select rev from game_private_views where session_id = :'GS' and user_id = :'G1') = 1
         and (select rev from game_views where session_id = :'GS') = 2,
         'an own view left behind keeps its old rev, so the page shows the newer shared view');

-- Members only read their own session and their own view; the whole state and saving are server-only
select t(not has_function_privilege('authenticated', 'game_save(uuid, text, int, jsonb, jsonb, jsonb)', 'EXECUTE')
         and not has_function_privilege('authenticated', 'game_seat(uuid, uuid)', 'EXECUTE')
         and not has_function_privilege('anon', 'game_save(uuid, text, int, jsonb, jsonb, jsonb)', 'EXECUTE'),
         'only the server saves moves or checks seats');
select t(not has_table_privilege('authenticated', 'game_rooms', 'SELECT')
         and not has_table_privilege('authenticated', 'game_views', 'UPDATE')
         and not has_table_privilege('authenticated', 'game_private_views', 'INSERT')
         and not has_table_privilege('anon', 'game_views', 'SELECT')
         and not has_table_privilege('anon', 'game_private_views', 'SELECT'), 'no direct writes, no seed');

select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t((select count(*) from game_views) = 1 and (select count(*) from game_private_views) = 1,
         'a seat holder sees the game and their own view');
reset role;
select set_config('request.jwt.claim.sub', :'G2', false);
set role authenticated;
select t((select count(*) from game_views) = 1 and (select count(*) from game_private_views) = 0,
         'another player does not see someone else''s view');
reset role;
select set_config('request.jwt.claim.sub', :'G3', false);
set role authenticated;
select t((select count(*) from game_views) = 0, 'people without a seat do not see the game');
reset role;

select t(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_views')
         or not exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'shared view goes out over Realtime');

delete from sessions where id in (:'GS', :'GL', :'GX', :'GE', :'GD');
\o
\echo live games: ok
