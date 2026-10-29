-- ========================================================================
-- MeetDoConnect Supabase Database Schema (Milestone 2, updated Oct 29, 2026)
--
-- Membership rules (Kelly, 28-29 Oct):
--   * Individual: 13 credits per billing month. Household: up to 4 people, each with their own
--     sign-in, sharing 16 credits per billing month on the account holder's profile.
--   * Up to 4 sessions a week per person (Monday to Sunday, Central time). Set
--     app_config.max_weekly_sessions to another number, or null for no weekly limit.
--   * Unused monthly credits expire when the next billing month starts (no carry-over).
--   * Annual plans get their credits each month on the billing day, like monthly plans.
--   * Extra credits never expire, are used after the monthly ones, and can go past the weekly limit.
--   * Cancel 24+ hours ahead: credit back. Later: seat released, credit used.
--   * Failed renewal: the billing day stays the same. Booked seats are held for 3 days, then
--     released. Credits come back as soon as the payment goes through.
--
-- Run the whole file in the Supabase SQL editor. It is safe to run again.
-- lib/schedule/rules.ts mirrors these rules for the browser. Change both together.
-- ========================================================================

create extension if not exists pgcrypto;

-- 1. Global Application Configuration (one row; change policy numbers here)
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  tz text not null default 'America/Chicago',
  monthly_credits int not null default 13 check (monthly_credits >= 0),
  household_monthly_credits int not null default 16 check (household_monthly_credits >= 0),
  household_max_people int not null default 4 check (household_max_people between 1 and 10),
  -- null = no weekly limit
  max_weekly_sessions int default 4 check (max_weekly_sessions is null or max_weekly_sessions > 0),
  welcome_trial_days int not null default 7,
  welcome_credits int not null default 4,
  cancel_hours int not null default 24,
  grace_days int not null default 3,
  bhd_per_month int not null default 3,
  booking_closes_minutes int not null default 15,
  book_ahead_days int not null default 14
);

alter table app_config add column if not exists household_monthly_credits int not null default 16;
alter table app_config add column if not exists household_max_people int not null default 4;
alter table app_config add column if not exists welcome_trial_days int not null default 7;
alter table app_config add column if not exists welcome_credits int not null default 4;
alter table app_config alter column max_weekly_sessions drop not null;

insert into app_config default values on conflict do nothing;

-- 2. Member Profiles (Tied directly to auth.users)
-- A household member has household_owner_id set and spends the owner's credits.
-- Bad Hair Day cards are counted from bookings (camera_off), per calendar month.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  tier text not null default 'individual' check (tier in ('individual', 'household')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual')),
  billing_date int not null default extract(day from now()) check (billing_date between 1 and 31),
  monthly_credits int not null default 13 check (monthly_credits >= 0),
  addon_credits int not null default 0 check (addon_credits >= 0),
  credits_cycle_start date,
  household_owner_id uuid references profiles(id) on delete set null,
  payment_status text not null default 'active' check (payment_status in ('active', 'past_due', 'paused', 'canceled')),
  payment_failed_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (household_owner_id is distinct from id)
);

alter table profiles add column if not exists credits_cycle_start date;
alter table profiles add column if not exists household_owner_id uuid references profiles(id) on delete set null;
alter table profiles drop column if exists bhd_cards_remaining;

create index if not exists idx_profiles_household_owner on profiles (household_owner_id);
create index if not exists idx_profiles_email on profiles (lower(email));

-- 3. Live Sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  blurb text,
  host text not null default 'Kelly C.',
  prep text,
  starts_at timestamptz not null,
  minutes int not null default 60,
  capacity int not null default 12,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_starts_at on sessions (starts_at);
create index if not exists idx_sessions_published on sessions (published);

-- 4. Session Bookings
-- user_id = who sits in the seat, charged_to = whose credits paid (the household owner for members).
-- late_cancelled = cancelled inside the 24-hour window: seat released, credit used.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  charged_to uuid not null references profiles(id) on delete cascade,
  credit_type text not null default 'monthly' check (credit_type in ('monthly', 'addon')),
  camera_off boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'late_cancelled', 'attended')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

alter table bookings add column if not exists charged_to uuid references profiles(id) on delete cascade;
update bookings set charged_to = user_id where charged_to is null;
alter table bookings alter column charged_to set not null;
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('confirmed', 'cancelled', 'late_cancelled', 'attended'));

