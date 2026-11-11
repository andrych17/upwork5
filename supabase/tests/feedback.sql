-- Checks for section 39 (the survey after each session and Admin > Feedback). Run through tests/run.sh.
\o /dev/null
\set F1 '00000000-0000-0000-0000-0000000fb0f1'
\set F2 '00000000-0000-0000-0000-0000000fb0f2'
\set F3 '00000000-0000-0000-0000-0000000fb0f3'
\set FA '00000000-0000-0000-0000-0000000fb0fa'
\set S1 '00000000-0000-0000-0000-0000000fb0c1'
\set S2 '00000000-0000-0000-0000-0000000fb0c2'
\set S3 '00000000-0000-0000-0000-0000000fb0c3'
\set SX '00000000-0000-0000-0000-0000000fb0c9'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'F1', 'f1@example.com', '{"first_name": "Fern"}'),
  (:'F2', 'f2@example.com', '{"first_name": "Gil"}'),
  (:'F3', 'f3@example.com', '{"first_name": "Hal"}'),
  (:'FA', 'fa@example.com', '{"first_name": "Ada"}');
select paid(array[:'F1', :'F2', :'F3', :'FA']::uuid[]);
update profiles set is_admin = true where id = :'FA';
insert into sessions (id, title, slug, starts_at) values
  (:'S1', 'Feedback One', 'feedback-one', now() - interval '70 minutes'),
  (:'S2', 'Feedback Two', 'feedback-two', now() - interval '1 day'),
  (:'S3', 'Feedback Three', 'feedback-three', now() - interval '2 days'),
  (:'SX', 'Feedback Old', 'feedback-old', now() - interval '4 days');
insert into bookings (session_id, user_id, charged_to, status, held) values
  (:'S1', :'F1', :'F1', 'attended', false), (:'S2', :'F1', :'F1', 'attended', false),
  (:'S3', :'F1', :'F1', 'attended', false), (:'SX', :'F1', :'F1', 'attended', false),
  (:'S1', :'F2', :'F2', 'attended', false);
update bookings set joined_at = now() where user_id in (:'F1', :'F2');
-- Hal booked S1 but never came into the room.
insert into bookings (session_id, user_id, charged_to) values (:'S1', :'F3', :'F3');

select t(not has_table_privilege('authenticated', 'session_feedback', 'INSERT')
         and not has_table_privilege('authenticated', 'session_feedback', 'UPDATE')
         and not has_table_privilege('anon', 'session_feedback', 'SELECT'), 'no direct writes, no anon reads');

select set_config('request.jwt.claim.sub', :'F1', false);
set role authenticated;
select t(feedback_status(:'S1') = '{"ask": true, "sent": false}', 'asked after a session they sat in');
select t(not (feedback_status(:'SX')->>'ask')::boolean, 'not asked 3 days after the end');
select t(submit_session_feedback(jsonb_build_object('session_id', :'SX', 'device', 'website', 'join_ease', 5,
  'av', 'yes', 'roles', 5, 'comfort', 5))->>'error' = 'Feedback for this session has closed.', 'closed after 3 days');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 5,
  'av', 'yes', 'roles', 5))->>'error' = 'Please answer the four questions.', 'all four taps are needed');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 6,
  'av', 'yes', 'roles', 5, 'comfort', 5))->>'error' = 'Please answer the four questions.', '1 to 5 only');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 'x',
  'av', 'yes', 'roles', 5, 'comfort', 5))->>'error' = 'Please answer the four questions.', 'not a number');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 4,
  'av', 'maybe', 'roles', 5, 'comfort', 5))->>'error' = 'Please answer the four questions.', 'yes, mostly or no only');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'tv', 'join_ease', 4,
  'av', 'yes', 'roles', 5, 'comfort', 5))->>'error' = 'Please refresh the page and try again.', 'known devices only');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 4,
  'av', 'no', 'av_note', repeat('a', 601), 'roles', 5, 'comfort', 5))->>'error' like 'Please keep each short%',
  'short answers up to 600 characters');
select t((submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'android_app', 'join_ease', 4,
  'av', 'mostly', 'av_note', '  Sound cut out once  ', 'roles', 3, 'comfort', 4, 'comfort_note', '',
  'confusing', 'Where the timer was')))->>'success' = 'true', 'answer saved');
select t(feedback_status(:'S1') = '{"ask": true, "sent": true}', 'status shows it was sent');
select t((submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'android_app', 'join_ease', 5,
  'av', 'yes', 'roles', 3, 'comfort', 4)))->>'success' = 'true', 'sending again is fine');
select t((select count(*) from session_feedback) = 0, 'members cannot read the answers');
select t(admin_feedback_summary()->>'error' = 'Only an admin can see this.', 'summary is admin only');
select t(admin_feedback_setting(false)->>'error' = 'Only an admin can change this.', 'switch is admin only');
select submit_session_feedback(jsonb_build_object('session_id', :'S2', 'device', 'apple_app', 'join_ease', 2,
  'av', 'no', 'roles', 4, 'comfort', 3));
select submit_session_feedback(jsonb_build_object('session_id', :'S3', 'device', 'website', 'join_ease', 3,
  'av', 'yes', 'roles', 5, 'comfort', 5));
reset role;

select t((select av_note is null and join_ease = 5 and av = 'yes' and updated_at >= created_at
          from session_feedback where session_id = :'S1' and user_id = :'F1'),
  'the second answer replaced the first (one per member per session)');
select t((select count(*) from session_feedback where user_id = :'F1') = 3, 'one row per session');

select set_config('request.jwt.claim.sub', :'F3', false);
set role authenticated;
select t(not (feedback_status(:'S1')->>'ask')::boolean, 'no-shows are not asked');
select t(submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 5,
  'av', 'yes', 'roles', 5, 'comfort', 5))->>'error' like 'Only people who were in this session%', 'no-shows cannot answer');
reset role;

select set_config('request.jwt.claim.sub', :'F2', false);
set role authenticated;
select submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 4,
  'av', 'yes', 'roles', 4, 'comfort', 5, 'confusing', '=HYPERLINK("http://x")'));
reset role;

select set_config('request.jwt.claim.sub', :'FA', false);
set role authenticated;
select t((select count(*) from session_feedback) = 4, 'admins read every answer');
select t(admin_feedback_summary() @> '{"success": true, "answers": 4, "members": 2, "members_3plus": 1,
  "av_yes": 3, "av_no": 1, "av_mostly": 0}', 'summary counts');
select t((admin_feedback_summary()->>'join_avg')::numeric = 3.5, 'summary averages');
select t((admin_feedback_setting(false))->>'success' = 'true', 'admin turns it off');
reset role;
select t((select action from admin_log order by created_at desc limit 1) = 'feedback_setting_saved', 'logged');

select set_config('request.jwt.claim.sub', :'F2', false);
set role authenticated;
select t(not (feedback_status(:'S1')->>'ask')::boolean, 'nobody is asked while it is off');
select t((submit_session_feedback(jsonb_build_object('session_id', :'S1', 'device', 'website', 'join_ease', 4,
  'av', 'yes', 'roles', 4, 'comfort', 5)))->>'off' = 'true', 'answers are refused while it is off');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select t(submit_session_feedback('{}')->>'error' = 'Please sign in to send feedback.', 'signed-out callers are refused');
select t(feedback_status(:'S1') = '{"ask": false, "sent": false}', 'signed-out callers are not asked');
reset role;
update app_config set feedback_on = true where id = 1;
\o
\echo 'feedback: ok'
