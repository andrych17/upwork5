-- ========================================================================
-- MeetDoConnect Supabase Database Schema (Milestone 2, updated Oct 29, 2026)
--
-- Membership rules (Kelly, 28-29 Oct):
--   * Individual: 13 credits per billing month. Household: up to 4 people, each with their own
--     sign-in, sharing 16 credits per billing month on the account holder's profile.
--   * Up to 4 sessions a week (Monday to Sunday, Central time), counted for the whole Household or per person
--     (app_config.weekly_limit_scope). Set
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
-- Hello Video gate (section 19): off until Kelly decides whether booking waits for approval.
alter table app_config add column if not exists require_hello_video boolean not null default false;
-- With require_hello_video on, hello_hold_bookings lets people book before their video is approved. Their
-- bookings are held (seat and credit taken, no Join) and released if the video is declined or still not
-- approved an hour before the session starts. Off: people must be approved before they can book.
alter table app_config add column if not exists hello_hold_bookings boolean not null default false;
-- Who the weekly limit counts: 'household' = everyone on one plan shares it (Kelly 31 Oct: "4 each week, shared
-- between household members"), 'person' = each login has its own. Solo plans are the same either way.
alter table app_config add column if not exists weekly_limit_scope text not null default 'household';
alter table app_config drop constraint if exists app_config_weekly_limit_scope_check;
alter table app_config add constraint app_config_weekly_limit_scope_check check (weekly_limit_scope in ('person', 'household'));
-- Which reminders also go out by SMS for people who opted in (section 20). Each text costs about a cent.
alter table app_config add column if not exists sms_kinds text[] not null default '{1h}';

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
-- Hello Video review state (section 19) and reminder choices (section 20).
alter table profiles add column if not exists hello_status text not null default 'none';
alter table profiles add column if not exists hello_reviewed_at timestamptz;
alter table profiles drop constraint if exists profiles_hello_status_check;
alter table profiles add constraint profiles_hello_status_check
  check (hello_status in ('none', 'pending', 'approved', 'rejected', 'declined'));
alter table profiles add column if not exists reminder_email boolean not null default true;
alter table profiles add column if not exists sms_reminders boolean not null default false;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists sms_opt_in_at timestamptz;
alter table profiles drop constraint if exists profiles_phone_check;
alter table profiles add constraint profiles_phone_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

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
-- held = booked while the Hello Video was still waiting for review (section 19)
alter table bookings add column if not exists held boolean not null default false;
alter table bookings add column if not exists release_reason text;
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
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_full text;
  v_first text;
  v_last text;
begin
  -- Email sign-up sends first_name/last_name. Google sends given_name/family_name or only full_name.
  v_full := trim(coalesce(v_meta->>'full_name', v_meta->>'name', ''));
  v_first := coalesce(nullif(trim(v_meta->>'first_name'), ''), nullif(trim(v_meta->>'given_name'), ''),
                      nullif(split_part(v_full, ' ', 1), ''), 'Member');
  v_last := coalesce(nullif(trim(v_meta->>'last_name'), ''), nullif(trim(v_meta->>'family_name'), ''),
                     nullif(trim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)), ''), '');
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
      left(v_first, 80),
      left(v_last, 80),
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
    left(v_first, 80),
    left(v_last, 80),
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
  v_held boolean := false;
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

  -- Off until app_config.require_hello_video is turned on. Each person needs their own approved video.
  -- With hello_hold_bookings on, a person whose video is not approved yet can still book: the booking is held.
  if v_cfg.require_hello_video and v_me.hello_status <> 'approved' and not v_me.is_admin then
    if v_me.hello_status = 'declined' then
      return jsonb_build_object('success', false, 'error',
        'Your Hello Video was not approved, so this membership cannot book sessions. Please contact us.');
    elsif v_cfg.hello_hold_bookings then
      v_held := true;
    else
      return jsonb_build_object('success', false, 'error', case
        when v_me.hello_status = 'pending' then
          'Your Hello Video is waiting for a quick review. You can book as soon as it is approved.'
        else 'Record your Hello Video on the Membership page first, then book once it is approved.' end);
    end if;
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
  where case when v_cfg.weekly_limit_scope = 'household' then b.charged_to = v_payer.id else b.user_id = v_user_id end
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
      format('%s booked %s sessions for that week. Add an extra session to book this one.',
             case when v_cfg.weekly_limit_scope = 'household' and v_payer.id <> v_user_id
                  then 'Your household has' else 'You have' end,
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

  insert into bookings (session_id, user_id, charged_to, credit_type, camera_off, status, held)
  values (p_session_id, v_user_id, v_payer.id, v_credit_type, p_camera_off, 'confirmed', v_held)
  returning id into v_new_booking_id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_new_booking_id,
    'credit_type', v_credit_type,
    'held', v_held
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
  where case when v_cfg.weekly_limit_scope = 'household' then b.charged_to = v_payer.id else b.user_id = v_me.id end
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
    'week_limit_shared', v_cfg.weekly_limit_scope = 'household' and v_me.tier = 'household',
    'bhd_left', greatest(v_cfg.bhd_per_month - v_bhd_used, 0),
    'bhd_total', v_cfg.bhd_per_month,
    'next_refill', next_cycle_start(v_payer.billing_date, v_today),
    'hello_status', v_me.hello_status,
    'hello_required', v_cfg.require_hello_video,
    'hello_hold', v_cfg.hello_hold_bookings,
    'reminders', jsonb_build_object(
      'email', v_me.reminder_email,
      'sms', v_me.sms_reminders,
      'phone', v_me.phone
    ),
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
select cron.schedule('mdc-release-holds', '*/5 * * * *', 'select public.release_unapproved_holds()');

-- 18. Give credits (admin, customer service, Kelly 29 Oct)
-- Adds extra credits: they never expire and can go past the weekly limit. Household credits are
-- shared, so they land on the account holder. Every grant is logged. Money refunds happen in the
-- payment processor's dashboard.
create table if not exists credit_grants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  for_profile_id uuid references profiles(id) on delete set null,
  amount int not null check (amount between 1 and 50),
  reason text not null check (length(reason) between 1 and 300),
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_grants_profile on credit_grants (profile_id, created_at desc);
create index if not exists idx_credit_grants_for_profile on credit_grants (for_profile_id);
create index if not exists idx_credit_grants_granted_by on credit_grants (granted_by);

create or replace function admin_give_credits(p_profile uuid, p_amount int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target profiles%rowtype;
  v_payer_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_balance int;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can give credits.');
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    return jsonb_build_object('success', false, 'error', 'Give between 1 and 50 credits.');
  end if;
  if v_reason = '' or length(v_reason) > 300 then
    return jsonb_build_object('success', false, 'error', 'Add a short reason (up to 300 characters).');
  end if;

  select * into v_target from profiles where id = p_profile;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Member not found.');
  end if;
  v_payer_id := coalesce(v_target.household_owner_id, v_target.id);

  update profiles
  set addon_credits = addon_credits + p_amount, updated_at = now()
  where id = v_payer_id
  returning addon_credits into v_balance;

  insert into credit_grants (profile_id, for_profile_id, amount, reason, granted_by)
  values (v_payer_id, v_target.id, p_amount, v_reason, auth.uid());

  return jsonb_build_object(
    'success', true,
    'credited_to', v_payer_id,
    'shared', v_payer_id <> v_target.id,
    'addon_credits', v_balance
  );
end;
$$;

alter table credit_grants enable row level security;
drop policy if exists "Admins can view credit grants" on credit_grants;
create policy "Admins can view credit grants" on credit_grants for select using (is_admin());
revoke insert, update, delete on credit_grants from anon, authenticated;

revoke execute on function admin_give_credits(uuid, int, text) from public, anon;
grant execute on function admin_give_credits(uuid, int, text) to authenticated;

-- 19. Hello Video (Kelly 29 Oct): 30 to 120 seconds per person, only admins watch it.
-- Files live in a private Cloudflare R2 bucket. The hello-video Edge Function checks who is
-- asking, signs short-lived upload and viewing links, and calls the functions below with the
-- service role. A file is deleted as soon as it is reviewed (approved or not).
create table if not exists hello_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  object_key text not null unique,
  mime_type text not null check (mime_type in ('video/webm', 'video/mp4')),
  size_bytes bigint not null check (size_bytes between 1 and 104857600),
  duration_seconds int not null check (duration_seconds between 30 and 125),
  -- replaced = the person recorded again before a review
  status text not null default 'uploading'
    check (status in ('uploading', 'pending', 'approved', 'rejected', 'replaced')),
  reject_reason text check (length(reject_reason) <= 300),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_hello_videos_user on hello_videos (user_id, created_at desc);
create index if not exists idx_hello_videos_status on hello_videos (status, created_at);
create index if not exists idx_hello_videos_reviewed_by on hello_videos (reviewed_by);

-- A new recording. Earlier unreviewed tries are marked replaced; the caller deletes their files.
create or replace function hello_video_start(p_user uuid, p_mime text, p_size bigint, p_duration int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me profiles%rowtype;
  v_id uuid := gen_random_uuid();
  v_key text;
  v_old jsonb;
begin
  select * into v_me from profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Profile not found.');
  end if;
  if v_me.hello_status = 'approved' then
    return jsonb_build_object('success', false, 'error', 'Your Hello Video is already approved.');
  end if;
  if v_me.hello_status = 'declined' then
    return jsonb_build_object('success', false, 'error', 'Your Hello Video was not approved. Please contact us.');
  end if;
  if p_mime is null or p_mime not in ('video/webm', 'video/mp4') then
    return jsonb_build_object('success', false, 'error', 'This browser recorded an unsupported video type.');
  end if;
  if p_size is null or p_size < 1 or p_size > 104857600 then
    return jsonb_build_object('success', false, 'error', 'The video is too large. Please record a shorter one.');
  end if;
  if p_duration is null or p_duration < 30 or p_duration > 125 then
    return jsonb_build_object('success', false, 'error', 'Hello Videos are 30 to 120 seconds long.');
  end if;
  if (select count(*) from hello_videos where user_id = p_user and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('success', false, 'error', 'Too many tries today. Please record again tomorrow.');
  end if;

  with old as (
    update hello_videos set status = 'replaced'
    where user_id = p_user and status in ('uploading', 'pending')
    returning object_key
  )
  select coalesce(jsonb_agg(object_key), '[]'::jsonb) into v_old from old;

  v_key := format('hello/%s/%s.%s', p_user, v_id, case when p_mime = 'video/mp4' then 'mp4' else 'webm' end);
  insert into hello_videos (id, user_id, object_key, mime_type, size_bytes, duration_seconds)
  values (v_id, p_user, v_key, p_mime, p_size, p_duration);

  update profiles set hello_status = 'none', updated_at = now()
  where id = p_user and hello_status = 'pending';

  return jsonb_build_object('success', true, 'id', v_id, 'key', v_key, 'replaced_keys', v_old);
end;
$$;

-- The file is in R2 (the caller checked its real size). It now waits for an admin.
create or replace function hello_video_uploaded(p_user uuid, p_id uuid, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update hello_videos set status = 'pending', size_bytes = p_size
  where id = p_id and user_id = p_user and status = 'uploading';
  if not found then
    return jsonb_build_object('success', false, 'error', 'That upload was replaced. Please record again.');
  end if;
  update profiles set hello_status = 'pending', hello_reviewed_at = null, updated_at = now() where id = p_user;
  return jsonb_build_object('success', true);
end;
$$;

-- Oldest first, for the admin review list.
create or replace function hello_video_queue(p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'key', v.object_key,
    'mime_type', v.mime_type,
    'size_bytes', v.size_bytes,
    'duration_seconds', v.duration_seconds,
    'created_at', v.created_at,
    'user_id', p.id,
    'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
    'email', p.email,
    'tier', p.tier,
    'household_member', p.household_owner_id is not null
  ) order by v.created_at), '[]'::jsonb)
  from (
    select * from hello_videos where status = 'pending' order by created_at limit least(greatest(p_limit, 1), 200)
  ) v
  join profiles p on p.id = v.user_id;
$$;

-- p_admin comes from the verified sign-in in the Edge Function and is checked again here.
drop function if exists hello_video_review(uuid, uuid, boolean, text);
-- p_approve true: approved, held bookings become real. p_approve false: asked to record again (held bookings stay
-- held). p_approve false and p_release true: declined, held bookings are released and the credits go back.
create or replace function hello_video_review(
  p_admin uuid, p_id uuid, p_approve boolean, p_reason text default null, p_release boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video hello_videos%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 300), '');
  v_status text := case when p_approve then 'approved' when p_release then 'declined' else 'rejected' end;
  v_released int := 0;
begin
  if not exists (select 1 from profiles where id = p_admin and is_admin) then
    return jsonb_build_object('success', false, 'error', 'Only an admin can review Hello Videos.');
  end if;
  select * into v_video from hello_videos where id = p_id for update;
  if not found or v_video.status <> 'pending' then
    return jsonb_build_object('success', false, 'error', 'This video was already reviewed or replaced.');
  end if;

  update hello_videos
  set status = case when p_approve then 'approved' else 'rejected' end,
      reject_reason = case when p_approve then null else v_reason end,
      reviewed_by = p_admin,
      reviewed_at = now()
  where id = p_id;

  update profiles
  set hello_status = v_status,
      hello_reviewed_at = now(),
      updated_at = now()
  where id = v_video.user_id;

  if p_approve then
    update bookings set held = false where user_id = v_video.user_id and held and status = 'confirmed';
  elsif p_release then
    v_released := release_held_bookings(v_video.user_id, coalesce(v_reason, 'Hello Video not approved'), false);
  end if;

  insert into member_notices (user_id, kind, note)
  values (v_video.user_id, case v_status when 'approved' then 'hello_approved'
                                         when 'declined' then 'hello_declined' else 'hello_redo' end, v_reason);

  return jsonb_build_object('success', true, 'status', v_status, 'released', v_released);
end;
$$;

-- Gives a held booking back: the seat is freed and the credit returns to whoever paid for it.
create or replace function release_held_booking(p_booking_id uuid, p_reason text, p_notify boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b bookings%rowtype;
  v_payer profiles%rowtype;
begin
  select * into v_b from bookings where id = p_booking_id and held and status = 'confirmed' for update;
  if not found then
    return false;
  end if;
  select * into v_payer from profiles where id = v_b.charged_to for update;
  if v_b.credit_type = 'monthly' then
    update profiles
    set monthly_credits = least(monthly_credits + 1, plan_credits(v_payer.tier)), updated_at = now()
    where id = v_payer.id;
  else
    update profiles set addon_credits = addon_credits + 1, updated_at = now() where id = v_payer.id;
  end if;
  update bookings set status = 'cancelled', cancelled_at = now(), release_reason = left(p_reason, 300)
  where id = p_booking_id;
  if p_notify then
    insert into member_notices (user_id, kind, note)
    values (v_b.user_id, 'hold_released', (select title from sessions where id = v_b.session_id));
  end if;
  return true;
end;
$$;

create or replace function release_held_bookings(p_user uuid, p_reason text, p_notify boolean default true)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in select id from bookings where user_id = p_user and held and status = 'confirmed' order by created_at loop
    if release_held_booking(v_id, p_reason, p_notify) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- Run every 5 minutes (section 17): a booking still held an hour before its session starts is released,
-- so a seat is never kept for someone who cannot join.
create or replace function release_unapproved_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select b.id from bookings b join sessions s on s.id = b.session_id
    where b.held and b.status = 'confirmed' and s.starts_at <= now() + interval '1 hour'
    order by s.starts_at
  loop
    if release_held_booking(v_id, 'Hello Video not approved in time') then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

alter table hello_videos enable row level security;
drop policy if exists "People see their own Hello Video" on hello_videos;
create policy "People see their own Hello Video" on hello_videos
  for select using (auth.uid() = user_id or is_admin());
revoke insert, update, delete on hello_videos from anon, authenticated;

revoke execute on function hello_video_start(uuid, text, bigint, int) from public, anon, authenticated;
revoke execute on function hello_video_uploaded(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function hello_video_queue(int) from public, anon, authenticated;
revoke execute on function hello_video_review(uuid, uuid, boolean, text, boolean) from public, anon, authenticated;
revoke execute on function release_held_booking(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function release_held_bookings(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function release_unapproved_holds() from public, anon, authenticated;
grant execute on function hello_video_start(uuid, text, bigint, int) to service_role;
grant execute on function hello_video_uploaded(uuid, uuid, bigint) to service_role;
grant execute on function hello_video_queue(int) to service_role;
grant execute on function hello_video_review(uuid, uuid, boolean, text, boolean) to service_role;

-- 19b. Declined people and the refund list (Kelly 31 Oct). The refund itself is done in the payment processor;
-- this only remembers who still needs one.
alter table profiles add column if not exists hello_refunded_at timestamptz;

create or replace function hello_declined_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can see this list.');
  end if;
  return jsonb_build_object('success', true, 'items', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
      'email', p.email,
      'plan', coalesce(payer.tier, p.tier) || ' ' || coalesce(payer.billing_interval, p.billing_interval),
      'declined_at', p.hello_reviewed_at,
      'refunded_at', p.hello_refunded_at
    ) order by (p.hello_refunded_at is not null), p.hello_reviewed_at desc), '[]'::jsonb)
    from profiles p
    left join profiles payer on payer.id = p.household_owner_id
    where p.hello_status = 'declined'
  ));
end;
$$;

create or replace function hello_mark_refunded(p_user uuid, p_done boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can do this.');
  end if;
  update profiles
  set hello_refunded_at = case when p_done then now() else null end, updated_at = now()
  where id = p_user and hello_status = 'declined';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This person was not declined.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function hello_declined_list() from public, anon;
grant execute on function hello_declined_list() to authenticated;
revoke execute on function hello_mark_refunded(uuid, boolean) from public, anon;
grant execute on function hello_mark_refunded(uuid, boolean) to authenticated;

-- 19c. Emails about the Hello Video and held bookings (approved, record again, declined, hold released).
-- Written here when it happens; the send-reminders Edge Function claims them every 5 minutes and sends them
-- by email (Resend). Claimed before sending, so a crash never sends one twice.
create table if not exists member_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('hello_approved', 'hello_redo', 'hello_declined', 'hold_released')),
  note text check (length(note) <= 300),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  email_sent boolean,
  error text
);
create index if not exists idx_member_notices_unclaimed on member_notices (created_at) where claimed_at is null;
create index if not exists idx_member_notices_user on member_notices (user_id);

alter table member_notices enable row level security;
drop policy if exists "Admins can view notices" on member_notices;
create policy "Admins can view notices" on member_notices for select using (is_admin());
revoke insert, update, delete on member_notices from anon, authenticated;

create or replace function claim_member_notices(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  with due as (
    select id from member_notices
    where claimed_at is null
    order by created_at
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  ),
  claimed as (
    update member_notices n set claimed_at = now()
    from due where n.id = due.id
    returning n.id, n.user_id, n.kind, n.note
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'kind', c.kind,
    'note', c.note,
    'first_name', p.first_name,
    'email', p.email,
    'held_count', (select count(*) from bookings b where b.user_id = c.user_id and b.held and b.status = 'confirmed')
  )), '[]'::jsonb)
  into v_items
  from claimed c join profiles p on p.id = c.user_id;
  return v_items;