create unique index if not exists one_active_booking on bookings (session_id, user_id)
where (status = 'confirmed');

create index if not exists idx_bookings_user_status on bookings (user_id, status);
create index if not exists idx_bookings_session_status on bookings (session_id, status);
create index if not exists idx_bookings_charged_to on bookings (charged_to, status);

-- 5. Household Invites (an invited email joins the household when that person signs up)
create table if not exists household_invites (
  email text primary key check (email = lower(email)),
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_household_invites_owner on household_invites (owner_id);

-- 6. Helper Functions
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- The billing day inside a given month (day 31 falls on the 30th, the 28th or 29th in short months).
create or replace function cycle_anchor(p_month date, p_billing_day int)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_month::timestamp)::date
    + (least(p_billing_day, extract(day from date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::int) - 1);
$$;

-- First day of the billing month that contains p_today.
create or replace function cycle_start(p_billing_day int, p_today date)
returns date
language sql
immutable
as $$
  select case
    when p_today >= cycle_anchor(p_today, p_billing_day) then cycle_anchor(p_today, p_billing_day)
    else cycle_anchor((p_today - interval '1 month')::date, p_billing_day)
  end;
$$;

create or replace function next_cycle_start(p_billing_day int, p_today date)
returns date
language sql
immutable
as $$
  select cycle_anchor((cycle_start(p_billing_day, p_today) + interval '1 month')::date, p_billing_day);
$$;

create or replace function plan_credits(p_tier text)
returns int
language sql
stable
set search_path = public
as $$
  select case when p_tier = 'household' then c.household_monthly_credits else c.monthly_credits end
  from app_config c where c.id = 1;
$$;

-- 7. Trigger: Automatically create profile upon user signup
-- An invited email joins that household. Everyone else gets their own plan.
-- Until checkout exists (Milestone 3) the plan comes from the sign-up form; after that, the
-- payment processor's confirmation sets tier and billing_interval.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_today date;
  v_invite household_invites%rowtype;
  v_owner profiles%rowtype;
  v_tier text;
  v_interval text;
begin
  select * into v_cfg from app_config where id = 1;
  v_today := (now() at time zone v_cfg.tz)::date;

  select * into v_invite from household_invites where email = lower(new.email) for update;
  if found then
    select * into v_owner from profiles where id = v_invite.owner_id;
    insert into public.profiles (
      id, email, first_name, last_name, tier, billing_interval, billing_date,
      monthly_credits, addon_credits, credits_cycle_start, household_owner_id, payment_status
    ) values (
      new.id,
      lower(new.email),
      coalesce(new.raw_user_meta_data->>'first_name', 'Member'),
      coalesce(new.raw_user_meta_data->>'last_name', ''),
      'household',
      v_owner.billing_interval,
      v_owner.billing_date,
      0,
      0,
      v_owner.credits_cycle_start,
      v_owner.id,
      'active'
    )
    on conflict (id) do nothing;
    delete from household_invites where email = lower(new.email);
    return new;
  end if;

  v_tier := case when new.raw_user_meta_data->>'tier' = 'household' then 'household' else 'individual' end;
  v_interval := case when new.raw_user_meta_data->>'billing_interval' = 'annual' then 'annual' else 'monthly' end;

  insert into public.profiles (
    id, email, first_name, last_name, tier, billing_interval, billing_date,
    monthly_credits, addon_credits, credits_cycle_start, payment_status
  ) values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'first_name', 'Member'),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    v_tier,
    v_interval,
    extract(day from v_today)::int,
    plan_credits(v_tier),
    0,
    v_today,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 8. RPC Function: Book a Session
