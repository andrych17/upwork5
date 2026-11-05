-- Minimal stand-in for what Supabase provides, enough to run schema.sql in plain Postgres 16.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}',
  banned_until timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants these on everything postgres creates in public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
-- pg_cron is not in the postgres image; run.sh drops the create extension line.
create schema cron;
create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
-- Supabase Vault: same names and signatures, stored in plain text here.
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text,
  secret text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create view vault.decrypted_secrets as select *, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
  returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create function vault.update_secret(secret_id uuid, new_secret text default null) returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), updated_at = now() where id = secret_id $$;
