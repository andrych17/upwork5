-- Checks for section 33 (App errors). Run through tests/run.sh.
\o /dev/null
\set EA '00000000-0000-0000-0000-00000000e0a1'
\set EM '00000000-0000-0000-0000-00000000e0a2'
\set EX '00000000-0000-0000-0000-00000000e0a3'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'EA', 'errors-admin@example.com', '{"first_name": "Eve"}'),
  (:'EM', 'errors-member@example.com', '{"first_name": "Eli"}'),
  (:'EX', 'errors-flood@example.com', '{"first_name": "Ezra"}');
update profiles set is_admin = true where id = :'EA';
insert into sessions (slug, title, starts_at, capacity, published) values ('err-room', 'Err Room', now(), 12, true);
select id as es from sessions where slug = 'err-room' \gset

set role anon;
do $$
begin
  perform log_client_error('daily_fatal', 'x');
  raise exception 'FAIL: visitors cannot log errors';
exception when insufficient_privilege then
  raise notice 'ok: visitors cannot log errors';
end $$;
reset role;

select set_config('request.jwt.claim.sub', :'EM', false);
set role authenticated;
select t((log_client_error('daily_fatal', 'Meeting has ended · exp-room', :'es', '/live-room?s=err-room',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', '{"step": "join"}')->>'success')::boolean,
         'a member logs an error');
select t((log_client_error('camera', repeat('x', 900), gen_random_uuid(), null, null, '[1, 2]')->>'success')::boolean,
         'an unknown session and odd details are accepted');
select t(not exists (select 1 from client_errors), 'members cannot read the errors');
do $$
begin
  insert into client_errors (kind, message) values ('fake', 'fake');
  raise exception 'FAIL: members cannot write the table directly';
exception when insufficient_privilege then
  raise notice 'ok: members cannot write the table directly';
end $$;
reset role;

select t((select session_id is not null and profile_id = :'EM' and details->>'step' = 'join'
          from client_errors where kind = 'daily_fatal'), 'the error keeps the member, session and details');
select t((select session_id is null and length(message) = 500 and details = '{}'
          from client_errors where kind = 'camera'), 'unknown session dropped, message cut to 500, details reset');

select set_config('request.jwt.claim.sub', :'EX', false);
set role authenticated;
select count(*) from generate_series(1, 30) g where (log_client_error('camera', 'loop ' || g)->>'success')::boolean;
select t(log_client_error('camera', 'one too many')->>'error' like 'Too many error reports%', 'at most 30 in 10 minutes');
reset role;

insert into client_errors (profile_id, kind, message, created_at) values (:'EM', 'old', 'old', now() - interval '31 days');
select set_config('request.jwt.claim.sub', :'EM', false);
set role authenticated;
select log_client_error('camera', 'newer');
reset role;
select t(not exists (select 1 from client_errors where kind = 'old'), 'rows older than 30 days are trimmed');

select set_config('request.jwt.claim.sub', :'EA', false);
set role authenticated;
select t((select count(*) from client_errors) = 33, 'admins read every error');
reset role;