-- Checks the payer's membership, seats, the weekly limit, credits and Bad Hair Day cards, then
-- takes one credit. The payer's row is locked, so two household members booking at the same
-- moment cannot both spend the last credit.
create or replace function book_session(
  p_session_id uuid,
  p_camera_off boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_user_id uuid := auth.uid();
  v_me profiles%rowtype;
  v_payer profiles%rowtype;
  v_session sessions%rowtype;
  v_booked_seats int;
  v_week_used int;
  v_bhd_used int;
  v_credit_type text;
  v_new_booking_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in to book a session.');
  end if;

  select * into v_cfg from app_config where id = 1;

  -- Lock order is always booker, then household owner (owners never lock a member row).
  select * into v_me from profiles where id = v_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Profile not found.');
  end if;
  if v_me.household_owner_id is null then
    v_payer := v_me;
  else
    select * into v_payer from profiles where id = v_me.household_owner_id for update;
  end if;

  if v_payer.payment_status = 'past_due' then
    return jsonb_build_object('success', false, 'error',
      'The last membership payment did not go through. Update the card to book again.');
  elsif v_payer.payment_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'This membership is not active. Restart it to book sessions.');
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found or not v_session.published then
    return jsonb_build_object('success', false, 'error', 'Session not available.');
  end if;

  if v_session.starts_at <= now() + make_interval(mins => v_cfg.booking_closes_minutes) then
    return jsonb_build_object('success', false, 'error',
      format('Booking closes %s minutes before the start.', v_cfg.booking_closes_minutes));
  end if;
  if v_session.starts_at > now() + make_interval(days => v_cfg.book_ahead_days) then
    return jsonb_build_object('success', false, 'error',
      format('You can book up to %s days ahead.', v_cfg.book_ahead_days));
  end if;

  if exists (
    select 1 from bookings where session_id = p_session_id and user_id = v_user_id and status = 'confirmed'
  ) then
    return jsonb_build_object('success', false, 'error', 'You already booked this session.');
  end if;

  select count(*) into v_booked_seats
  from bookings
  where session_id = p_session_id and status = 'confirmed';
  if v_booked_seats >= v_session.capacity then
    return jsonb_build_object('success', false, 'error', 'This session is full.');
  end if;

  -- Monthly credits this person used in the session's week (Monday to Sunday, business time zone).
  select count(*) into v_week_used
  from bookings b
  join sessions s on s.id = b.session_id
  where b.user_id = v_user_id
    and b.credit_type = 'monthly'
    and b.status in ('confirmed', 'attended', 'late_cancelled')
    and date_trunc('week', s.starts_at at time zone v_cfg.tz)
      = date_trunc('week', v_session.starts_at at time zone v_cfg.tz);

  if v_payer.monthly_credits > 0
     and (v_cfg.max_weekly_sessions is null or v_week_used < v_cfg.max_weekly_sessions) then
    v_credit_type := 'monthly';
  elsif v_payer.addon_credits > 0 then
    v_credit_type := 'addon';
  elsif v_payer.monthly_credits > 0 then
    return jsonb_build_object('success', false, 'error',
      format('You have booked %s sessions for that week. Add an extra session to book this one.',
             v_cfg.max_weekly_sessions));
  else
    return jsonb_build_object('success', false, 'error',
      'This month''s sessions are used up. Add an extra session to keep booking.');
  end if;

  if p_camera_off then
    select count(*) into v_bhd_used
    from bookings b
    join sessions s on s.id = b.session_id
    where b.user_id = v_user_id
      and b.camera_off
      and b.status in ('confirmed', 'attended', 'late_cancelled')
      and date_trunc('month', s.starts_at at time zone v_cfg.tz)
        = date_trunc('month', v_session.starts_at at time zone v_cfg.tz);
    if v_bhd_used >= v_cfg.bhd_per_month then
      return jsonb_build_object('success', false, 'error',
        format('You have used all %s Bad Hair Day cards for that month.', v_cfg.bhd_per_month));
    end if;
  end if;

  if v_credit_type = 'monthly' then
    update profiles set monthly_credits = monthly_credits - 1, updated_at = now() where id = v_payer.id;
  else
    update profiles set addon_credits = addon_credits - 1, updated_at = now() where id = v_payer.id;
  end if;

  insert into bookings (session_id, user_id, charged_to, credit_type, camera_off, status)
  values (p_session_id, v_user_id, v_payer.id, v_credit_type, p_camera_off, 'confirmed')
  returning id into v_new_booking_id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_new_booking_id,
    'credit_type', v_credit_type
  );
end;
$$;

