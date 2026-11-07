-- Checks for section 35 (room roles). Run through tests/run.sh.
\o /dev/null
\set M1 '00000000-0000-0000-0000-0000000009a1'
\set M2 '00000000-0000-0000-0000-0000000009a2'
\set M3 '00000000-0000-0000-0000-0000000009a3'
\set M4 '00000000-0000-0000-0000-0000000009a4'
\set M5 '00000000-0000-0000-0000-0000000009a5'
\set MA '00000000-0000-0000-0000-0000000009a6'
\set SOLD '00000000-0000-0000-0000-0000000009b1'
\set SR '00000000-0000-0000-0000-0000000009b2'
\set SL '00000000-0000-0000-0000-0000000009b3'
\set SN '00000000-0000-0000-0000-0000000009b4'
\set S1 '00000000-0000-0000-0000-0000000009b5'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'M1', 'm1@example.com', '{"first_name": "Mia"}'), (:'M2', 'm2@example.com', '{"first_name": "Max"}'),
  (:'M3', 'm3@example.com', '{"first_name": "Mo"}'), (:'M4', 'm4@example.com', '{"first_name": "Meg"}'),
  (:'M5', 'm5@example.com', '{"first_name": "Mel"}'), (:'MA', 'ma@example.com', '{"first_name": "Adm"}');
select paid(array[:'M1', :'M2', :'M3', :'M4', :'M5', :'MA']::uuid[]);
update profiles set is_admin = true where id = :'MA';
update app_config set require_hello_video = false where id = 1;
insert into sessions (id, title, slug, starts_at) values
  (:'SOLD', 'Old Room', 'roles-old', now() - interval '3 days'),
  (:'SR', 'Roles Room', 'roles-room', now() + interval '3 minutes'),
  (:'SL', 'Later Room', 'roles-later', now() + interval '2 hours'),
  (:'SN', 'Started Room', 'roles-started', now() - interval '2 minutes'),
  (:'S1', 'Small Room', 'roles-small', now() + interval '1 minute');
insert into bookings (session_id, user_id, charged_to) values
  (:'SR', :'M1', :'M1'), (:'SR', :'M2', :'M2'), (:'SR', :'M3', :'M3'), (:'SR', :'M4', :'M4'),
  (:'SL', :'M1', :'M1'), (:'S1', :'M1', :'M1'), (:'S1', :'M5', :'M5'),
  (:'SN', :'M1', :'M1'), (:'SN', :'M2', :'M2'), (:'SN', :'M3', :'M3'), (:'SN', :'M4', :'M4');
update bookings set held = true where session_id = :'S1' and user_id = :'M5';
-- Mia and Max have had a role before; Mo and Meg never have.
insert into session_roles (session_id, role, user_id) values (:'SOLD', 'Starter', :'M1'), (:'SOLD', 'Timekeeper', :'M2');

select set_config('request.jwt.claim.sub', :'M3', false);
set role authenticated;
select room_roles(:'SR') as r1 \gset
select t((:'r1'::jsonb->>'success')::boolean and jsonb_array_length(:'r1'::jsonb->'roles') = 3, 'three roles when the room opens');
select t(:'r1'::jsonb->'roles'->0->>'role' = 'Starter' and :'r1'::jsonb->'roles'->2->>'role' = 'Closer', 'in order');
select t((select count(*) from jsonb_array_elements(:'r1'::jsonb->'roles') e where e->>'user_id' in (:'M3', :'M4')) = 2,
         'the two who never had a role both get one');
select t(room_roles(:'SR') = :'r1'::jsonb, 'the same roles on every call');
reset role;
select set_config('request.jwt.claim.sub', :'M1', false);
set role authenticated;
select t(room_roles(:'SL')->'roles' = '[]'::jsonb, 'no roles before the room opens');
reset role;
select t((select count(*) from session_roles where session_id = :'SL') = 0, 'nothing handed out early');

select set_config('request.jwt.claim.sub', :'M5', false);
set role authenticated;
select t(room_roles(:'SR')->>'error' = 'You don’t have a seat in this session.', 'no seat, no roles');
select t(room_roles(:'S1')->>'error' = 'You don’t have a seat in this session.', 'a held seat does not count');
reset role;
select set_config('request.jwt.claim.sub', :'MA', false);
set role authenticated;
select t(jsonb_array_length(room_roles(:'SR')->'roles') = 3, 'admins see the roles');
select t(room_roles(:'S1')->'roles' = jsonb_build_array(jsonb_build_object('role', 'Starter', 'user_id', :'M1')),
         'one seated member: Starter only, held seats left out');
reset role;

-- After the start, roles of people who haven't come in move to people in the room without one.
insert into session_roles (session_id, role, user_id) values (:'SN', 'Starter', :'M3'), (:'SN', 'Timekeeper', :'M1'), (:'SN', 'Closer', :'M4');
update bookings set joined_at = now() - interval '4 minutes' where session_id = :'SN' and user_id in (:'M1', :'M2');
select set_config('request.jwt.claim.sub', :'M1', false);
set role authenticated;
select room_roles(:'SN') as rn \gset
reset role;
select t((select user_id from session_roles where session_id = :'SN' and role = 'Starter') = :'M2',
         'Starter passes from a no-show to Max, who is in the room');
select t((select user_id from session_roles where session_id = :'SN' and role = 'Timekeeper') = :'M1', 'Mia came, keeps hers');
select t((select user_id from session_roles where session_id = :'SN' and role = 'Closer') = :'M4',
         'nobody left to take Closer, so it stays');
select t(not has_function_privilege('anon', 'room_roles(uuid)', 'EXECUTE')
         and not has_table_privilege('authenticated', 'session_roles', 'SELECT'), 'signed-in members only, through room_roles()');
