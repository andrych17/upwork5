-- Calls the send-reminders Edge Function every 5 minutes. Run once in the Supabase SQL editor,
-- after `supabase functions deploy send-reminders --no-verify-jwt` and after setting its secrets.
-- The two values go into Supabase Vault (encrypted), never into this file or git:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'reminders_cron_secret');
--
-- To change a value later: select vault.update_secret(id, '<new value>') with the id from vault.secrets.
-- To stop the reminders: select cron.unschedule('mdc-send-reminders');

create extension if not exists pg_net;

-- Same name again replaces the job, so this file can be re-run safely.
select cron.schedule(
  'mdc-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Recent runs (status code and the summary the function returned):
--   select id, status_code, content::text, created from net._http_response order by created desc limit 10;