-- 9. RPC Function: Cancel Booking (24-Hour Rule)
create or replace function cancel_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_user_id uuid := auth.uid();
  v_booking bookings%rowtype;
  v_session sessions%rowtype;
  v_payer profiles%rowtype;
  v_refunded boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;

  select * into v_cfg from app_config where id = 1;

  select * into v_booking
  from bookings
  where id = p_booking_id and user_id = v_user_id
  for update;

  if not found or v_booking.status <> 'confirmed' then
    return jsonb_build_object('success', false, 'error', 'Booking not found or already cancelled.');
  end if;

  select * into v_session from sessions where id = v_booking.session_id;
  if v_session.starts_at <= now() then
    return jsonb_build_object('success', false, 'error', 'This session has already started.');
  end if;

  if v_session.starts_at >= now() + make_interval(hours => v_cfg.cancel_hours) then
    v_refunded := true;
    select * into v_payer from profiles where id = v_booking.charged_to for update;
    if v_booking.credit_type = 'monthly' then
      -- Capped at the plan size, in case the booking was paid from the previous billing month.
      update profiles
      set monthly_credits = least(monthly_credits + 1, plan_credits(v_payer.tier)), updated_at = now()
      where id = v_payer.id;
    else
      update profiles set addon_credits = addon_credits + 1, updated_at = now() where id = v_payer.id;
    end if;
  end if;

  update bookings
  set status = case when v_refunded then 'cancelled' else 'late_cancelled' end,
      cancelled_at = now()
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'refunded', v_refunded,
    'message', case when v_refunded then 'Booking cancelled and credit returned.'
      else format('Booking cancelled. The credit is used because it was less than %s hours before the start.',
                  v_cfg.cancel_hours) end
  );
end;
$$;

