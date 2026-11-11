-- Checks for section 37 (tester sign-ups and the code email queue). Run through tests/run.sh.
\o /dev/null
\set TA '00000000-0000-0000-0000-00000000e5a1'
\set TM '00000000-0000-0000-0000-00000000e5a2'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'TA', 'testers-admin@example.com', '{"first_name": "Tia"}'),
  (:'TM', 'testers-member@example.com', '{"first_name": "Tom"}');
update profiles set is_admin = true where id = :'TA';
update app_config set tester_form_open = true, tester_limit = 2, tester_auto_code = false where id = 1;

create temp table good as select jsonb_build_object(
  'first_name', '  Ana   Maria ', 'email', ' Ana@Example.com ', 'time_zone', 'America/Chicago',
  'interests', jsonb_build_array('Quiet Co-Work', 'Share a Song', 'Share a Song'),
  'times', jsonb_build_array('weekday_evenings'), 'heard', 'Reddit', 'note', '',
  'agree_dates', true, 'agree_camera', true, 'agree_feedback', true, 'agree_reward', true) as p;
grant select on good to anon, authenticated;

set role anon;
select t((tester_form_info()->>'spots_left')::int = 2 and tester_form_info()->>'starts' = '2026-11-23',
         'visitors see the spots left and the test week');
select t(tester_join((select p - 'agree_camera' from good))->>'success' = 'false', 'all four boxes are required');
select t(tester_join((select p || '{"times": ["midnight"]}' from good))->>'success' = 'false', 'unknown times are refused');
select t(tester_join((select p || '{"interests": []}' from good))->>'success' = 'false', 'at least one session type');
select t(tester_join((select p || '{"email": "not-an-email"}' from good))->>'success' = 'false', 'email is checked');
select t(tester_join((select p || '{"heard": " "}' from good))->>'success' = 'false', 'how they heard is required');
select t(tester_join((select p || '{"agree_dates": "yes"}' from good))->>'success' = 'false',
         'a tick must be a real true, and a wrong type is an answer, not an error');
select t((tester_join((select p || '{"website": "http://spam"}' from good))->>'success')::boolean,
         'the hidden box gets the normal answer');
select t((tester_join((select p from good))->>'success')::boolean, 'a visitor joins without an account');
select t((tester_join((select p || '{"email": "ANA@example.com", "first_name": "Other"}' from good))->>'success')::boolean,
         'joining twice gets the same friendly answer');
reset role;

select t((select count(*) from tester_signups) = 1, 'the hidden box and the second try saved nothing');
select t((select first_name = 'Ana Maria' and email = 'ana@example.com' and status = 'waiting'
                 and interests = array['Quiet Co-Work', 'Share a Song'] and note is null
          from tester_signups), 'saved trimmed, lower-case email, no duplicate interests, waiting for an OK');

select t(not has_table_privilege('anon', 'tester_signups', 'select')
         and not has_table_privilege('authenticated', 'tester_signups', 'insert'), 'visitors cannot read the list, nobody writes it directly');
select t(not has_table_privilege('anon', 'tester_secret', 'select')
         and not has_table_privilege('authenticated', 'tester_secret', 'update')
         and not exists (select 1 from information_schema.columns where table_name = 'app_config' and column_name = 'tester_code'),
         'the code is not in app_config (every visitor can read it) and visitors cannot read it');
set role anon;
select t((tester_join((select p || '{"email": "ben@example.com", "first_name": "Ben"}' from good))->>'success')::boolean,
         'the second spot is taken');
select t((tester_join((select p || '{"email": "cy@example.com"}' from good))->>'full')::boolean
         and (tester_form_info()->>'spots_left')::int = 0, 'the form closes itself at the limit');
reset role;

select set_config('request.jwt.claim.sub', :'TM', false);
set role authenticated;
select t(not exists (select 1 from tester_signups), 'members cannot read the list');
select t(not exists (select 1 from tester_secret), 'members cannot read the code');
select t(admin_tester_send_waiting()->>'success' = 'false'
         and admin_tester_settings('{"tester_limit": 400}')->>'success' = 'false', 'members cannot send codes or change settings');
