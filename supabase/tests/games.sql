-- Checks for section 27 (buddy games: Slow Chess moves and Word Rush scores). Run through tests/run.sh.
\o /dev/null
\set G1 '00000000-0000-0000-0000-0000000000f1'
\set G2 '00000000-0000-0000-0000-0000000000f2'
\set G3 '00000000-0000-0000-0000-0000000000f3'
\set G4 '00000000-0000-0000-0000-0000000000f4'
\set GS '00000000-0000-0000-0000-0000000000f5'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'G1', 'g1@example.com', '{"first_name": "Maya"}'),
  (:'G2', 'g2@example.com', '{"first_name": "Jonah"}'),
  (:'G3', 'g3@example.com', '{"first_name": "Nina"}'),
  (:'G4', 'g4@example.com', '{"first_name": "Sam"}');
select paid(array[:'G1', :'G2', :'G3', :'G4']::uuid[]);
insert into sessions (id, title, slug, starts_at) values (:'GS', 'Games Past', 'games-past', now() - interval '30 minutes');
insert into bookings (session_id, user_id, charged_to, status, held, joined_at)
select :'GS', u, u, 'confirmed', false, now() from unnest(array[:'G1', :'G2', :'G3', :'G4']::uuid[]) u;
-- Maya matches Jonah and Nina. Sam picked nobody and nobody picked Sam.
insert into buddy_picks (session_id, picker_id, picked_id) values
  (:'GS', :'G1', :'G2'), (:'GS', :'G2', :'G1'), (:'GS', :'G1', :'G3'), (:'GS', :'G3', :'G1');

select t(not has_table_privilege('authenticated', 'buddy_games', 'UPDATE')
         and not has_table_privilege('authenticated', 'buddy_games', 'INSERT'), 'no direct writes to buddy_games');

-- Slow Chess: Maya starts and plays White
select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t(start_buddy_game(:'G4', 'Slow Chess')->>'error' = 'This Buddy Room is closed.', 'no game without a match');
select t(start_buddy_game(:'G2', 'Poker')->>'error' = 'Unknown game.', 'unknown game refused');
select start_buddy_game(:'G2', 'Slow Chess')->>'id' as chess \gset
select t((start_buddy_game(:'G2', 'Slow Chess')->>'created')::boolean = false
         and start_buddy_game(:'G2', 'Slow Chess')->>'id' = :'chess', 'starting again returns the same game');
select t((select count(*) from buddy_games where game = 'Slow Chess') = 1, 'one active game per pair and game');
select t((select count(*) from buddy_messages where kind = 'game') = 1, 'one card in the chat');
select t(buddy_game_move(:'chess', 0, 'e2e5x')->>'error' = 'That move is not valid.', 'bad token refused');
select t((buddy_game_move(:'chess', 0, 'e2e4')->>'success')::boolean, 'White moves');
select t(buddy_game_move(:'chess', 1, 'e7e5')->>'error' = 'It is not your move.', 'White cannot move twice');
reset role;

select set_config('request.jwt.claim.sub', :'G2', false);
set role authenticated;
select t((select count(*) from buddy_games) = 1, 'the buddy sees the game');
select t(buddy_game_move(:'chess', 0, 'e7e5')->>'error' like 'The board changed%', 'stale board refused');
select t((buddy_game_move(:'chess', 1, 'e7e5')->>'success')::boolean, 'Black answers');
reset role;
select t((select moves from buddy_games where id = :'chess') = array['e2e4', 'e7e5'], 'moves are kept in order');

-- Games with two buddies at once
select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t((start_buddy_game(:'G3', 'Slow Chess')->>'created')::boolean, 'a second game with another buddy');
select t((select count(*) from buddy_games where status = 'active') = 2, 'both games are going');
reset role;

-- Someone else cannot see or move
select set_config('request.jwt.claim.sub', :'G4', false);
set role authenticated;
select t((select count(*) from buddy_games) = 0, 'a third person sees no games');
select t(buddy_game_move(:'chess', 2, 'g1f3')->>'error' = 'This game is closed.', 'a third person cannot move');
reset role;