end;
$$;

create or replace function record_notice_results(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update member_notices n
  set email_sent = (r->>'email_sent')::boolean, error = left(r->>'error', 300)
  from jsonb_array_elements(p_results) r
  where n.id = (r->>'id')::uuid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function claim_member_notices(int) from public, anon, authenticated;
revoke execute on function record_notice_results(jsonb) from public, anon, authenticated;
grant execute on function claim_member_notices(int) to service_role;
grant execute on function record_notice_results(jsonb) to service_role;

-- 20. Reminders 24 hours and 1 hour before each booked session (Kelly 30 Oct)
-- The send-reminders Edge Function runs every 5 minutes (supabase/cron-reminders.sql), claims what
-- is due here, and sends app notifications, email (Resend) and SMS (Twilio, opt-in).
-- Only the browsers' own push services are accepted as endpoints, so the sender never posts to
-- an address a member made up.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique check (
    length(endpoint) <= 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$'),
  user_agent text check (length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id, created_at);

-- One row per booking and reminder: a second run can never send the same reminder again.
create table if not exists reminder_log (
  booking_id uuid not null references bookings(id) on delete cascade,
  kind text not null check (kind in ('24h', '1h')),
  claimed_at timestamptz not null default now(),
  push_sent int,
  email_sent boolean,
  sms_sent boolean,
  error text,
  primary key (booking_id, kind)
);

create index if not exists idx_reminder_log_claimed on reminder_log (claimed_at);

-- This device gets this person's reminders. A device signed in to a new account moves over.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  begin
    insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
          user_agent = excluded.user_agent, created_at = now();
  exception when check_violation then
    return jsonb_build_object('success', false, 'error', 'This browser''s notification service is not supported.');
  end;
  -- Keep the 10 newest devices per person.
  delete from push_subscriptions
  where user_id = auth.uid()
    and id not in (select id from push_subscriptions where user_id = auth.uid() order by created_at desc limit 10);
  return jsonb_build_object('success', true);
end;
$$;

create or replace function delete_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
  return jsonb_build_object('success', true);
end;
$$;

-- Email reminders are on by default. SMS needs a US/international number in +15551234567 form and
-- an explicit opt-in (carrier rules); the opt-in time is kept.
create or replace function set_reminder_prefs(p_email boolean, p_sms boolean, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'), '');
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('success', false, 'error', 'Enter the phone number with country code, like +15551234567.');
  end if;
  if coalesce(p_sms, false) and v_phone is null then
    return jsonb_build_object('success', false, 'error', 'Add a phone number to get text reminders.');
  end if;

  update profiles
  set reminder_email = coalesce(p_email, reminder_email),
      sms_reminders = coalesce(p_sms, false),
      phone = v_phone,
      sms_opt_in_at = case when coalesce(p_sms, false) then coalesce(sms_opt_in_at, now()) end,
      updated_at = now()
  where id = auth.uid();
  return jsonb_build_object('success', true);
end;
$$;

-- Claims the reminders that are due, so each one goes out once even if two runs overlap.
-- 24h: sessions starting within 24 hours that were booked at least 24 hours ahead, skipped once
-- the 1h reminder is due. 1h: sessions starting within the hour, booked at least an hour ahead.
create or replace function claim_due_reminders(p_limit int default 300)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_items jsonb;
begin
  select * into v_cfg from app_config where id = 1;

  with due as (
    select b.id as booking_id, k.kind
    from bookings b
    join sessions s on s.id = b.session_id
    cross join (values ('24h', interval '24 hours'), ('1h', interval '1 hour')) as k(kind, lead_time)
    where b.status = 'confirmed'
      and not b.held
      and s.starts_at > now()
      and s.starts_at <= now() + k.lead_time
      and b.created_at <= s.starts_at - k.lead_time
      and (k.kind = '1h' or s.starts_at > now() + interval '1 hour')
      and not exists (select 1 from reminder_log r where r.booking_id = b.id and r.kind = k.kind)
    order by s.starts_at
    limit least(greatest(p_limit, 1), 1000)
  ),
  claimed as (
    insert into reminder_log (booking_id, kind)
    select booking_id, kind from due
    on conflict do nothing
    returning booking_id, kind
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', c.booking_id,
    'kind', c.kind,
    'user_id', p.id,
    'first_name', p.first_name,
    'email', case when p.reminder_email then p.email end,
    'phone', case when p.sms_reminders and c.kind = any(v_cfg.sms_kinds) then p.phone end,
    'title', s.title,
    'slug', s.slug,
    'prep', s.prep,
    'starts_at', s.starts_at,
    'minutes', s.minutes,
    'push', (
      select coalesce(jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)), '[]'::jsonb)
      from push_subscriptions ps where ps.user_id = p.id
    )
  ) order by s.starts_at), '[]'::jsonb)
  into v_items
  from claimed c
  join bookings b on b.id = c.booking_id
  join sessions s on s.id = b.session_id
  join profiles p on p.id = b.user_id;

  return jsonb_build_object('tz', v_cfg.tz, 'items', v_items);