-- 10. Monthly credits (run hourly by pg_cron, section 17)
-- Gives each active paying profile its plan's credits when a new billing month starts.
-- Credits left from the previous month are replaced, not added (no carry-over).
-- p_only limits the run to one profile (used when a failed payment goes through).
create or replace function refill_due_credits(p_only uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_today date;
  v_count int;
begin
  select * into v_cfg from app_config where id = 1;
  v_today := (now() at time zone v_cfg.tz)::date;

  with due as (
    select p.id, cycle_start(p.billing_date, v_today) as cs
    from profiles p
    where p.household_owner_id is null
      and p.payment_status = 'active'
      and (p_only is null or p.id = p_only)
      and (p.credits_cycle_start is null or p.credits_cycle_start < cycle_start(p.billing_date, v_today))
    for update of p skip locked
  ),
  refilled as (
    update profiles p
    set monthly_credits = plan_credits(p.tier),
        credits_cycle_start = due.cs,
        updated_at = now()
    from due
    where p.id = due.id
    returning p.id, p.credits_cycle_start
  ),
  members as (
    update profiles m
    set credits_cycle_start = r.credits_cycle_start, updated_at = now()
    from refilled r
    where m.household_owner_id = r.id
    returning m.id
  )
  select count(*) into v_count from refilled;

  return v_count;
end;
$$;

-- 11. Payment events (for the Milestone 3 processor webhooks; server-side only)
-- Failed renewal: the new month's credits wait for the payment, and the billing day stays the same.
create or replace function mark_payment_failed(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set payment_status = 'past_due',
      payment_failed_at = coalesce(payment_failed_at, now()),
      monthly_credits = 0,
      credits_cycle_start = null,
      updated_at = now()
  where id = p_profile and household_owner_id is null;
end;
$$;

-- The payment went through: back to active, and this billing month's credits arrive right away.
create or replace function mark_payment_recovered(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set payment_status = 'active',
      payment_failed_at = null,
      updated_at = now()
  where id = p_profile and household_owner_id is null;
  perform refill_due_credits(p_profile);
end;
$$;

-- 12. Grace Period Enforcement (run hourly by pg_cron, section 17)
-- After grace_days without payment: pause the membership, release its future seats, and return
-- any extra credits those seats used (extras were paid for separately).
create or replace function enforce_failed_payment_grace()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_released_count int := 0;
begin
  select * into v_cfg from app_config where id = 1;

  update profiles
  set payment_status = 'paused',
      updated_at = now()
  where payment_status = 'past_due'
    and payment_failed_at is not null
    and payment_failed_at <= now() - make_interval(days => v_cfg.grace_days);

  with released as (
    update bookings b
    set status = 'cancelled',
        cancelled_at = now()
    from profiles p, sessions s
    where b.charged_to = p.id
      and b.session_id = s.id
      and p.payment_status = 'paused'
      and b.status = 'confirmed'
      and s.starts_at > now()
    returning b.charged_to, b.credit_type
  ),
  addon_refunds as (
    update profiles p
    set addon_credits = p.addon_credits + r.n, updated_at = now()
    from (select charged_to, count(*) as n from released where credit_type = 'addon' group by charged_to) r
    where p.id = r.charged_to
    returning p.id
  )
  select count(*) into v_released_count from released;

  return v_released_count;
end;
$$;

-- 13. Household RPCs (the account holder manages up to household_max_people people, self included)
create or replace function invite_household_member(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_email text := lower(trim(p_email));
  v_owner profiles%rowtype;
  v_people int;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid email address.');
  end if;

  select * into v_cfg from app_config where id = 1;
  select * into v_owner from profiles where id = auth.uid() for update;
  if not found or v_owner.tier <> 'household' or v_owner.household_owner_id is not null then
    return jsonb_build_object('success', false, 'error', 'Only the Household account holder can invite people.');
  end if;

  select 1
    + (select count(*) from profiles where household_owner_id = v_owner.id)
    + (select count(*) from household_invites where owner_id = v_owner.id)
  into v_people;
  if v_people >= v_cfg.household_max_people then
    return jsonb_build_object('success', false, 'error',
      format('A Household has up to %s people.', v_cfg.household_max_people));
  end if;

  if exists (select 1 from profiles where lower(email) = v_email) then
    return jsonb_build_object('success', false, 'error',
      'That email already has a MeetDoConnect account. Use a different email for them.');
  end if;

  insert into household_invites (email, owner_id) values (v_email, v_owner.id)
  on conflict (email) do nothing;
  if not found then
    return jsonb_build_object('success', false, 'error', 'That email has already been invited.');
  end if;

  return jsonb_build_object('success', true, 'email', v_email);
end;
$$;

create or replace function cancel_household_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from household_invites where email = lower(trim(p_email)) and owner_id = auth.uid();
  if not found then
    return jsonb_build_object('success', false, 'error', 'Invite not found.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- The removed person keeps their sign-in but has no membership until they start their own.
create or replace function remove_household_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set household_owner_id = null,
      tier = 'individual',
      payment_status = 'canceled',
      monthly_credits = 0,
      credits_cycle_start = null,
      updated_at = now()
  where id = p_member_id and household_owner_id = auth.uid();
  if not found then
    return jsonb_build_object('success', false, 'error', 'That person is not in your household.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- 14. RPC: everything the Membership and My Sessions pages show, in one call
create or replace function get_my_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_me profiles%rowtype;
  v_payer profiles%rowtype;
  v_today date;
  v_week_used int;
  v_bhd_used int;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_cfg from app_config where id = 1;
  select * into v_me from profiles where id = auth.uid();
  if not found then
    return null;
  end if;
  if v_me.household_owner_id is null then
    v_payer := v_me;
  else
    select * into v_payer from profiles where id = v_me.household_owner_id;
  end if;
  v_is_owner := v_me.tier = 'household' and v_me.household_owner_id is null;
  v_today := (now() at time zone v_cfg.tz)::date;

  select count(*) into v_week_used
  from bookings b join sessions s on s.id = b.session_id
  where b.user_id = v_me.id
    and b.credit_type = 'monthly'
    and b.status in ('confirmed', 'attended', 'late_cancelled')
    and date_trunc('week', s.starts_at at time zone v_cfg.tz) = date_trunc('week', now() at time zone v_cfg.tz);

  select count(*) into v_bhd_used
  from bookings b join sessions s on s.id = b.session_id
  where b.user_id = v_me.id
    and b.camera_off
    and b.status in ('confirmed', 'attended', 'late_cancelled')
    and date_trunc('month', s.starts_at at time zone v_cfg.tz) = date_trunc('month', now() at time zone v_cfg.tz);

  return jsonb_build_object(
    'tier', v_me.tier,
    'billing_interval', v_payer.billing_interval,
    'payment_status', v_payer.payment_status,
    'role', case when v_me.household_owner_id is not null then 'member'
                 when v_is_owner then 'owner' else 'individual' end,
    'monthly_left', v_payer.monthly_credits,
    'monthly_total', plan_credits(v_payer.tier),
    'addon_left', v_payer.addon_credits,
    'week_used', v_week_used,
    'week_limit', v_cfg.max_weekly_sessions,
    'bhd_left', greatest(v_cfg.bhd_per_month - v_bhd_used, 0),
    'bhd_total', v_cfg.bhd_per_month,
    'next_refill', next_cycle_start(v_payer.billing_date, v_today),
    'household', case when v_me.tier <> 'household' then null else jsonb_build_object(
      'max_people', v_cfg.household_max_people,
      'owner_name', trim(coalesce(v_payer.first_name, '') || ' ' || coalesce(v_payer.last_name, '')),
      'people', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id,
          'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
          'email', case when v_is_owner then p.email end,
          'is_owner', p.household_owner_id is null
        ) order by p.household_owner_id nulls first, p.created_at), '[]'::jsonb)
        from profiles p
        where p.id = v_payer.id or p.household_owner_id = v_payer.id
      ),
      'invites', case when v_is_owner then (
        select coalesce(jsonb_agg(i.email order by i.created_at), '[]'::jsonb)
        from household_invites i where i.owner_id = v_me.id
      ) end
    ) end
  );
end;
$$;

-- 15. Row Level Security Policies
alter table app_config enable row level security;
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table bookings enable row level security;
alter table household_invites enable row level security;

drop policy if exists "Anyone can read app_config" on app_config;
create policy "Anyone can read app_config" on app_config for select using (true);

-- Admin checks go through is_admin() (security definer). A policy on profiles that queried
-- profiles directly would recurse forever.
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id or household_owner_id = auth.uid() or is_admin());

-- Members may only edit their name and photo. Credits, plan, payment status and is_admin change
-- through the functions above (security definer), never from the browser.
drop policy if exists "Users can update own display details" on profiles;
create policy "Users can update own display details" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);
revoke insert, update, delete on profiles from anon, authenticated;
grant update (first_name, last_name, avatar_url) on profiles to authenticated;