-- Resign ends the game; a new one can start
select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t((buddy_game_move(:'chess', 2, 'r')->>'success')::boolean, 'resign');
select t(buddy_game_move(:'chess', 3, 'e7e5')->>'error' = 'This game is over.', 'no moves after the end');
reset role;
select t((select status = 'done' and result = 'b' from buddy_games where id = :'chess'), 'White resigned, Black wins');
select set_config('request.jwt.claim.sub', :'G2', false);
set role authenticated;
select t((start_buddy_game(:'G1', 'Slow Chess')->>'created')::boolean, 'rematch starts a new game');
reset role;
select t((select white_id from buddy_games where low_id = least(:'G1'::uuid, :'G2'::uuid) and high_id = greatest(:'G1'::uuid, :'G2'::uuid)
          and status = 'active') = :'G2', 'whoever starts plays White');

-- Word Rush
select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t(start_buddy_game(:'G2', 'Word Rush', 7)->>'error' = 'Choose 1, 3 or 5 minutes.', 'minutes are limited');
select start_buddy_game(:'G2', 'Word Rush', 3)->>'id' as word \gset
select t((select deal ~ '^[A-Z]{5}$' and minutes = 3 from buddy_games where id = :'word'), 'a 5-letter deal and the chosen minutes');
select t((buddy_game_score(:'word', 0, 0)->>'success')::boolean, 'start my round');
select t((buddy_game_score(:'word', 14, 2)->>'success')::boolean, 'running score');
select t(buddy_game_score(:'word', 99999, 2)->>'error' = 'That score is not valid.', 'absurd score refused');
reset role;
select set_config('request.jwt.claim.sub', :'G2', false);
set role authenticated;
select t((select (scores -> :'G1' ->> 'score')::int from buddy_games where id = :'word') = 14, 'the buddy sees my score');
select t((buddy_game_score(:'word', 20, 3, true)->>'success')::boolean, 'finish my round');
select t(buddy_game_score(:'word', 30, 4)->>'error' = 'You already played this deal.', 'one round each');
reset role;
select t((select status from buddy_games where id = :'word') = 'active', 'still active until both are done');
select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t((buddy_game_score(:'word', 18, 3, true)->>'success')::boolean, 'the other finishes');
reset role;
select t((select status from buddy_games where id = :'word') = 'done', 'both done closes the game');
select set_config('request.jwt.claim.sub', :'G1', false);
set role authenticated;
select t((start_buddy_game(:'G2', 'Word Rush', 1)->>'created')::boolean, 'a new deal after the game');
select start_buddy_game(:'G2', 'Word Rush', 1)->>'id' as word2 \gset
select buddy_game_score(:'word2', 5, 1, true);
-- Played my deal, buddy has not: asking again closes it and deals a new one
select t((start_buddy_game(:'G2', 'Word Rush', 1)->>'created')::boolean, 'new deal after I played and my buddy has not');
reset role;
select t((select status from buddy_games where id = :'word2') = 'done', 'the old deal is closed');
-- A round left running far past its time is closed with the last saved score
select set_config('request.jwt.claim.sub', :'G2', false);
set role authenticated;
select start_buddy_game(:'G1', 'Word Rush', 1)->>'id' as word3 \gset
select buddy_game_score(:'word3', 9, 1);
reset role;
update buddy_games
set scores = jsonb_set(scores, array[:'G2', 'started_at'], to_jsonb(now() - interval '10 minutes'))
where id = :'word3';
select set_config('request.jwt.claim.sub', :'G2', false);
set role authenticated;
select buddy_game_score(:'word3', 900, 50);
reset role;
select t((select (scores -> :'G2' ->> 'score')::int = 9 and (scores -> :'G2' ->> 'done')::boolean from buddy_games where id = :'word3'),
  'a late round keeps the last saved score and ends');

-- Closing the Buddy Room hides the games
select set_config('request.jwt.claim.sub', :'G3', false);
set role authenticated;
select t((select count(*) from buddy_games) = 1, 'Nina sees her one game');
select t((unpick_buddy(:'G1')->>'success')::boolean, 'block');
select t((select count(*) from buddy_games) = 0, 'a closed room hides its games');
reset role;
