-- Checks for section 26 (Buddy Rooms: picks after a session, matches, chat). Run through tests/run.sh.
\o /dev/null
\set B1 '00000000-0000-0000-0000-0000000000d1'
\set B2 '00000000-0000-0000-0000-0000000000d2'
\set B3 '00000000-0000-0000-0000-0000000000d3'
\set B4 '00000000-0000-0000-0000-0000000000d4'
\set B5 '00000000-0000-0000-0000-0000000000d5'
\set B6 '00000000-0000-0000-0000-0000000000d6'
\set SP '00000000-0000-0000-0000-0000000000e1'
\set SF '00000000-0000-0000-0000-0000000000e2'
\set SO '00000000-0000-0000-0000-0000000000e3'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'B1', 'b1@example.com', '{"first_name": "Bea"}'),
  (:'B2', 'b2@example.com', '{"first_name": "Cal"}'),
  (:'B3', 'b3@example.com', '{"first_name": "Dee"}'),
  (:'B4', 'b4@example.com', '{"first_name": "Eli"}'),
  (:'B5', 'b5@example.com', '{"first_name": "Fay"}'),
  (:'B6', 'b6@example.com', '{"first_name": "Gus"}');
select paid(array[:'B1', :'B2', :'B3', :'B4', :'B5', :'B6']::uuid[]);
insert into sessions (id, title, slug, starts_at) values
  (:'SP', 'Buddy Past', 'buddy-past', now() - interval '30 minutes'),
  (:'SF', 'Buddy Future', 'buddy-future', now() + interval '2 days'),
  (:'SO', 'Buddy Old', 'buddy-old', now() - interval '3 days');
insert into bookings (session_id, user_id, charged_to, status, held) values
  (:'SP', :'B1', :'B1', 'attended', false),
  (:'SP', :'B2', :'B2', 'confirmed', false),
  (:'SP', :'B3', :'B3', 'confirmed', false),
  (:'SP', :'B4', :'B4', 'confirmed', false),
  (:'SP', :'B5', :'B5', 'confirmed', true),
  (:'SF', :'B1', :'B1', 'confirmed', false),
  (:'SF', :'B2', :'B2', 'confirmed', false),
  (:'SO', :'B1', :'B1', 'attended', false),
  (:'SO', :'B2', :'B2', 'attended', false);
update bookings set joined_at = now() where session_id in (:'SP', :'SF', :'SO') and not held;
-- Gus booked the past session but never came in: a no-show is not part of the group.
insert into bookings (session_id, user_id, charged_to) values (:'SP', :'B6', :'B6');

select t(not has_table_privilege('authenticated', 'buddy_messages', 'INSERT')
         and not has_table_privilege('authenticated', 'buddy_picks', 'INSERT'), 'no direct writes to buddy tables');

select set_config('request.jwt.claim.sub', :'B6', false);
set role authenticated;
select t(get_session_people(:'SP')->>'error' like 'Only people who were in this session%', 'no-shows cannot see who was there');
reset role;

select set_config('request.jwt.claim.sub', :'B1', false);
set role authenticated;
select t(jsonb_array_length(get_session_people(:'SP')->'people') = 3, 'people in the session, without held seats');
select t((get_session_people(:'SP')->>'can_pick')::boolean, 'picks open once the session started');
select t(save_buddy_picks(:'SP', array[:'B2', :'B3', :'B4', :'B5']::uuid[])->>'error' in ('Pick up to 3 people.'),
  'at most 3 picks');
select t(save_buddy_picks(:'SF', array[:'B2']::uuid[])->>'error' = 'Picks open once the session starts.',
  'no picks before the session starts');
select t(save_buddy_picks(:'SO', array[:'B2']::uuid[])->>'error' like 'Picks for this session closed%',
  'picks close 24 hours after the end');
select t(save_buddy_picks(:'SP', array[:'B6']::uuid[])->>'error' = 'Pick people who were in this session.',
  'only people from the session');
select t(save_buddy_picks(:'SP', array[:'B5']::uuid[])->>'error' = 'Pick people who were in this session.',
  'held seats cannot be picked');