drop policy if exists "Published sessions viewable by all" on sessions;
create policy "Published sessions viewable by all" on sessions
  for select using (published = true or is_admin());
revoke insert, update, delete on sessions from anon, authenticated;

drop policy if exists "Users can view own bookings" on bookings;
create policy "Users can view own bookings" on bookings
  for select using (auth.uid() = user_id or auth.uid() = charged_to or is_admin());
revoke insert, update, delete on bookings from anon, authenticated;

drop policy if exists "Owners can view their invites" on household_invites;
create policy "Owners can view their invites" on household_invites
  for select using (owner_id = auth.uid() or is_admin());
revoke insert, update, delete on household_invites from anon, authenticated;
revoke all on app_config from anon, authenticated;
grant select on app_config to anon, authenticated;

-- 16. Function Privileges (Supabase grants new functions to everyone by default)
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function refill_due_credits(uuid) from public, anon, authenticated;
revoke execute on function mark_payment_failed(uuid) from public, anon, authenticated;
revoke execute on function mark_payment_recovered(uuid) from public, anon, authenticated;
revoke execute on function enforce_failed_payment_grace() from public, anon, authenticated;

revoke execute on function book_session(uuid, boolean) from public, anon;
grant execute on function book_session(uuid, boolean) to authenticated;
revoke execute on function cancel_booking(uuid) from public, anon;
grant execute on function cancel_booking(uuid) to authenticated;
revoke execute on function get_my_membership() from public, anon;
grant execute on function get_my_membership() to authenticated;
revoke execute on function invite_household_member(text) from public, anon;
grant execute on function invite_household_member(text) to authenticated;
revoke execute on function cancel_household_invite(text) from public, anon;
grant execute on function cancel_household_invite(text) to authenticated;
revoke execute on function remove_household_member(uuid) from public, anon;
grant execute on function remove_household_member(uuid) to authenticated;

-- 17. Schedules (pg_cron). Hourly is enough: both jobs skip anything not due yet.
create extension if not exists pg_cron;
select cron.schedule('mdc-refill-credits', '5 * * * *', 'select public.refill_due_credits()');
select cron.schedule('mdc-payment-grace', '10 * * * *', 'select public.enforce_failed_payment_grace()');
