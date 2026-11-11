-- Checks for section 32 (Connections: API keys in Vault). Run through tests/run.sh.
\o /dev/null
\set KA '00000000-0000-0000-0000-00000000c0a1'
\set KM '00000000-0000-0000-0000-00000000c0a2'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'KA', 'keys-admin@example.com', '{"first_name": "Kay"}'),
  (:'KM', 'keys-member@example.com', '{"first_name": "Kim"}');
update profiles set is_admin = true where id = :'KA';

select set_config('request.jwt.claim.sub', :'KM', false);
set role authenticated;
select t(admin_set_service_key('DAILY_API_KEY', 'stolen-key-1234567890')->>'success' = 'false'
         and admin_service_keys()->>'success' = 'false', 'members cannot set or list keys');
reset role;
select t(not exists (select 1 from vault.secrets where name like 'mdc:%'), 'nothing stored by a member');

select set_config('request.jwt.claim.sub', :'KA', false);
set role authenticated;
select t((admin_set_service_key('DAILY_API_KEY', '  dk_live_abcdefghijklmnop9876  ')->>'success')::boolean,
         'admin stores a key (spaces around it trimmed)');
select t((select k->>'shown' = '9876' and (k->>'set')::boolean and (k->>'secret')::boolean
          from jsonb_array_elements(admin_service_keys()->'keys') k where k->>'name' = 'DAILY_API_KEY'),
         'the list shows only the last 4 characters of a key');
select t(admin_service_keys()::text not like '%abcdefghijklmnop%', 'the full key never reaches the browser');
-- (A set and a list in one statement would share a snapshot, so each check reads in its own statement.)
select t((admin_set_service_key('RESEND_FROM', 'MeetDoConnect <hello@meetdoconnect.com>')->>'success')::boolean,
         'a plain setting can have spaces');
select t((select k->>'shown' from jsonb_array_elements(admin_service_keys()->'keys') k
          where k->>'name' = 'RESEND_FROM') = 'MeetDoConnect <hello@meetdoconnect.com>', 'plain settings are shown in full');
select t((admin_set_service_key('DAILY_API_KEY', 'dk_live_second_value_0000')->>'success')::boolean,
         'a key can be replaced');
select t(admin_set_service_key('DAILY_MONTHLY_MINUTES', 'lots')->>'error' = 'Enter whole minutes, like 8000.'
         and (admin_set_service_key('DAILY_MONTHLY_MINUTES', '8000')->>'success')::boolean,
         'the minute cap must be a whole number');
select t(admin_set_service_key('SUPABASE_SERVICE_ROLE_KEY', 'x')->>'error' = 'Unknown connection setting.'
         and admin_set_service_key('CRON_SECRET', 'x')->>'error' = 'Unknown connection setting.',
         'only the listed connections can be set');
select t(admin_set_service_key('TWILIO_AUTH_TOKEN', 'abc def 123456789')->>'success' = 'false'
         and admin_set_service_key('RESEND_API_KEY', E're_abc\n123456789')->>'success' = 'false',
         'keys with spaces or line breaks are refused');
select t(admin_set_service_key('STRIPE_PUBLISHABLE_KEY', 'sk_test_51abcDEF')->>'error' = 'That is the secret key. It goes in the Secret key box, not here.'
         and admin_set_service_key('STRIPE_SECRET_KEY', 'pk_test_51abcDEF')->>'error' = 'That is the publishable key. It goes in the Publishable key box.'
         and admin_set_service_key('STRIPE_WEBHOOK_SECRET', 'sk_test_51abcDEF')->>'success' = 'false',
         'a Stripe key pasted in the wrong box is refused, so a secret key is never shown in full');
select t((admin_set_service_key('STRIPE_PUBLISHABLE_KEY', 'pk_test_51abcDEFghij')->>'success')::boolean
         and (admin_set_service_key('STRIPE_SECRET_KEY', 'sk_test_51abcDEFghijKLMN')->>'success')::boolean,
         'Stripe test keys are stored');
select t((select k->>'shown' = 'KLMN' and (k->>'secret')::boolean
          from jsonb_array_elements(admin_service_keys()->'keys') k where k->>'name' = 'STRIPE_SECRET_KEY')
         and (select k->>'shown' = 'pk_test_51abcDEFghij'
              from jsonb_array_elements(admin_service_keys()->'keys') k where k->>'name' = 'STRIPE_PUBLISHABLE_KEY'),
         'the secret key shows its last 4 only, the publishable key in full');
select t((admin_set_service_key('STRIPE_PUBLISHABLE_KEY', '')->>'success')::boolean
         and (admin_set_service_key('STRIPE_SECRET_KEY', '')->>'success')::boolean, 'Stripe keys can be removed');
reset role;

select t((select count(*) from vault.secrets where name = 'mdc:DAILY_API_KEY') = 1
         and (select decrypted_secret from vault.decrypted_secrets where name = 'mdc:DAILY_API_KEY')
             = 'dk_live_second_value_0000', 'one stored copy per key, holding the newest value');
select t((select count(*) from admin_log where action = 'connection_set' and admin_id = :'KA') = 6
         and not exists (select 1 from admin_log where details::text like '%dk_live%'),
         'each change is logged by name, without the value');

set role service_role;
select t((select value from service_keys() where name = 'DAILY_API_KEY') = 'dk_live_second_value_0000'
         and (select count(*) from service_keys()) = 3, 'the server reads the stored values');
reset role;
select t(not has_function_privilege('authenticated', 'service_keys()', 'EXECUTE')
         and not has_function_privilege('anon', 'service_keys()', 'EXECUTE')
         and not has_function_privilege('anon', 'admin_set_service_key(text, text)', 'EXECUTE'),
         'only the server can read the values');
insert into vault.secrets (name, secret) values ('project_url', 'https://example.test');
set role service_role;
select t(not exists (select 1 from service_keys() where name = 'project_url'), 'other Vault secrets stay out');
reset role;

select set_config('request.jwt.claim.sub', :'KA', false);
set role authenticated;
select t((admin_set_service_key('DAILY_API_KEY', '')->>'success')::boolean, 'a key can be cleared');
select t((select not (k->>'set')::boolean from jsonb_array_elements(admin_service_keys()->'keys') k
          where k->>'name' = 'DAILY_API_KEY'), 'a cleared key shows as not set (the function secret applies)');
reset role;
select t(not exists (select 1 from vault.secrets where name = 'mdc:DAILY_API_KEY')
         and exists (select 1 from admin_log where action = 'connection_cleared'), 'cleared keys are gone from Vault');