reset role;

select set_config('request.jwt.claim.sub', :'TA', false);
set role authenticated;
select t((select count(*) from tester_signups) = 2, 'admins read the list');
select t((admin_tester_action((select id from tester_signups where email = 'ben@example.com'), 'decline')->>'success')::boolean,
         'admin declines one');
reset role;
set role anon;
select t((tester_form_info()->>'spots_left')::int = 1, 'a declined sign-up frees its spot');
reset role;

select set_config('request.jwt.claim.sub', :'TA', false);
set role authenticated;
select t((admin_tester_send_waiting()->>'count')::int = 1, 'Send to everyone waiting queues only the waiting one');
select t(admin_tester_settings('{"test_week_start": "2026-11-30", "test_week_end": "2026-11-29"}')->>'success' = 'false',
         'the week cannot end before it starts');
select t(admin_tester_settings('{"tester_code": "WELCOME 7"}')->>'success' = 'false', 'the code is letters and numbers only');
select t((admin_tester_settings('{"tester_auto_code": true, "tester_limit": 3, "tester_code": " welcome8"}')->>'success')::boolean,
         'admin saves settings');
select t((select tester_auto_code and tester_limit = 3 from app_config) and (select code = 'WELCOME8' from tester_secret),
         'saved: auto on, 3 spots, code trimmed in capitals, and admins can read it');
reset role;

set role anon;
select t((tester_join((select p || '{"email": "dee@example.com", "first_name": "Dee"}' from good))->>'auto')::boolean,
         'with auto on, a new sign-up is told the code is on its way');
reset role;
select t((select status = 'queued' and queued_at is not null from tester_signups where email = 'dee@example.com'),
         'and it is queued right away');

-- The sender: claim, then record. A claimed email is never claimed twice.
create temp table claimed as select claim_tester_codes(50) as items;
select t((select jsonb_array_length(items) = 2 and items->0->>'code' = 'WELCOME8' and items->0->>'starts' = '2026-11-23'
          from claimed), 'the sender gets the two queued emails with the code and the week');
select t(jsonb_array_length(claim_tester_codes(50)) = 0, 'nothing is claimed twice');

-- Decline tapped while sending: the result does not turn it back into sent.
update tester_signups set status = 'declined' where email = 'dee@example.com';
select t(record_tester_codes((select jsonb_agg(jsonb_build_object('id', i->>'id', 'sent', true, 'error', null))
                               from claimed, jsonb_array_elements(items) i)) = 1, 'results are recorded');
select t((select status = 'sent' and sent_at is not null from tester_signups where email = 'ana@example.com')
         and (select status = 'declined' from tester_signups where email = 'dee@example.com'),
         'sent is saved, and a decline during sending is kept');

select set_config('request.jwt.claim.sub', :'TA', false);
set role authenticated;
select t((admin_tester_action((select id from tester_signups where email = 'ana@example.com'), 'send')->>'success')::boolean,
         'Send again works on a sent code');
select t((select status = 'queued' and claimed_at is null from tester_signups where email = 'ana@example.com'),
         'and queues it once more');
select t((admin_tester_action((select id from tester_signups where email = 'dee@example.com'), 'delete')->>'success')::boolean,
         'admin deletes a spam sign-up');
select t(not exists (select 1 from tester_signups where email = 'dee@example.com'), 'and it is gone');
select t(exists (select 1 from admin_log where action = 'tester_delete'), 'admin actions are logged');
reset role;

update app_config set tester_form_open = false where id = 1;
set role anon;
select t((tester_join((select p || '{"email": "eve@example.com"}' from good))->>'closed')::boolean, 'a closed form takes no one');
reset role;

-- Leave the shared database as it was for the files after this one.
delete from tester_signups;
delete from auth.users where id in (:'TA', :'TM');
update app_config set tester_form_open = true, tester_limit = 50, tester_auto_code = false,
  test_week_start = '2026-11-23', test_week_end = '2026-11-29' where id = 1;
update tester_secret set code = 'WELCOME7' where id = 1;
\o
\echo 'testers: ok'