select t(jsonb_array_length(save_buddy_picks(:'SP', array[:'B2', :'B3']::uuid[])->'matched') = 0,
  'one-sided picks do not match');
select t((select count(*) from buddy_picks) = 2, 'members see their own picks');
select t(send_buddy_message(:'B2', 'text', 'hi')->>'error' = 'This Buddy Room is closed.', 'no chat before a match');
reset role;

select set_config('request.jwt.claim.sub', :'B2', false);
set role authenticated;
select t((select count(*) from buddy_picks) = 0, 'other people''s picks stay private');
select t(not exists (select 1 from jsonb_array_elements(get_session_people(:'SP')->'people') e
                     where (e->>'matched')::boolean), 'being picked is not shown before a match');
select t((save_buddy_picks(:'SP', array[:'B1']::uuid[])->'matched'->0->>'id')::uuid = :'B1', 'mutual picks match');
reset role;

select set_config('request.jwt.claim.sub', :'B1', false);
set role authenticated;
select t(jsonb_array_length(get_my_buddies()) = 1 and get_my_buddies()->0->>'first_name' = 'Cal', 'the match shows in Buddy Rooms');
select t((send_buddy_message(:'B2', 'text', '  Hello Cal  ')->>'success')::boolean, 'matched people can chat');
select t(send_buddy_message(:'B2', 'video', 'x')->>'error' = 'Unknown message type.', 'unknown message type refused');
select t(send_buddy_message(:'B2', 'text', '   ')->>'error' like 'Write a message%', 'empty message refused');
select t(send_buddy_message(:'B2', 'game', 'Chess?', '{"game": "Poker"}')->>'error' = 'Unknown message type.',
  'game cards only come from start_buddy_game');
select t((start_buddy_game(:'B2', 'Slow Chess')->>'success')::boolean, 'game invitation');
select t(send_buddy_message(:'B2', 'session', 'Join me', '{"slug": "nope"}')->>'error' like 'That session is not%',
  'unknown session refused');
select t((send_buddy_message(:'B2', 'session', 'Join me', '{"slug": "buddy-future"}')->>'success')::boolean,
  'session invitation');
reset role;
select t((select body from buddy_messages where kind = 'text') = 'Hello Cal', 'messages are trimmed');
select t((select payload ->> 'game' from buddy_messages where kind = 'game') = 'Slow Chess'
         and (select payload ? 'game_id' from buddy_messages where kind = 'game'), 'the card names the game');

select set_config('request.jwt.claim.sub', :'B2', false);
set role authenticated;
select t((select count(*) from buddy_messages) = 3, 'the buddy reads the room');
select t(get_my_buddies()->0->>'last_kind' = 'session' and not (get_my_buddies()->0->>'last_from_me')::boolean,
  'Buddy Rooms show the newest message');
reset role;

select set_config('request.jwt.claim.sub', :'B3', false);
set role authenticated;
select t((select count(*) from buddy_messages) = 0, 'a third person cannot read the room');
select t(jsonb_array_length(get_my_buddies()) = 0, 'no Buddy Rooms without a match');
reset role;

-- Rate limit: 30 a minute
select set_config('request.jwt.claim.sub', :'B1', false);
set role authenticated;
select send_buddy_message(:'B2', 'text', 'n' || g) from generate_series(1, 27) g;
select t(send_buddy_message(:'B2', 'text', 'one more')->>'error' like 'That’s a lot of messages%', 'at most 30 messages a minute');
reset role;

-- Block closes the room for both
select set_config('request.jwt.claim.sub', :'B2', false);
set role authenticated;
select t((unpick_buddy(:'B1')->>'success')::boolean, 'block');
select t((select count(*) from buddy_messages) = 0, 'a closed room is hidden');
reset role;
select set_config('request.jwt.claim.sub', :'B1', false);
set role authenticated;
select t((select count(*) from buddy_messages) = 0 and jsonb_array_length(get_my_buddies()) = 0,
  'closed for the other person too');
select t(send_buddy_message(:'B2', 'text', 'hello?')->>'error' = 'This Buddy Room is closed.', 'no messages after a block');
reset role;