end;
$$;

-- What the sender managed to send, one row per claimed reminder, in one call.
create or replace function record_reminder_results(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update reminder_log r
  set push_sent = x.push_sent, email_sent = x.email_sent, sms_sent = x.sms_sent, error = left(x.error, 500)
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb))
    as x(booking_id uuid, kind text, push_sent int, email_sent boolean, sms_sent boolean, error text)
  where r.booking_id = x.booking_id and r.kind = x.kind;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The push service said these devices are gone (404 or 410).
create or replace function delete_push_endpoints(p_endpoints text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from push_subscriptions where endpoint = any(coalesce(p_endpoints, '{}'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table push_subscriptions enable row level security;
alter table reminder_log enable row level security;
drop policy if exists "People see their own devices" on push_subscriptions;
create policy "People see their own devices" on push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "Admins can view reminder log" on reminder_log;
create policy "Admins can view reminder log" on reminder_log for select using (is_admin());
revoke insert, update, delete on push_subscriptions from anon, authenticated;
revoke insert, update, delete on reminder_log from anon, authenticated;

revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;
revoke execute on function delete_push_subscription(text) from public, anon;
grant execute on function delete_push_subscription(text) to authenticated;
revoke execute on function set_reminder_prefs(boolean, boolean, text) from public, anon;
grant execute on function set_reminder_prefs(boolean, boolean, text) to authenticated;
revoke execute on function claim_due_reminders(int) from public, anon, authenticated;
revoke execute on function record_reminder_results(jsonb) from public, anon, authenticated;
revoke execute on function delete_push_endpoints(text[]) from public, anon, authenticated;
grant execute on function claim_due_reminders(int) to service_role;
grant execute on function record_reminder_results(jsonb) to service_role;
grant execute on function delete_push_endpoints(text[]) to service_role;

-- 21. Admin management (members, bookings, sessions, settings). Every change is logged in admin_log.
-- Browsers can only read; all writes go through these functions, and each checks is_admin() first.
alter table profiles add column if not exists disabled_at timestamptz;

create table if not exists admin_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_log_created on admin_log (created_at desc);
create index if not exists idx_admin_log_admin on admin_log (admin_id);
create index if not exists idx_admin_log_profile on admin_log (profile_id);
create index if not exists idx_admin_log_session on admin_log (session_id);

alter table admin_log enable row level security;
drop policy if exists "Admins can view admin log" on admin_log;
create policy "Admins can view admin log" on admin_log for select using (is_admin());
revoke insert, update, delete on admin_log from anon, authenticated;

-- Cancels confirmed future bookings. With p_refund the credit goes back to whoever paid
-- (monthly credits capped at the plan size, like cancel_booking). Internal: no admin check here.
create or replace function admin_release_bookings(p_ids uuid[], p_refund boolean, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with released as (
    update bookings b
    set status = case when p_refund then 'cancelled' else 'late_cancelled' end,
        cancelled_at = now(),
        held = false,
        release_reason = left(p_reason, 300)
    from sessions s
    where b.id = any(p_ids)
      and b.session_id = s.id
      and b.status = 'confirmed'
      and s.starts_at > now()
    returning b.charged_to, b.credit_type
  ),
  refunds as (
    update profiles p
    set monthly_credits = least(p.monthly_credits + r.m, plan_credits(p.tier)),
        addon_credits = p.addon_credits + r.a,
        updated_at = now()
    from (
      select charged_to,
             count(*) filter (where credit_type = 'monthly')::int as m,
             count(*) filter (where credit_type = 'addon')::int as a
      from released group by charged_to
    ) r
    where p_refund and p.id = r.charged_to
    returning p.id
  )
  select count(*) into v_count from released;
  return v_count;
end;
$$;

-- Plan and payment status. Household members share the account holder's plan, so they are
-- changed on the holder. Credits already given this month stay (capped at the new plan size);
-- use Give credits for anything extra.
create or replace function admin_update_member(
  p_profile uuid,
  p_tier text,
  p_billing_interval text,
  p_payment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p profiles%rowtype;
  v_people int;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change members.');
  end if;
  if p_tier not in ('individual', 'household')
     or p_billing_interval not in ('monthly', 'annual')
     or p_payment_status not in ('active', 'past_due', 'paused', 'canceled') then
    return jsonb_build_object('success', false, 'error', 'Unknown plan or status.');
  end if;

  select * into v_p from profiles where id = p_profile for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Member not found.');
  end if;
  if v_p.household_owner_id is not null then
    return jsonb_build_object('success', false, 'error',
      'This person is part of a Household. Change the plan on the account holder.');
  end if;
  if v_p.tier = 'household' and p_tier = 'individual' then
    select count(*) into v_people from profiles where household_owner_id = v_p.id;
    if v_people > 0 then
      return jsonb_build_object('success', false, 'error',
        'Remove the other Household people first, then switch to Solo.');
    end if;
  end if;

  if p_payment_status = 'past_due' and v_p.payment_status <> 'past_due' then
    perform mark_payment_failed(v_p.id);
  elsif p_payment_status = 'active' and v_p.payment_status <> 'active' then
    perform mark_payment_recovered(v_p.id);
  elsif p_payment_status <> v_p.payment_status then
    update profiles set payment_status = p_payment_status, updated_at = now() where id = v_p.id;
  end if;

  update profiles
  set tier = p_tier,
      billing_interval = p_billing_interval,
      monthly_credits = least(monthly_credits, plan_credits(p_tier)),
      updated_at = now()
  where id = v_p.id;

  insert into admin_log (admin_id, profile_id, action, details)
  values (auth.uid(), v_p.id, 'member_updated', jsonb_build_object(
    'from', jsonb_build_object('tier', v_p.tier, 'billing_interval', v_p.billing_interval,
                               'payment_status', v_p.payment_status),
    'to', jsonb_build_object('tier', p_tier, 'billing_interval', p_billing_interval,
                             'payment_status', p_payment_status)));

  return jsonb_build_object('success', true);
end;
$$;

create or replace function admin_set_admin(p_profile uuid, p_is_admin boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change admins.');
  end if;
  if p_profile = auth.uid() then
    return jsonb_build_object('success', false, 'error', 'You cannot change your own admin access.');
  end if;
  update profiles set is_admin = coalesce(p_is_admin, false), updated_at = now() where id = p_profile;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Member not found.');
  end if;
  insert into admin_log (admin_id, profile_id, action)
  values (auth.uid(), p_profile, case when p_is_admin then 'admin_granted' else 'admin_removed' end);
  return jsonb_build_object('success', true);
end;
$$;

-- Turning a member off blocks sign-in (auth ban), signs them out of every device, and cancels
-- their future bookings with the credit returned. Turning them back on lifts the ban only.
create or replace function admin_set_disabled(p_profile uuid, p_disabled boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_released int := 0;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can turn members off.');
  end if;
  if p_profile = auth.uid() then
    return jsonb_build_object('success', false, 'error', 'You cannot turn off your own account.');
  end if;
  if p_disabled and (v_reason = '' or length(v_reason) > 300) then
    return jsonb_build_object('success', false, 'error', 'Add a short reason (up to 300 characters).');
  end if;

  perform 1 from profiles where id = p_profile for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Member not found.');
  end if;

  if p_disabled then
    update profiles set disabled_at = coalesce(disabled_at, now()), updated_at = now() where id = p_profile;
    update auth.users set banned_until = 'infinity' where id = p_profile;
    delete from auth.sessions where user_id = p_profile;
    v_released := admin_release_bookings(
      array(select id from bookings where user_id = p_profile and status = 'confirmed'),
      true, 'Account turned off by admin');
  else
    update profiles set disabled_at = null, updated_at = now() where id = p_profile;
    update auth.users set banned_until = null where id = p_profile;
  end if;

  insert into admin_log (admin_id, profile_id, action, details)
  values (auth.uid(), p_profile, case when p_disabled then 'member_disabled' else 'member_enabled' end,
          jsonb_build_object('reason', nullif(v_reason, ''), 'bookings_cancelled', v_released));

  return jsonb_build_object('success', true, 'bookings_cancelled', v_released);
end;
$$;

create or replace function admin_cancel_booking(p_booking uuid, p_refund boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b bookings%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can cancel bookings for members.');
  end if;
  if v_reason = '' or length(v_reason) > 300 then
    return jsonb_build_object('success', false, 'error', 'Add a short reason (up to 300 characters).');
  end if;
  select * into v_b from bookings where id = p_booking for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;
  if admin_release_bookings(array[p_booking], coalesce(p_refund, true), v_reason) = 0 then
    return jsonb_build_object('success', false, 'error',
      'Only confirmed bookings for sessions that have not started can be cancelled.');
  end if;
  insert into admin_log (admin_id, profile_id, session_id, action, details)
  values (auth.uid(), v_b.user_id, v_b.session_id, 'booking_cancelled',
          jsonb_build_object('booking_id', p_booking, 'refunded', coalesce(p_refund, true), 'reason', v_reason));
  return jsonb_build_object('success', true, 'refunded', coalesce(p_refund, true));
end;
$$;

-- Create (p_id null) or edit a session. Capacity cannot go below the seats already booked.
create or replace function admin_save_session(
  p_id uuid,
  p_title text,
  p_blurb text,
  p_host text,
  p_prep text,
  p_starts_at timestamptz,
  p_minutes int,
  p_capacity int,
  p_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_host text := coalesce(nullif(trim(coalesce(p_host, '')), ''), 'Kelly C.');
  v_booked int := 0;
  v_id uuid;
  v_slug text;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change sessions.');
  end if;
  if v_title = '' or length(v_title) > 120 then
    return jsonb_build_object('success', false, 'error', 'Title is required (up to 120 characters).');
  end if;
  if length(coalesce(p_blurb, '')) > 500 or length(coalesce(p_prep, '')) > 500 or length(v_host) > 80 then
    return jsonb_build_object('success', false, 'error', 'Description and prep notes are up to 500 characters.');
  end if;
  if p_starts_at is null then
    return jsonb_build_object('success', false, 'error', 'Pick a start time.');
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then
    return jsonb_build_object('success', false, 'error', 'Length must be 15 to 240 minutes.');
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 12 then
    return jsonb_build_object('success', false, 'error', 'Seats must be 1 to 12 (the video room holds 12).');
  end if;

  if p_id is null then
    v_slug := trim(both '-' from regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'))
              || '-' || to_char(p_starts_at at time zone 'UTC', 'YYYYMMDD-HH24MI');
    insert into sessions (slug, title, blurb, host, prep, starts_at, minutes, capacity, published)
    values (v_slug, v_title, nullif(trim(coalesce(p_blurb, '')), ''), v_host, nullif(trim(coalesce(p_prep, '')), ''),
            p_starts_at, p_minutes, p_capacity, coalesce(p_published, false))
    on conflict (slug) do nothing
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('success', false, 'error', 'A session with this title already starts at that time.');
    end if;
  else
    perform 1 from sessions where id = p_id for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Session not found.');
    end if;
    select count(*) into v_booked from bookings where session_id = p_id and status = 'confirmed';
    if p_capacity < v_booked then
      return jsonb_build_object('success', false, 'error',
        format('%s seats are already booked. Cancel some bookings before lowering the seats.', v_booked));
    end if;
    update sessions
    set title = v_title, blurb = nullif(trim(coalesce(p_blurb, '')), ''), host = v_host,
        prep = nullif(trim(coalesce(p_prep, '')), ''), starts_at = p_starts_at, minutes = p_minutes,
        capacity = p_capacity, published = coalesce(p_published, false)
    where id = p_id;
    v_id := p_id;
  end if;

  insert into admin_log (admin_id, session_id, action, details)
  values (auth.uid(), v_id, case when p_id is null then 'session_created' else 'session_updated' end,
          jsonb_build_object('title', v_title, 'starts_at', p_starts_at, 'published', coalesce(p_published, false)));
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

-- Only sessions nobody ever booked can be deleted; otherwise unpublish them.
create or replace function admin_delete_session(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can delete sessions.');
  end if;
  select title into v_title from sessions where id = p_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Session not found.');
  end if;
  if exists (select 1 from bookings where session_id = p_id) then
    return jsonb_build_object('success', false, 'error',
      'This session has bookings. Unpublish it instead, so the history stays.');
  end if;
  delete from sessions where id = p_id;
  insert into admin_log (admin_id, action, details)
  values (auth.uid(), 'session_deleted', jsonb_build_object('session_id', p_id, 'title', v_title));
  return jsonb_build_object('success', true);
end;
$$;

-- Settings. Only the keys below can change; anything else is refused.
create or replace function admin_update_config(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old app_config%rowtype;
  v_new app_config%rowtype;
  v_unknown text;
  v_int_keys text[] := array['monthly_credits', 'household_monthly_credits', 'household_max_people',
    'welcome_trial_days', 'welcome_credits', 'cancel_hours', 'grace_days', 'bhd_per_month',
    'booking_closes_minutes', 'book_ahead_days'];
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change settings.');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    return jsonb_build_object('success', false, 'error', 'Nothing to save.');
  end if;
  select k into v_unknown from jsonb_object_keys(p) k
  where k <> all (v_int_keys || array['max_weekly_sessions', 'weekly_limit_scope', 'require_hello_video',
                                      'hello_hold_bookings', 'sms_kinds'])
  limit 1;
  if v_unknown is not null then
    return jsonb_build_object('success', false, 'error', format('Unknown setting: %s', v_unknown));
  end if;
  if exists (select 1 from jsonb_each(p) e where e.key = any(v_int_keys) and jsonb_typeof(e.value) <> 'number')
     or (p ? 'max_weekly_sessions' and jsonb_typeof(p->'max_weekly_sessions') not in ('number', 'null'))
     or (p ? 'require_hello_video' and jsonb_typeof(p->'require_hello_video') <> 'boolean')
     or (p ? 'hello_hold_bookings' and jsonb_typeof(p->'hello_hold_bookings') <> 'boolean')
     or (p ? 'sms_kinds' and jsonb_typeof(p->'sms_kinds') <> 'array') then
    return jsonb_build_object('success', false, 'error', 'A setting has the wrong type.');
  end if;

  select * into v_old from app_config where id = 1 for update;
  v_new := v_old;
  v_new.monthly_credits := coalesce((p->>'monthly_credits')::int, v_old.monthly_credits);
  v_new.household_monthly_credits := coalesce((p->>'household_monthly_credits')::int, v_old.household_monthly_credits);
  v_new.household_max_people := coalesce((p->>'household_max_people')::int, v_old.household_max_people);
  v_new.welcome_trial_days := coalesce((p->>'welcome_trial_days')::int, v_old.welcome_trial_days);
  v_new.welcome_credits := coalesce((p->>'welcome_credits')::int, v_old.welcome_credits);
  v_new.cancel_hours := coalesce((p->>'cancel_hours')::int, v_old.cancel_hours);
  v_new.grace_days := coalesce((p->>'grace_days')::int, v_old.grace_days);
  v_new.bhd_per_month := coalesce((p->>'bhd_per_month')::int, v_old.bhd_per_month);
  v_new.booking_closes_minutes := coalesce((p->>'booking_closes_minutes')::int, v_old.booking_closes_minutes);
  v_new.book_ahead_days := coalesce((p->>'book_ahead_days')::int, v_old.book_ahead_days);
  if p ? 'max_weekly_sessions' then
    v_new.max_weekly_sessions := (p->>'max_weekly_sessions')::int;
  end if;
  v_new.weekly_limit_scope := coalesce(p->>'weekly_limit_scope', v_old.weekly_limit_scope);
  v_new.require_hello_video := coalesce((p->>'require_hello_video')::boolean, v_old.require_hello_video);
  v_new.hello_hold_bookings := coalesce((p->>'hello_hold_bookings')::boolean, v_old.hello_hold_bookings);
  if p ? 'sms_kinds' then
    v_new.sms_kinds := array(select distinct jsonb_array_elements_text(p->'sms_kinds') order by 1);
  end if;

  if v_new.monthly_credits not between 0 and 100 or v_new.household_monthly_credits not between 0 and 100
     or v_new.household_max_people not between 1 and 10 or v_new.welcome_trial_days not between 0 and 60
     or v_new.welcome_credits not between 0 and 50 or v_new.cancel_hours not between 0 and 168
     or v_new.grace_days not between 0 and 30 or v_new.bhd_per_month not between 0 and 20
     or v_new.booking_closes_minutes not between 0 and 240 or v_new.book_ahead_days not between 1 and 180
     or (v_new.max_weekly_sessions is not null and v_new.max_weekly_sessions not between 1 and 21)
     or v_new.weekly_limit_scope not in ('person', 'household')
     or not (v_new.sms_kinds <@ array['1h', '24h']) then
    return jsonb_build_object('success', false, 'error', 'A setting is out of range.');
  end if;

  update app_config set
    monthly_credits = v_new.monthly_credits, household_monthly_credits = v_new.household_monthly_credits,
    household_max_people = v_new.household_max_people, welcome_trial_days = v_new.welcome_trial_days,
    welcome_credits = v_new.welcome_credits, cancel_hours = v_new.cancel_hours, grace_days = v_new.grace_days,
    bhd_per_month = v_new.bhd_per_month, booking_closes_minutes = v_new.booking_closes_minutes,
    book_ahead_days = v_new.book_ahead_days, max_weekly_sessions = v_new.max_weekly_sessions,
    weekly_limit_scope = v_new.weekly_limit_scope, require_hello_video = v_new.require_hello_video,
    hello_hold_bookings = v_new.hello_hold_bookings, sms_kinds = v_new.sms_kinds
  where id = 1;

  insert into admin_log (admin_id, action, details)
  values (auth.uid(), 'settings_updated', p);
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function admin_release_bookings(uuid[], boolean, text) from public, anon, authenticated;
revoke execute on function admin_update_member(uuid, text, text, text) from public, anon;
grant execute on function admin_update_member(uuid, text, text, text) to authenticated;
revoke execute on function admin_set_admin(uuid, boolean) from public, anon;
grant execute on function admin_set_admin(uuid, boolean) to authenticated;
revoke execute on function admin_set_disabled(uuid, boolean, text) from public, anon;
grant execute on function admin_set_disabled(uuid, boolean, text) to authenticated;
revoke execute on function admin_cancel_booking(uuid, boolean, text) from public, anon;
grant execute on function admin_cancel_booking(uuid, boolean, text) to authenticated;
revoke execute on function admin_save_session(uuid, text, text, text, text, timestamptz, int, int, boolean) from public, anon;
grant execute on function admin_save_session(uuid, text, text, text, text, timestamptz, int, int, boolean) to authenticated;
revoke execute on function admin_delete_session(uuid) from public, anon;
grant execute on function admin_delete_session(uuid) to authenticated;
revoke execute on function admin_update_config(jsonb) from public, anon;
grant execute on function admin_update_config(jsonb) to authenticated;

-- 22. Member schedule: calendar, booking page, My sessions and the phone tab bar (1 Nov).
-- Published sessions with how many seats are taken. Only counts leave the function, so member names
-- stay private (bookings RLS shows people their own rows only). For a signed-in member each row also
-- says whether they hold a seat. p_slug picks one session (booking page); p_mine lists the caller's own
-- seats that have not ended (My sessions, tab bar); otherwise sessions starting in [p_from, p_to), at
-- most 190 days so one call cannot pull the whole table.
drop function if exists get_schedule(timestamptz, timestamptz, text);
create or replace function get_schedule(p_from timestamptz, p_to timestamptz, p_slug text default null,
                                        p_mine boolean default false)
returns table (
  id uuid,
  slug text,
  title text,
  blurb text,
  host text,
  prep text,
  starts_at timestamptz,
  minutes int,
  capacity int,
  booked int,
  closes_at timestamptz,
  cancel_by timestamptz,
  my_booking_id uuid,
  my_camera_off boolean,
  my_held boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cfg app_config%rowtype;
begin
  if p_slug is null and not coalesce(p_mine, false) and (p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '190 days') then
    raise exception 'Pick a range of up to 190 days.' using errcode = '22023';
  end if;
  select * into v_cfg from app_config c where c.id = 1;
  return query
  select s.id, s.slug, s.title, s.blurb, s.host, s.prep, s.starts_at, s.minutes, s.capacity,
         coalesce(n.seats, 0)::int,
         s.starts_at - make_interval(mins => v_cfg.booking_closes_minutes),
         s.starts_at - make_interval(hours => v_cfg.cancel_hours),
         m.id, m.camera_off, m.held
  from sessions s
  left join lateral (
    select count(*) as seats from bookings b where b.session_id = s.id and b.status = 'confirmed'
  ) n on true
  left join bookings m on m.session_id = s.id and m.user_id = auth.uid() and m.status = 'confirmed'
  where s.published
    and case when p_slug is not null then s.slug = p_slug
             when coalesce(p_mine, false) then m.id is not null and s.starts_at + make_interval(mins => s.minutes) > now()
             else s.starts_at >= p_from and s.starts_at < p_to end
  order by s.starts_at
  limit 500;
end;
$$;

-- Bad Hair Day after booking (My sessions): camera off or back on for a seat you hold, until the
-- session starts. Turning it off uses one of that month's cards, counted the same way as book_session.
create or replace function set_booking_camera(p_booking_id uuid, p_camera_off boolean)
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
  v_used int;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_cfg from app_config where id = 1;
  -- One person's toggles run one at a time, so two at once cannot both take the last card.
  perform 1 from profiles where id = v_user_id for update;
  select * into v_booking from bookings where id = p_booking_id and user_id = v_user_id for update;
  if not found or v_booking.status <> 'confirmed' then
    return jsonb_build_object('success', false, 'error', 'Booking not found or already cancelled.');
  end if;
  select * into v_session from sessions where id = v_booking.session_id;
  if v_session.starts_at <= now() then
    return jsonb_build_object('success', false, 'error', 'This session has already started.');
  end if;
  if v_booking.camera_off = coalesce(p_camera_off, false) then
    return jsonb_build_object('success', true, 'camera_off', v_booking.camera_off);
  end if;

  if p_camera_off then
    select count(*) into v_used
    from bookings b
    join sessions s on s.id = b.session_id
    where b.user_id = v_user_id
      and b.camera_off
      and b.status in ('confirmed', 'attended', 'late_cancelled')
      and date_trunc('month', s.starts_at at time zone v_cfg.tz)
        = date_trunc('month', v_session.starts_at at time zone v_cfg.tz);
    if v_used >= v_cfg.bhd_per_month then
      return jsonb_build_object('success', false, 'error',
        format('You have used all %s Bad Hair Day cards for that month.', v_cfg.bhd_per_month));
    end if;
  end if;

  update bookings set camera_off = coalesce(p_camera_off, false) where id = p_booking_id;
  return jsonb_build_object('success', true, 'camera_off', coalesce(p_camera_off, false));
end;
$$;

revoke execute on function get_schedule(timestamptz, timestamptz, text, boolean) from public;
grant execute on function get_schedule(timestamptz, timestamptz, text, boolean) to anon, authenticated;
revoke execute on function set_booking_camera(uuid, boolean) from public, anon;
grant execute on function set_booking_camera(uuid, boolean) to authenticated;
