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
  -- minutes before the start; negative = after it, and new arrivals may enter the room until then too
  -- (Kelly 6 Nov: late arrivals book and enter until 5 after, was 10; -60 keeps a 60-minute session open to the end)
  booking_closes_minutes int not null default -5,
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
-- Pay buttons succeed without a card until the payment processor is connected (section 23).
alter table app_config add column if not exists test_payments boolean not null default true;
-- Plan and extra-session prices in cents (section 29). Settings changes them; the next charge uses the new price.
alter table app_config add column if not exists solo_monthly_cents int not null default 2600 check (solo_monthly_cents between 0 and 1000000);
alter table app_config add column if not exists solo_annual_cents int not null default 26000 check (solo_annual_cents between 0 and 1000000);
alter table app_config add column if not exists household_monthly_cents int not null default 3400 check (household_monthly_cents between 0 and 1000000);
alter table app_config add column if not exists household_annual_cents int not null default 34900 check (household_annual_cents between 0 and 1000000);
alter table app_config add column if not exists extra_1_cents int not null default 400 check (extra_1_cents between 0 and 1000000);
alter table app_config add column if not exists extra_5_cents int not null default 1500 check (extra_5_cents between 0 and 1000000);
alter table app_config alter column booking_closes_minutes set default -5;
-- Where "Contact us" sends members (Kelly 6 Nov: declined Hello Video). Set in Admin > Settings; null = no link.
alter table app_config add column if not exists contact_email text;
alter table app_config drop constraint if exists app_config_contact_email_check;
alter table app_config add constraint app_config_contact_email_check
  check (contact_email is null or (char_length(contact_email) <= 120 and contact_email ~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$'));

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

-- Sign-up steps and test-mode billing (section 24): Terms accepted, interests, the day the paid
-- period ends, and a cancellation that takes effect on that day.
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists interests text[] not null default '{}';
alter table profiles add column if not exists paid_until date;
alter table profiles add column if not exists cancel_at_period_end boolean not null default false;

-- pending = signed up, not paid yet (section 23). No credits and no booking until checkout.
alter table profiles drop constraint if exists profiles_payment_status_check;
alter table profiles add constraint profiles_payment_status_check
  check (payment_status in ('pending', 'active', 'past_due', 'paused', 'canceled'));

-- Screen name (Kelly 6 Nov): what other members see in rooms, Trivia and Buddy Rooms. Optional at sign-up;
-- without one they see the first name. Admins and emails keep the real name.
alter table profiles add column if not exists screen_name text;
alter table profiles drop constraint if exists profiles_screen_name_check;
alter table profiles add constraint profiles_screen_name_check
  check (screen_name is null or (screen_name = btrim(screen_name) and char_length(screen_name) between 2 and 24
                                 and screen_name !~ '[[:cntrl:]]'));

create or replace function public_name(p profiles)
returns text
language sql
immutable
as $$
  select coalesce(nullif(btrim(p.screen_name), ''), nullif(btrim(p.first_name), ''), 'Member');
$$;

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
-- An invited email joins that household (the holder pays). Everyone else starts as pending with the
-- plan they picked on the sign-up form, and gets credits at checkout (section 23).
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
  v_screen text;
begin
  -- Email sign-up sends first_name/last_name. Google sends given_name/family_name or only full_name.
  -- screen_name is optional; anything the check below would refuse is dropped instead of failing sign-up.
  v_screen := regexp_replace(btrim(coalesce(v_meta->>'screen_name', '')), '\s+', ' ', 'g');
  if char_length(v_screen) not between 2 and 24 or v_screen ~ '[[:cntrl:]]' then
    v_screen := null;
  end if;
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
      id, email, first_name, last_name, screen_name, tier, billing_interval, billing_date,
      monthly_credits, addon_credits, credits_cycle_start, household_owner_id, payment_status
    ) values (
      new.id,
      lower(new.email),
      left(v_first, 80),
      left(v_last, 80),
      v_screen,
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
    id, email, first_name, last_name, screen_name, tier, billing_interval, billing_date,
    monthly_credits, addon_credits, credits_cycle_start, payment_status
  ) values (
    new.id,
    lower(new.email),
    left(v_first, 80),
    left(v_last, 80),
    v_screen,
    v_tier,
    v_interval,
    extract(day from v_today)::int,
    0,
    0,
    null,
    'pending'
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
  elsif v_payer.payment_status = 'pending' then
    return jsonb_build_object('success', false, 'error', case when v_me.household_owner_id is null
      then 'Finish checkout to start booking sessions.'
      else 'Your Household account holder needs to finish checkout first.' end);
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
      case when v_cfg.booking_closes_minutes < 0
           then format('Booking closed %s minutes after the start.', -v_cfg.booking_closes_minutes)
           else format('Booking closes %s minutes before the start.', v_cfg.booking_closes_minutes) end);
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
    'contact_email', v_cfg.contact_email,
    'test_payments', v_cfg.test_payments,
    'terms_accepted', v_me.terms_accepted_at is not null,
    'interests', to_jsonb(v_me.interests),
    'avatar_url', v_me.avatar_url,
    'paid_until', v_payer.paid_until,
    'cancel_at_period_end', v_payer.cancel_at_period_end,
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

-- 19. Hello Video (Kelly 29 Oct, shortened 2 Nov): 30 to 60 seconds per person, only admins watch it.
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
    return jsonb_build_object('success', false, 'error', 'Your Hello Video was not approved. Please contact us'
      || coalesce(' at ' || (select contact_email from app_config where id = 1), '') || '.');
  end if;
  if p_mime is null or p_mime not in ('video/webm', 'video/mp4') then
    return jsonb_build_object('success', false, 'error', 'This browser recorded an unsupported video type.');
  end if;
  if p_size is null or p_size < 1 or p_size > 104857600 then
    return jsonb_build_object('success', false, 'error', 'The video is too large. Please record a shorter one.');
  end if;
  if p_duration is null or p_duration < 30 or p_duration > 65 then
    return jsonb_build_object('success', false, 'error', 'Hello Videos are 30 to 60 seconds long.');
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

-- Kelly 6 Nov: after a Decline (blurry video, faces not visible) the admin can let the person record again.
-- They go back to "Please record again" with the admin's note, get the same email as Not approved, and
-- leave the refund list. Bookings released by the decline stay released; they book again once approved.
create or replace function hello_video_reopen(p_user uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can do this.');
  end if;
  update profiles
  set hello_status = 'rejected', hello_reviewed_at = now(), hello_refunded_at = null, updated_at = now()
  where id = p_user and hello_status = 'declined';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This person was not declined.');
  end if;
  -- The Hello Video page shows the newest video's note, so the new note replaces the decline note.
  if v_note is not null then
    update hello_videos set reject_reason = v_note
    where id = (select id from hello_videos where user_id = p_user order by created_at desc limit 1);
  end if;
  insert into member_notices (user_id, kind, note) values (p_user, 'hello_redo', v_note);
  insert into admin_log (admin_id, profile_id, action, details)
  values (auth.uid(), p_user, 'hello_reopened', jsonb_build_object('note', v_note));
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function hello_video_reopen(uuid, text) from public, anon;
grant execute on function hello_video_reopen(uuid, text) to authenticated;
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
     or p_payment_status not in ('pending', 'active', 'past_due', 'paused', 'canceled') then
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
    'booking_closes_minutes', 'book_ahead_days', 'solo_monthly_cents', 'solo_annual_cents',
    'household_monthly_cents', 'household_annual_cents', 'extra_1_cents', 'extra_5_cents'];
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change settings.');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    return jsonb_build_object('success', false, 'error', 'Nothing to save.');
  end if;
  select k into v_unknown from jsonb_object_keys(p) k
  where k <> all (v_int_keys || array['max_weekly_sessions', 'weekly_limit_scope', 'require_hello_video',
                                      'hello_hold_bookings', 'sms_kinds', 'test_payments', 'contact_email'])
  limit 1;
  if v_unknown is not null then
    return jsonb_build_object('success', false, 'error', format('Unknown setting: %s', v_unknown));
  end if;
  if exists (select 1 from jsonb_each(p) e where e.key = any(v_int_keys) and jsonb_typeof(e.value) <> 'number')
     or (p ? 'max_weekly_sessions' and jsonb_typeof(p->'max_weekly_sessions') not in ('number', 'null'))
     or (p ? 'require_hello_video' and jsonb_typeof(p->'require_hello_video') <> 'boolean')
     or (p ? 'hello_hold_bookings' and jsonb_typeof(p->'hello_hold_bookings') <> 'boolean')
     or (p ? 'test_payments' and jsonb_typeof(p->'test_payments') <> 'boolean')
     or (p ? 'sms_kinds' and jsonb_typeof(p->'sms_kinds') <> 'array')
     or (p ? 'contact_email' and jsonb_typeof(p->'contact_email') not in ('string', 'null')) then
    return jsonb_build_object('success', false, 'error', 'A setting has the wrong type.');
  end if;
  if p ? 'contact_email' and nullif(btrim(p->>'contact_email'), '') is not null
     and (char_length(btrim(p->>'contact_email')) > 120
          or btrim(p->>'contact_email') !~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$') then
    return jsonb_build_object('success', false, 'error', 'Check the contact email address.');
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
  v_new.solo_monthly_cents := coalesce((p->>'solo_monthly_cents')::int, v_old.solo_monthly_cents);
  v_new.solo_annual_cents := coalesce((p->>'solo_annual_cents')::int, v_old.solo_annual_cents);
  v_new.household_monthly_cents := coalesce((p->>'household_monthly_cents')::int, v_old.household_monthly_cents);
  v_new.household_annual_cents := coalesce((p->>'household_annual_cents')::int, v_old.household_annual_cents);
  v_new.extra_1_cents := coalesce((p->>'extra_1_cents')::int, v_old.extra_1_cents);
  v_new.extra_5_cents := coalesce((p->>'extra_5_cents')::int, v_old.extra_5_cents);
  if p ? 'max_weekly_sessions' then
    v_new.max_weekly_sessions := (p->>'max_weekly_sessions')::int;
  end if;
  v_new.weekly_limit_scope := coalesce(p->>'weekly_limit_scope', v_old.weekly_limit_scope);
  v_new.require_hello_video := coalesce((p->>'require_hello_video')::boolean, v_old.require_hello_video);
  v_new.hello_hold_bookings := coalesce((p->>'hello_hold_bookings')::boolean, v_old.hello_hold_bookings);
  v_new.test_payments := coalesce((p->>'test_payments')::boolean, v_old.test_payments);
  if p ? 'sms_kinds' then
    v_new.sms_kinds := array(select distinct jsonb_array_elements_text(p->'sms_kinds') order by 1);
  end if;
  if p ? 'contact_email' then
    v_new.contact_email := nullif(btrim(p->>'contact_email'), '');
  end if;

  if v_new.monthly_credits not between 0 and 100 or v_new.household_monthly_credits not between 0 and 100
     or v_new.household_max_people not between 1 and 10 or v_new.welcome_trial_days not between 0 and 60
     or v_new.welcome_credits not between 0 and 50 or v_new.cancel_hours not between 0 and 168
     or v_new.grace_days not between 0 and 30 or v_new.bhd_per_month not between 0 and 20
     or v_new.booking_closes_minutes not between -240 and 240 or v_new.book_ahead_days not between 1 and 180
     or least(v_new.solo_monthly_cents, v_new.solo_annual_cents, v_new.household_monthly_cents,
              v_new.household_annual_cents, v_new.extra_1_cents, v_new.extra_5_cents) < 0
     or greatest(v_new.solo_monthly_cents, v_new.solo_annual_cents, v_new.household_monthly_cents,
                 v_new.household_annual_cents, v_new.extra_1_cents, v_new.extra_5_cents) > 1000000
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
    solo_monthly_cents = v_new.solo_monthly_cents, solo_annual_cents = v_new.solo_annual_cents,
    household_monthly_cents = v_new.household_monthly_cents, household_annual_cents = v_new.household_annual_cents,
    extra_1_cents = v_new.extra_1_cents, extra_5_cents = v_new.extra_5_cents,
    weekly_limit_scope = v_new.weekly_limit_scope, require_hello_video = v_new.require_hello_video,
    hello_hold_bookings = v_new.hello_hold_bookings, sms_kinds = v_new.sms_kinds,
    test_payments = v_new.test_payments, contact_email = v_new.contact_email
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

-- 23. Checkout in test mode (Kelly 1 Nov): Pay buttons succeed right away, no card, nothing charged.
-- Every "payment" is recorded so the member sees receipts and admins can follow and refund them.
-- app_config.test_payments turns this off once the payment processor (Milestone 3) is connected.
-- Prices live here and in lib/prices.ts; keep both the same.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('plan', 'extras')),
  description text not null check (length(description) between 1 and 120),
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  tier text check (tier in ('individual', 'household')),
  billing_interval text check (billing_interval in ('monthly', 'annual')),
  extra_sessions int check (extra_sessions > 0),
  provider text not null default 'test',
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  refunded_at timestamptz,
  refunded_by uuid references profiles(id) on delete set null,
  refund_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_profile on payments (profile_id, created_at desc);
create index if not exists idx_payments_created on payments (created_at desc);
create index if not exists idx_payments_refunded_by on payments (refunded_by);

alter table payments enable row level security;
drop policy if exists "People see their own payments" on payments;
create policy "People see their own payments" on payments for select to authenticated
  using ((select auth.uid()) = profile_id or is_admin());
revoke insert, update, delete on payments from anon, authenticated;
grant select on payments to authenticated;

create or replace function plan_price_cents(p_tier text, p_interval text)
returns int
language sql
stable
set search_path = public
as $$
  select case
    when p_tier = 'individual' and p_interval = 'monthly' then c.solo_monthly_cents
    when p_tier = 'individual' and p_interval = 'annual' then c.solo_annual_cents
    when p_tier = 'household' and p_interval = 'monthly' then c.household_monthly_cents
    when p_tier = 'household' and p_interval = 'annual' then c.household_annual_cents
  end
  from app_config c where c.id = 1;
$$;

-- One billing period.
create or replace function period_length(p_interval text)
returns interval
language sql
immutable
set search_path = public
as $$
  select case when p_interval = 'annual' then interval '1 year' else interval '1 month' end;
$$;

-- Extra sessions come in packs of 1 ($4) or 5 ($15).
create or replace function extras_price_cents(p_count int)
returns int
language sql
stable
set search_path = public
as $$
  select case p_count when 1 then c.extra_1_cents when 5 then c.extra_5_cents end
  from app_config c where c.id = 1;
$$;

-- Start, restart or pay a due membership. A new or ended membership starts today: today becomes the
-- billing day and the plan's credits arrive now. A past-due or paused one keeps its billing day and
-- gets this month's credits (mark_payment_recovered). An active membership is left alone.
create or replace function test_checkout(p_tier text, p_interval text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_me profiles%rowtype;
  v_today date;
  v_people int;
  v_amount int := plan_price_cents(p_tier, p_interval);
  v_desc text;
  v_payment uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_cfg from app_config where id = 1;
  if not v_cfg.test_payments then
    return jsonb_build_object('success', false, 'error', 'Online payments are not open yet.');
  end if;
  if v_amount is null then
    return jsonb_build_object('success', false, 'error', 'Pick Solo or Household, monthly or annual.');
  end if;

  select * into v_me from profiles where id = auth.uid() for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Profile not found.');
  end if;
  if v_me.disabled_at is not null then
    return jsonb_build_object('success', false, 'error', 'This account is turned off.');
  end if;
  if v_me.household_owner_id is not null then
    return jsonb_build_object('success', false, 'error', 'Your Household account holder pays for the plan.');
  end if;
  if v_me.terms_accepted_at is null then
    return jsonb_build_object('success', false, 'error', 'Please accept the community rules and Terms first.');
  end if;
  if v_me.payment_status = 'active' then
    return jsonb_build_object('success', false, 'error', 'Your membership is already active.');
  end if;
  if v_me.tier = 'household' and p_tier = 'individual' then
    select count(*) into v_people from profiles where household_owner_id = v_me.id;
    if v_people > 0 then
      return jsonb_build_object('success', false, 'error',
        'Your Household still has other people in it. Keep Household, or remove them first.');
    end if;
  end if;

  v_today := (now() at time zone v_cfg.tz)::date;
  if v_me.payment_status in ('pending', 'canceled') then
    update profiles
    set tier = p_tier,
        billing_interval = p_interval,
        billing_date = extract(day from v_today)::int,
        payment_status = 'active',
        payment_failed_at = null,
        monthly_credits = plan_credits(p_tier),
        credits_cycle_start = v_today,
        paid_until = (v_today + period_length(p_interval))::date,
        cancel_at_period_end = false,
        updated_at = now()
    where id = v_me.id;
    update profiles set credits_cycle_start = v_today, updated_at = now() where household_owner_id = v_me.id;
  else
    -- The payment covers the period that failed, so the paid-through day moves on by one period.
    update profiles
    set tier = p_tier, billing_interval = p_interval, cancel_at_period_end = false,
        paid_until = (greatest(coalesce(paid_until, v_today), (v_today - period_length(p_interval))::date + 1)
                      + period_length(p_interval))::date,
        updated_at = now()
    where id = v_me.id;
    perform mark_payment_recovered(v_me.id);
  end if;

  v_desc := format('%s membership, %s',
    case when p_tier = 'household' then 'Household' else 'Solo' end,
    case when p_interval = 'annual' then 'annual' else 'monthly' end);
  insert into payments (profile_id, kind, description, amount_cents, tier, billing_interval)
  values (v_me.id, 'plan', v_desc, v_amount, p_tier, p_interval)
  returning id into v_payment;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment,
    'description', v_desc,
    'amount_cents', v_amount,
    'monthly_credits', (select monthly_credits from profiles where id = v_me.id)
  );
end;
$$;

-- Extra sessions for an active membership. Household extras are shared, so they land on the holder,
-- like booking and Give credits; the receipt belongs to whoever paid.
create or replace function test_buy_extras(p_count int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_me profiles%rowtype;
  v_payer profiles%rowtype;
  v_amount int := extras_price_cents(p_count);
  v_desc text;
  v_payment uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_cfg from app_config where id = 1;
  if not v_cfg.test_payments then
    return jsonb_build_object('success', false, 'error', 'Online payments are not open yet.');
  end if;
  if v_amount is null then
    return jsonb_build_object('success', false, 'error', 'Choose 1 or 5 extra sessions.');
  end if;

  select * into v_me from profiles where id = auth.uid();
  if not found or v_me.disabled_at is not null then
    return jsonb_build_object('success', false, 'error', 'This account cannot buy sessions.');
  end if;
  select * into v_payer from profiles where id = coalesce(v_me.household_owner_id, v_me.id) for update;
  if v_payer.payment_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'Start your membership first, then add extra sessions.');
  end if;

  update profiles set addon_credits = addon_credits + p_count, updated_at = now() where id = v_payer.id;
  v_desc := case when p_count = 1 then '1 extra session' else format('%s extra sessions', p_count) end;
  insert into payments (profile_id, kind, description, amount_cents, extra_sessions)
  values (v_me.id, 'extras', v_desc, v_amount, p_count)
  returning id into v_payment;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment,
    'description', v_desc,
    'amount_cents', v_amount,
    'addon_credits', v_payer.addon_credits + p_count
  );
end;
$$;

-- Marks a payment refunded (in test mode no money moved; with a processor the refund itself happens
-- there). Refunding extra sessions takes back the ones not used yet. A plan refund does not end the
-- membership: change the status on the member if it should stop.
create or replace function admin_refund_payment(p_payment uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay payments%rowtype;
  v_payer uuid;
  v_taken int := 0;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can refund payments.');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Add a reason for the refund.');
  end if;
  select * into v_pay from payments where id = p_payment for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Payment not found.');
  end if;
  if v_pay.status = 'refunded' then
    return jsonb_build_object('success', false, 'error', 'This payment was already refunded.');
  end if;

  if v_pay.kind = 'extras' then
    select coalesce(household_owner_id, id) into v_payer from profiles where id = v_pay.profile_id;
    select least(addon_credits, v_pay.extra_sessions) into v_taken from profiles where id = v_payer for update;
    update profiles set addon_credits = addon_credits - v_taken, updated_at = now() where id = v_payer;
  end if;

  update payments
  set status = 'refunded', refunded_at = now(), refunded_by = auth.uid(), refund_reason = left(trim(p_reason), 300)
  where id = v_pay.id;

  insert into admin_log (admin_id, profile_id, action, details)
  values (auth.uid(), v_pay.profile_id, 'payment_refunded', jsonb_build_object(
    'payment_id', v_pay.id, 'description', v_pay.description, 'amount_cents', v_pay.amount_cents,
    'reason', left(trim(p_reason), 300), 'extras_taken_back', v_taken));

  return jsonb_build_object('success', true, 'extras_taken_back', v_taken);
end;
$$;

revoke execute on function test_checkout(text, text) from public, anon;
grant execute on function test_checkout(text, text) to authenticated;
revoke execute on function test_buy_extras(int) from public, anon;
grant execute on function test_buy_extras(int) to authenticated;
revoke execute on function admin_refund_payment(uuid, text) from public, anon;
grant execute on function admin_refund_payment(uuid, text) to authenticated;

-- 24. Sign-up steps and the rest of test-mode billing (1 Nov). Sign-up: Terms first, then checkout, then
-- the Hello Video, interests and reminders. Billing: each checkout pays for one period (paid_until);
-- in test mode an hourly job "renews" it with a receipt, or ends it when the member cancelled.
create or replace function accept_terms()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  update profiles set terms_accepted_at = coalesce(terms_accepted_at, now()), updated_at = now()
  where id = auth.uid();
  return jsonb_build_object('success', found);
end;
$$;

-- Up to 20 short labels; only used to make the Calendar more useful.
create or replace function save_interests(p_interests text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select coalesce(array_agg(distinct left(trim(i), 40)), '{}') into v_clean
  from unnest(coalesce(p_interests, '{}')) i
  where trim(i) <> '';
  if cardinality(v_clean) > 20 then
    return jsonb_build_object('success', false, 'error', 'Pick up to 20 interests.');
  end if;
  update profiles set interests = v_clean, updated_at = now() where id = auth.uid();
  return jsonb_build_object('success', true, 'interests', to_jsonb(v_clean));
end;
$$;

-- Cancel (or keep) the membership. It runs until paid_until, then stops; booked seats stay booked.
create or replace function cancel_membership(p_cancel boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me profiles%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_me from profiles where id = auth.uid() for update;
  if v_me.household_owner_id is not null then
    return jsonb_build_object('success', false, 'error', 'Only your Household account holder can cancel the plan.');
  end if;
  if v_me.payment_status <> 'active' or v_me.paid_until is null then
    return jsonb_build_object('success', false, 'error', 'There is no running membership to change.');
  end if;
  update profiles set cancel_at_period_end = p_cancel, updated_at = now() where id = v_me.id;
  return jsonb_build_object(
    'success', true,
    'message', case when p_cancel
      then format('Your membership ends on %s. You can keep booking until then.', to_char(v_me.paid_until, 'FMMonth FMDD, YYYY'))
      else 'Your membership keeps running. Nothing changes.' end);
end;
$$;

-- Test mode only (a payment processor does this once it is connected): renew every membership whose paid
-- period is over, with a receipt, or end it when the member cancelled. One period per run.
create or replace function renew_test_memberships()
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
  if not v_cfg.test_payments then
    return 0;
  end if;
  v_today := (now() at time zone v_cfg.tz)::date;

  update profiles
  set payment_status = 'canceled', monthly_credits = 0, cancel_at_period_end = false, updated_at = now()
  where household_owner_id is null and payment_status = 'active' and paid_until <= v_today and cancel_at_period_end;

  with renewed as (
    update profiles p
    set paid_until = (p.paid_until + period_length(p.billing_interval))::date, updated_at = now()
    where p.household_owner_id is null and p.payment_status = 'active' and p.paid_until <= v_today
      and not p.cancel_at_period_end
    returning p.id, p.tier, p.billing_interval
  )
  insert into payments (profile_id, kind, description, amount_cents, tier, billing_interval)
  select id, 'plan',
    format('%s membership, %s renewal', case when tier = 'household' then 'Household' else 'Solo' end,
           case when billing_interval = 'annual' then 'annual' else 'monthly' end),
    plan_price_cents(tier, billing_interval), tier, billing_interval
  from renewed;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select cron.schedule('mdc-test-renewals', '15 * * * *', 'select public.renew_test_memberships()');

revoke execute on function accept_terms() from public, anon;
grant execute on function accept_terms() to authenticated;
revoke execute on function save_interests(text[]) from public, anon;
grant execute on function save_interests(text[]) to authenticated;
revoke execute on function cancel_membership(boolean) from public, anon;
grant execute on function cancel_membership(boolean) to authenticated;
revoke execute on function renew_test_memberships() from public, anon, authenticated;
revoke execute on function period_length(text) from public, anon;
grant execute on function period_length(text) to authenticated;

-- Profile photos (sign-up step 4; shown in rooms when the camera is off). Public bucket, each person writes
-- only their own folder: avatars/<user id>/... Skipped where Supabase Storage is missing (local tests).
do $do$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists "People see their own photo" on storage.objects';
  execute $p$create policy "People see their own photo" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute 'drop policy if exists "People upload their own photo" on storage.objects';
  execute $p$create policy "People upload their own photo" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute 'drop policy if exists "People replace their own photo" on storage.objects';
  execute $p$create policy "People replace their own photo" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute 'drop policy if exists "People delete their own photo" on storage.objects';
  execute $p$create policy "People delete their own photo" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
end
$do$;

-- 25. Live rooms (Milestone 4). The room-join Edge Function asks room_join() who may enter, then gets a Daily
-- room and a meeting token. Rooms open 5 minutes before the start (Kelly 2 Nov, was 10) and lock to new arrivals 5 minutes after
-- (Kelly 28 Oct); someone who already joined can come back until the end. Kelly 31 Oct: nobody enters a room
-- before an admin approved their Hello Video (app_config.require_hello_video). Reports go to admins only.
alter table bookings add column if not exists joined_at timestamptz;

create table if not exists room_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_id uuid references profiles(id) on delete set null,
  reason text not null check (length(reason) between 1 and 80),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_reports_status on room_reports (status, created_at desc);
create index if not exists idx_room_reports_session on room_reports (session_id);
create index if not exists idx_room_reports_reporter on room_reports (reporter_id, created_at desc);
create index if not exists idx_room_reports_reported on room_reports (reported_id);
create index if not exists idx_room_reports_resolved_by on room_reports (resolved_by);

alter table room_reports enable row level security;
drop policy if exists "Admins can view reports" on room_reports;
create policy "Admins can view reports" on room_reports for select to authenticated using (is_admin());
revoke insert, update, delete on room_reports from anon, authenticated;

-- Server only (service role, from room-join): may p_user enter p_session now? Admins may enter any session
-- while it is open, without a seat. Marks the seat as joined.
-- The decision only; room_join() (section 34) calls this and writes the room log.
create or replace function room_join_decide(p_user uuid, p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_me profiles%rowtype;
  v_s sessions%rowtype;
  v_b bookings%rowtype;
  v_opens timestamptz;
  v_locks timestamptz;
  v_ends timestamptz;
begin
  select * into v_cfg from app_config where id = 1;
  select * into v_me from profiles where id = p_user;
  if not found or v_me.disabled_at is not null then
    return jsonb_build_object('success', false, 'error', 'This account can’t join rooms. Please contact us.');
  end if;
  select * into v_s from sessions where id = p_session;
  if not found or (not v_s.published and not v_me.is_admin) then
    return jsonb_build_object('success', false, 'error', 'This session was not found.');
  end if;
  v_opens := v_s.starts_at - interval '5 minutes';
  -- New arrivals: 5 minutes after the start (Kelly 6 Nov, was 10), or later while booking stays open
  -- (booking_closes_minutes < -5).
  v_locks := v_s.starts_at + make_interval(mins => greatest(5, -v_cfg.booking_closes_minutes));
  v_ends := v_s.starts_at + make_interval(mins => v_s.minutes);
  if now() < v_opens then
    return jsonb_build_object('success', false, 'error', 'The room opens 5 minutes before the start.');
  elsif now() >= v_ends then
    return jsonb_build_object('success', false, 'error', 'This session has ended.');
  end if;

  if not v_me.is_admin then
    select * into v_b from bookings
    where session_id = p_session and user_id = p_user and status in ('confirmed', 'attended')
    for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'You don’t have a seat in this session.');
    end if;
    if v_b.held or (v_cfg.require_hello_video and v_me.hello_status <> 'approved') then
      return jsonb_build_object('success', false, 'error',
        'Rooms open for you once your Hello Video is approved. Your seat is saved.');
    end if;
    if now() > v_locks and v_b.joined_at is null then
      return jsonb_build_object('success', false, 'error',
        format('The room closed to new arrivals %s minutes after the start.', greatest(5, -v_cfg.booking_closes_minutes)));
    end if;
    update bookings set joined_at = coalesce(joined_at, now()) where id = v_b.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'title', v_s.title,
    'slug', v_s.slug,
    'starts_at', v_s.starts_at,
    'ends_at', v_ends,
    'locks_at', v_locks,
    'capacity', v_s.capacity,
    'name', public_name(v_me),
    'camera_off', coalesce(v_b.camera_off, false),
    'is_admin', v_me.is_admin,
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', public_name(p), 'avatar_url', p.avatar_url
      )), '[]'::jsonb)
      from bookings b join profiles p on p.id = b.user_id
      where b.session_id = p_session and b.status in ('confirmed', 'attended') and not b.held
    )
  );
end;
$$;

-- A private report from someone in the room about someone else in it. At most 10 an hour per person.
create or replace function report_participant(p_session uuid, p_reported uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_room boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Choose what happened.');
  end if;
  select exists (select 1 from bookings where session_id = p_session and user_id = auth.uid()
                 and status in ('confirmed', 'attended')) or is_admin()
  into v_in_room;
  if not v_in_room then
    return jsonb_build_object('success', false, 'error', 'You can only report people from your own session.');
  end if;
  if p_reported is not null and (p_reported = auth.uid() or not exists (
       select 1 from bookings where session_id = p_session and user_id = p_reported
       and status in ('confirmed', 'attended'))) then
    return jsonb_build_object('success', false, 'error', 'That person isn’t in this session.');
  end if;
  if (select count(*) from room_reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('success', false, 'error', 'You’ve sent several reports. An admin will look at them soon.');
  end if;
  insert into room_reports (session_id, reporter_id, reported_id, reason, note)
  values (p_session, auth.uid(), p_reported, left(trim(p_reason), 80), nullif(left(trim(coalesce(p_note, '')), 1000), ''));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function admin_resolve_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can resolve reports.');
  end if;
  update room_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_id and status = 'open';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This report is already resolved.');
  end if;
  insert into admin_log (admin_id, action, details)
  values (auth.uid(), 'report_resolved', jsonb_build_object('report_id', p_id));
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function room_join_decide(uuid, uuid) from public, anon, authenticated;
revoke execute on function report_participant(uuid, uuid, text, text) from public, anon;
grant execute on function report_participant(uuid, uuid, text, text) to authenticated;
revoke execute on function admin_resolve_report(uuid) from public, anon;
grant execute on function admin_resolve_report(uuid) to authenticated;

-- 26. Buddy Rooms (Kelly 27-28 Oct): after a group session each person privately picks up to 3 people from it.
-- Two people who picked each other (in any session they shared) get a private 1:1 chat. Picks stay private
-- unless they match. Messages are text, a session invitation ({slug}) or a game invitation ({game, game_id},
-- written by start_buddy_game in section 27).
create table if not exists buddy_picks (
  session_id uuid not null references sessions(id) on delete cascade,
  picker_id uuid not null references profiles(id) on delete cascade,
  picked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, picker_id, picked_id),
  check (picker_id <> picked_id)
);
create index if not exists idx_buddy_picks_picked on buddy_picks (picked_id, picker_id);
create index if not exists idx_buddy_picks_picker on buddy_picks (picker_id, picked_id);

-- low_id < high_id: one thread per pair, whoever writes first.
create table if not exists buddy_messages (
  id uuid primary key default gen_random_uuid(),
  low_id uuid not null references profiles(id) on delete cascade,
  high_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'session', 'game')),
  body text not null check (length(body) between 1 and 2000),
  payload jsonb,
  created_at timestamptz not null default now(),
  check (low_id < high_id),
  check (sender_id in (low_id, high_id))
);
create index if not exists idx_buddy_messages_pair on buddy_messages (low_id, high_id, created_at);
create index if not exists idx_buddy_messages_high on buddy_messages (high_id);
create index if not exists idx_buddy_messages_sender on buddy_messages (sender_id, created_at);

-- Had a real seat in the session (not cancelled, not held for a Hello Video).
-- In the room = had a seat and actually joined the live room (room_join sets joined_at), so no-shows are not picked.
create or replace function sat_in(p_session uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from bookings
    where session_id = p_session and user_id = p_user and status in ('confirmed', 'attended') and not held
      and joined_at is not null
  );
$$;

-- Both picked each other, and both accounts are on.
create or replace function buddies_matched(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a <> p_b
    and exists (select 1 from buddy_picks where picker_id = p_a and picked_id = p_b)
    and exists (select 1 from buddy_picks where picker_id = p_b and picked_id = p_a)
    and not exists (select 1 from profiles where id in (p_a, p_b) and disabled_at is not null);
$$;

-- Used by the messages policy: true only for one of the two people, so nobody can probe other pairs.
create or replace function buddy_room_open(p_low uuid, p_high uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() in (p_low, p_high) and buddies_matched(p_low, p_high);
$$;

-- Picks open when the session starts and close 24 hours after it ends ("Picks stay open for 24 hours").
create or replace function picks_close_at(p_starts timestamptz, p_minutes int)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select p_starts + make_interval(mins => p_minutes) + interval '24 hours';
$$;

-- The other people in a session the caller sat in (admins: any session), with the caller's own picks.
-- Whether someone picked the caller is only shown once it is a match.
create or replace function get_session_people(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_s sessions%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_s from sessions where id = p_session;
  if not found or not (sat_in(p_session, v_me) or is_admin()) then
    return jsonb_build_object('success', false, 'error', 'Only people who were in this session can see who was there.');
  end if;
  return jsonb_build_object(
    'success', true,
    'session', jsonb_build_object('id', v_s.id, 'slug', v_s.slug, 'title', v_s.title, 'starts_at', v_s.starts_at,
                                  'minutes', v_s.minutes),
    'can_pick', sat_in(p_session, v_me) and now() >= v_s.starts_at and now() <= picks_close_at(v_s.starts_at, v_s.minutes),
    'picks_close_at', picks_close_at(v_s.starts_at, v_s.minutes),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', public_name(p),
        'avatar_url', p.avatar_url,
        'picked', exists (select 1 from buddy_picks k
                          where k.session_id = p_session and k.picker_id = v_me and k.picked_id = p.id),
        'matched', buddies_matched(v_me, p.id)
      ) order by public_name(p), p.id)
      from profiles p
      where p.id <> v_me and p.disabled_at is null and sat_in(p_session, p.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Replaces the caller's picks for one session (up to 3). Returns who matched.
create or replace function save_buddy_picks(p_session uuid, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_s sessions%rowtype;
  v_ids uuid[];
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_s from sessions where id = p_session;
  if not found or not sat_in(p_session, v_me) then
    return jsonb_build_object('success', false, 'error', 'You can only pick people from a session you were in.');
  end if;
  if now() < v_s.starts_at then
    return jsonb_build_object('success', false, 'error', 'Picks open once the session starts.');
  end if;
  if now() > picks_close_at(v_s.starts_at, v_s.minutes) then
    return jsonb_build_object('success', false, 'error', 'Picks for this session closed 24 hours after it ended.');
  end if;
  select coalesce(array_agg(distinct i), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) i where i is not null;
  if cardinality(v_ids) > 3 then
    return jsonb_build_object('success', false, 'error', 'Pick up to 3 people.');
  end if;
  if exists (select 1 from unnest(v_ids) i where i = v_me or not sat_in(p_session, i)) then
    return jsonb_build_object('success', false, 'error', 'Pick people who were in this session.');
  end if;

  delete from buddy_picks where session_id = p_session and picker_id = v_me;
  insert into buddy_picks (session_id, picker_id, picked_id) select p_session, v_me, i from unnest(v_ids) i;

  return jsonb_build_object('success', true, 'matched', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', public_name(p),
                                        'avatar_url', p.avatar_url) order by public_name(p))
    from profiles p where p.id = any (v_ids) and buddies_matched(v_me, p.id)
  ), '[]'::jsonb));
end;
$$;

-- Everyone the caller matched with, newest conversation first.
create or replace function get_my_buddies()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'first_name', b.first_name, 'avatar_url', b.avatar_url,
    'last_body', b.last_body, 'last_kind', b.last_kind, 'last_at', b.last_at, 'last_from_me', b.last_from_me
  ) order by b.last_at desc nulls last, b.first_name), '[]'::jsonb)
  from (
    select p.id, public_name(p) as first_name, p.avatar_url,
           m.body as last_body, m.kind as last_kind, m.created_at as last_at, m.sender_id = auth.uid() as last_from_me
    from profiles p
    left join lateral (
      select body, kind, created_at, sender_id from buddy_messages
      where low_id = least(auth.uid(), p.id) and high_id = greatest(auth.uid(), p.id)
      order by created_at desc limit 1
    ) m on true
    where p.id in (select picked_id from buddy_picks where picker_id = auth.uid())
      and buddies_matched(auth.uid(), p.id)
  ) b;
$$;

-- Sends a text or session invitation in a Buddy Room. At most 30 a minute per person.
create or replace function send_buddy_message(p_to uuid, p_kind text, p_body text, p_payload jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_payload jsonb;
  v_row buddy_messages%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  if coalesce(p_kind, '') not in ('text', 'session') then
    return jsonb_build_object('success', false, 'error', 'Unknown message type.');
  end if;
  if v_body = '' or length(v_body) > 2000 then
    return jsonb_build_object('success', false, 'error', 'Write a message of up to 2,000 characters.');
  end if;
  if p_to is null or not buddies_matched(v_me, p_to) then
    return jsonb_build_object('success', false, 'error', 'This Buddy Room is closed.');
  end if;
  if p_kind = 'session' then
    if not exists (select 1 from sessions where slug = p_payload->>'slug' and published) then
      return jsonb_build_object('success', false, 'error', 'That session is not on the calendar.');
    end if;
    v_payload := jsonb_build_object('slug', p_payload->>'slug');
  end if;
  if (select count(*) from buddy_messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('success', false, 'error', 'That’s a lot of messages at once. Wait a minute and try again.');
  end if;

  insert into buddy_messages (low_id, high_id, sender_id, kind, body, payload)
  values (least(v_me, p_to), greatest(v_me, p_to), v_me, p_kind, v_body, v_payload)
  returning * into v_row;
  return jsonb_build_object('success', true, 'id', v_row.id, 'created_at', v_row.created_at);
end;
$$;

-- "Block": drops the caller's picks of that person, so the room closes for both. They are not told.
create or replace function unpick_buddy(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  delete from buddy_picks where picker_id = auth.uid() and picked_id = p_other;
  return jsonb_build_object('success', true);
end;
$$;

alter table buddy_picks enable row level security;
alter table buddy_messages enable row level security;
drop policy if exists "People see their own picks" on buddy_picks;
create policy "People see their own picks" on buddy_picks for select to authenticated
  using (picker_id = (select auth.uid()));
drop policy if exists "Buddies read their room" on buddy_messages;
create policy "Buddies read their room" on buddy_messages for select to authenticated
  using ((select auth.uid()) in (low_id, high_id) and buddy_room_open(low_id, high_id));
revoke insert, update, delete on buddy_picks, buddy_messages from anon, authenticated;
revoke select on buddy_picks, buddy_messages from anon;
grant select on buddy_picks, buddy_messages to authenticated;

revoke execute on function sat_in(uuid, uuid) from public, anon, authenticated;
revoke execute on function buddies_matched(uuid, uuid) from public, anon, authenticated;
revoke execute on function buddy_room_open(uuid, uuid) from public, anon;
grant execute on function buddy_room_open(uuid, uuid) to authenticated;
revoke execute on function picks_close_at(timestamptz, int) from public, anon;
grant execute on function picks_close_at(timestamptz, int) to authenticated;
revoke execute on function get_session_people(uuid) from public, anon;
grant execute on function get_session_people(uuid) to authenticated;
revoke execute on function save_buddy_picks(uuid, uuid[]) from public, anon;
grant execute on function save_buddy_picks(uuid, uuid[]) to authenticated;
revoke execute on function get_my_buddies() from public, anon;
grant execute on function get_my_buddies() to authenticated;
revoke execute on function send_buddy_message(uuid, text, text, jsonb) from public, anon;
grant execute on function send_buddy_message(uuid, text, text, jsonb) to authenticated;
revoke execute on function unpick_buddy(uuid) from public, anon;
grant execute on function unpick_buddy(uuid) to authenticated;

-- New messages reach an open chat through Supabase Realtime (RLS decides who receives them).
-- Skipped where the publication is missing (local tests).
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'buddy_messages') then
    alter publication supabase_realtime add table buddy_messages;
  end if;
end
$do$;

-- 27. Buddy games (Kelly 2 Nov): Slow Chess and Word Rush between two matched buddies, saved here so both people
-- see the same board and scoreboard, and one person can have a game going with each buddy at the same time.
-- One active game per pair and game. Slow Chess keeps the engine's move tokens ('e2e4', 'e7e8q', 'r' = resign);
-- Word Rush keeps one deal code and each person's score for their own timed round.
create table if not exists buddy_games (
  id uuid primary key default gen_random_uuid(),
  low_id uuid not null references profiles(id) on delete cascade,
  high_id uuid not null references profiles(id) on delete cascade,
  game text not null check (game in ('Word Rush', 'Slow Chess')),
  status text not null default 'active' check (status in ('active', 'done')),
  white_id uuid references profiles(id) on delete cascade,
  moves text[] not null default '{}',
  result text check (result in ('w', 'b', 'd')),
  deal text,
  minutes int check (minutes in (1, 3, 5)),
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (low_id < high_id),
  check (white_id is null or white_id in (low_id, high_id)),
  check (game <> 'Slow Chess' or white_id is not null),
  check (game <> 'Word Rush' or (deal is not null and minutes is not null))
);
create unique index if not exists uq_buddy_games_active on buddy_games (low_id, high_id, game) where status = 'active';
create index if not exists idx_buddy_games_high on buddy_games (high_id, status);
create index if not exists idx_buddy_games_white on buddy_games (white_id);

-- Starts a game with a buddy, or returns the one already going (one tap from the Buddy Room or the Games page).
-- A new game puts a card in the Buddy Room chat. Word Rush: if I already played the open deal, it is closed and
-- a new deal starts. Slow Chess: the person who starts plays White.
create or replace function start_buddy_game(p_with uuid, p_game text, p_minutes int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_g buddy_games%rowtype;
  v_have boolean := false;
  v_id uuid;
  v_deal text := null;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  if coalesce(p_game, '') not in ('Word Rush', 'Slow Chess') then
    return jsonb_build_object('success', false, 'error', 'Unknown game.');
  end if;
  if p_with is null or not buddies_matched(v_me, p_with) then
    return jsonb_build_object('success', false, 'error', 'This Buddy Room is closed.');
  end if;
  if p_game = 'Word Rush' and coalesce(p_minutes, 0) not in (1, 3, 5) then
    return jsonb_build_object('success', false, 'error', 'Choose 1, 3 or 5 minutes.');
  end if;
  v_low := least(v_me, p_with);
  v_high := greatest(v_me, p_with);
  -- Two taps at once (or both buddies at once) still make a single game.
  perform pg_advisory_xact_lock(hashtextextended(v_low::text || v_high::text || p_game, 0));

  select * into v_g from buddy_games
  where low_id = v_low and high_id = v_high and game = p_game and status = 'active'
  for update;
  if found then
    if p_game = 'Word Rush' and coalesce((v_g.scores -> v_me::text ->> 'done')::boolean, false) then
      update buddy_games set status = 'done', updated_at = now() where id = v_g.id;
    else
      return jsonb_build_object('success', true, 'id', v_g.id, 'created', false);
    end if;
  end if;

  if p_game = 'Word Rush' then
    select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '') into v_deal
    from generate_series(1, 5);
  end if;
  insert into buddy_games (low_id, high_id, game, white_id, deal, minutes)
  values (v_low, v_high, p_game,
          case when p_game = 'Slow Chess' then v_me end,
          v_deal,
          case when p_game = 'Word Rush' then p_minutes end)
  returning id into v_id;
  insert into buddy_messages (low_id, high_id, sender_id, kind, body, payload)
  values (v_low, v_high, v_me, 'game', 'Want to play ' || p_game || '?',
          jsonb_build_object('game', p_game, 'game_id', v_id));
  return jsonb_build_object('success', true, 'id', v_id, 'created', true);
end;
$$;

-- Slow Chess: the person whose turn it is adds one move. p_ply is the number of moves the caller saw, so a stale
-- screen cannot overwrite a newer move. p_result ('w', 'b', 'd') is sent by the client when the move ends the game
-- (the rules live in the browser engine); a resignation sets it here.
create or replace function buddy_game_move(p_game uuid, p_ply int, p_token text, p_result text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_g buddy_games%rowtype;
  v_mover uuid;
  v_result text := p_result;
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_g from buddy_games where id = p_game for update;
  if not found or v_g.game <> 'Slow Chess' or v_me not in (v_g.low_id, v_g.high_id)
     or not buddies_matched(v_g.low_id, v_g.high_id) then
    return jsonb_build_object('success', false, 'error', 'This game is closed.');
  end if;
  if v_g.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'This game is over.');
  end if;
  if cardinality(v_g.moves) <> coalesce(p_ply, -1) then
    return jsonb_build_object('success', false, 'error', 'The board changed. Reload to see the latest move.');
  end if;
  v_mover := case when cardinality(v_g.moves) % 2 = 0 then v_g.white_id
                  else case when v_g.white_id = v_g.low_id then v_g.high_id else v_g.low_id end end;
  if v_mover <> v_me then
    return jsonb_build_object('success', false, 'error', 'It is not your move.');
  end if;
  if coalesce(p_token, '') !~ '^([a-h][1-8][a-h][1-8][qrbn]?|r)$' or cardinality(v_g.moves) >= 600 then
    return jsonb_build_object('success', false, 'error', 'That move is not valid.');
  end if;
  if p_token = 'r' then
    v_result := case when v_mover = v_g.white_id then 'b' else 'w' end;
  elsif v_result is not null and v_result not in ('w', 'b', 'd') then
    return jsonb_build_object('success', false, 'error', 'That result is not valid.');
  end if;

  update buddy_games
  set moves = array_append(moves, p_token),
      result = v_result,
      status = case when v_result is null then 'active' else 'done' end,
      updated_at = now()
  where id = p_game
  returning * into v_g;
  return jsonb_build_object('success', true, 'game', to_jsonb(v_g));
end;
$$;

-- Word Rush: each person plays the deal once. The first call starts their round (so the buddy sees "playing now"),
-- later calls update the running score, and p_done closes it. When both are done the game is over.
-- A round that runs more than 30 seconds past its time is closed with the last saved score.
create or replace function buddy_game_score(p_game uuid, p_score int, p_words int, p_done boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_g buddy_games%rowtype;
  v_mine jsonb;
  v_started timestamptz;
  v_late boolean;
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  select * into v_g from buddy_games where id = p_game for update;
  if not found or v_g.game <> 'Word Rush' or v_me not in (v_g.low_id, v_g.high_id)
     or not buddies_matched(v_g.low_id, v_g.high_id) then
    return jsonb_build_object('success', false, 'error', 'This game is closed.');
  end if;
  if v_g.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'This game is over.');
  end if;
  if p_score is null or p_score not between -100 and 3000 or p_words is null or p_words not between 0 and 300 then
    return jsonb_build_object('success', false, 'error', 'That score is not valid.');
  end if;
  v_mine := v_g.scores -> v_me::text;
  if v_mine is not null and (v_mine ->> 'done')::boolean then
    return jsonb_build_object('success', false, 'error', 'You already played this deal.');
  end if;
  v_started := coalesce((v_mine ->> 'started_at')::timestamptz, now());
  v_late := now() > v_started + make_interval(mins => v_g.minutes) + interval '30 seconds';
  if v_late and v_mine is not null then
    p_score := (v_mine ->> 'score')::int;
    p_words := (v_mine ->> 'words')::int;
    p_done := true;
  end if;

  update buddy_games
  set scores = scores || jsonb_build_object(v_me::text, jsonb_build_object(
        'score', p_score, 'words', p_words, 'done', coalesce(p_done, false), 'started_at', v_started)),
      updated_at = now()
  where id = p_game
  returning * into v_g;
  if (select count(*) from jsonb_each(v_g.scores) e where (e.value ->> 'done')::boolean) = 2 then
    update buddy_games set status = 'done' where id = p_game returning * into v_g;
  end if;
  return jsonb_build_object('success', true, 'game', to_jsonb(v_g));
end;
$$;

alter table buddy_games enable row level security;
drop policy if exists "Buddies read their games" on buddy_games;
create policy "Buddies read their games" on buddy_games for select to authenticated
  using ((select auth.uid()) in (low_id, high_id) and buddy_room_open(low_id, high_id));
revoke insert, update, delete on buddy_games from anon, authenticated;
revoke select on buddy_games from anon;
grant select on buddy_games to authenticated;

revoke execute on function start_buddy_game(uuid, text, int) from public, anon;
grant execute on function start_buddy_game(uuid, text, int) to authenticated;
revoke execute on function buddy_game_move(uuid, int, text, text) from public, anon;
grant execute on function buddy_game_move(uuid, int, text, text) to authenticated;
revoke execute on function buddy_game_score(uuid, int, int, boolean) from public, anon;
grant execute on function buddy_game_score(uuid, int, int, boolean) to authenticated;

-- Moves and scores reach the other person's open game through Supabase Realtime (RLS decides who receives them).
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'buddy_games') then
    alter publication supabase_realtime add table buddy_games;
  end if;
end
$do$;

-- 28. Usage (Andry, 3 Nov): what live rooms and reminder emails used this month, next to the plan limits of the
-- outside services (Daily video minutes, Resend emails). The numbers are estimates from this database. Daily and
-- Resend bill what they measured themselves, and Resend also sends the sign-up code emails, which are not counted here.
alter table app_config add column if not exists daily_minutes_limit int not null default 10000
  check (daily_minutes_limit between 0 and 10000000);
alter table app_config add column if not exists resend_emails_limit int not null default 3000
  check (resend_emails_limit between 0 and 10000000);

create or replace function admin_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_cfg app_config%rowtype;
  v_minutes int;
  v_emails int;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can see usage.');
  end if;
  select * into v_cfg from app_config where id = 1;
  -- Each member counts from the moment they first joined until the session ends (or now, while it still runs).
  -- Admins who join without a seat have no booking, so they are not counted.
  select coalesce(ceil(sum(greatest(0, extract(epoch from
           least(s.starts_at + make_interval(mins => s.minutes), now()) - b.joined_at) / 60))), 0)::int
  into v_minutes
  from bookings b join sessions s on s.id = b.session_id
  where b.joined_at >= v_from;
  select count(*)::int into v_emails from reminder_log where email_sent and claimed_at >= v_from;
  return jsonb_build_object('success', true, 'month_start', v_from,
    'daily_minutes', v_minutes, 'daily_limit', v_cfg.daily_minutes_limit,
    'resend_emails', v_emails, 'resend_limit', v_cfg.resend_emails_limit);
end;
$$;

create or replace function admin_save_usage_limits(p_daily int, p_resend int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change limits.');
  end if;
  if p_daily is null or p_resend is null or p_daily not between 0 and 10000000
     or p_resend not between 0 and 10000000 then
    return jsonb_build_object('success', false, 'error', 'Enter whole numbers from 0 up.');
  end if;
  update app_config set daily_minutes_limit = p_daily, resend_emails_limit = p_resend where id = 1;
  insert into admin_log (admin_id, action, details)
  values (auth.uid(), 'usage_limits_updated',
          jsonb_build_object('daily_minutes_limit', p_daily, 'resend_emails_limit', p_resend));
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function admin_usage() from public, anon;
grant execute on function admin_usage() to authenticated;
revoke execute on function admin_save_usage_limits(int, int) from public, anon;
grant execute on function admin_save_usage_limits(int, int) to authenticated;

-- 29. Plan prices in Settings (Andry, 3 Nov). plan_price_cents() and extras_price_cents() (section 23) read the
-- app_config columns, so the next checkout, renewal or extra-session purchase uses the new price. What a member
-- already paid, and the period it covers, does not change. get_plans() is what the pages show: prices, sessions
-- per month and people per Household, readable before sign-in because it holds nothing private.
create or replace function get_plans()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'individual', jsonb_build_object(
      'monthly_cents', c.solo_monthly_cents, 'annual_cents', c.solo_annual_cents, 'credits', c.monthly_credits),
    'household', jsonb_build_object(
      'monthly_cents', c.household_monthly_cents, 'annual_cents', c.household_annual_cents,
      'credits', c.household_monthly_credits, 'people', c.household_max_people),
    'extras', jsonb_build_array(
      jsonb_build_object('amount', 1, 'cents', c.extra_1_cents),
      jsonb_build_object('amount', 5, 'cents', c.extra_5_cents))
  )
  from app_config c where c.id = 1;
$$;

revoke execute on function get_plans() from public;
grant execute on function get_plans() to anon, authenticated;

-- 30. Bookings list for the admin (Andry, 3 Nov): one row per seat, filtered and paged on the server. Search matches the
-- member's name or email; status 'held' means a confirmed seat still waiting for the Hello Video; p_from/p_to bound the
-- session start (from inclusive, to exclusive). Admin only.
create or replace function admin_list_bookings(
  p_search text default null,
  p_status text default null,
  p_credit text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_newest_first boolean default false,
  p_offset int default 0,
  p_limit int default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_term text := nullif(trim(coalesce(p_search, '')), '');
  v_like text;
  v_total int;
  v_rows jsonb;
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can list bookings.');
  end if;
  if p_status is not null and p_status not in ('confirmed', 'held', 'cancelled', 'late_cancelled', 'attended') then
    return jsonb_build_object('success', false, 'error', 'Unknown status.');
  end if;
  if p_credit is not null and p_credit not in ('monthly', 'addon') then
    return jsonb_build_object('success', false, 'error', 'Unknown credit type.');
  end if;
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  -- the search text is plain text: % and _ must not act as wildcards
  v_like := '%' || replace(replace(replace(coalesce(v_term, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with f as materialized (
    select b.id, b.status, b.credit_type, b.held, b.camera_off, b.created_at, b.cancelled_at, b.release_reason,
           s.id as session_id, s.title, s.starts_at, s.minutes,
           p.id as member_id, p.first_name, p.last_name, p.email
    from bookings b
    join sessions s on s.id = b.session_id
    join profiles p on p.id = b.user_id
    where (p_status is null
           or (p_status = 'held' and b.held and b.status = 'confirmed')
           or (p_status <> 'held' and b.status = p_status))
      and (p_credit is null or b.credit_type = p_credit)
      and (p_from is null or s.starts_at >= p_from)
      and (p_to is null or s.starts_at < p_to)
      and (v_term is null or concat_ws(' ', p.first_name, p.last_name) ilike v_like or p.email ilike v_like)
  )
  select (select count(*) from f),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', x.id, 'status', x.status, 'credit_type', x.credit_type, 'held', x.held,
                    'camera_off', x.camera_off, 'created_at', x.created_at, 'cancelled_at', x.cancelled_at,
                    'release_reason', x.release_reason,
                    'session', jsonb_build_object('id', x.session_id, 'title', x.title, 'starts_at', x.starts_at,
                                                  'minutes', x.minutes),
                    'member', jsonb_build_object('id', x.member_id, 'first_name', x.first_name,
                                                 'last_name', x.last_name, 'email', x.email))
                  order by case when p_newest_first then x.starts_at end desc,
                           case when not p_newest_first then x.starts_at end asc, x.created_at, x.id)
           from (select * from f
                 order by case when p_newest_first then starts_at end desc,
                          case when not p_newest_first then starts_at end asc, created_at, id
                 limit p_limit offset p_offset) x
         ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object('success', true, 'total', v_total, 'rows', v_rows);
end;
$$;

revoke execute on function admin_list_bookings(text, text, text, timestamptz, timestamptz, boolean, int, int) from public, anon;
grant execute on function admin_list_bookings(text, text, text, timestamptz, timestamptz, boolean, int, int) to authenticated;

-- ========================================================================
-- 31. Trivia, Trivier, Triviest (Kelly's board game from the 25 Oct zip, wired in 5 Nov). One game per Trivia
-- session, played in the live room next to the video. Every move runs in the trivia-act Edge Function with Kelly's
-- engine (functions/_shared/trivia.js), so the page never sees an answer and nobody can move for someone else.
-- Members read only their own session's public game state. Questions with answers, the hidden choice order and the
-- random seed are for the server only (no member policy on purpose).
-- ========================================================================
create table if not exists trivia_categories (
  id text primary key,
  name text not null,
  color text not null default '#888888' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0
);

create table if not exists trivia_questions (
  id text primary key,
  cat text not null references trivia_categories(id) on update cascade,
  q text not null,
  a text not null,
  wrong text[] not null check (array_length(wrong, 1) between 2 and 5),
  note text,
  source text,
  active boolean not null default true,
  added_at timestamptz not null default now()
);
create unique index if not exists uq_trivia_questions_text on trivia_questions (lower(q));

-- state = the engine's game JSON without q.order and rng (they would reveal answers); card = the open question as
-- every player sees it (text and choices in display order, no answer). rev guards against two moves at once.
create table if not exists trivia_rooms (
  session_id uuid primary key references sessions(id) on delete cascade,
  state jsonb not null,
  card jsonb,
  rev int not null default 0,
  updated_at timestamptz not null default now()
);

-- { "order": [...] or null, "rng": int }: kept apart so it is never readable or sent over live updates.
create table if not exists trivia_room_secrets (
  session_id uuid primary key references trivia_rooms(session_id) on delete cascade,
  secret jsonb not null default '{}'::jsonb
);

alter table trivia_categories enable row level security;
alter table trivia_questions enable row level security;
alter table trivia_rooms enable row level security;
alter table trivia_room_secrets enable row level security;

revoke all on trivia_categories, trivia_questions, trivia_rooms, trivia_room_secrets from anon, authenticated;
grant select on trivia_rooms to authenticated;
-- Admins manage the question set (a Questions page can come later); members get no policy on either table.
grant select, insert, update, delete on trivia_categories, trivia_questions to authenticated;

drop policy if exists trivia_categories_admin on trivia_categories;
create policy trivia_categories_admin on trivia_categories for all to authenticated
  using (is_admin()) with check (is_admin());
drop policy if exists trivia_questions_admin on trivia_questions;
create policy trivia_questions_admin on trivia_questions for all to authenticated
  using (is_admin()) with check (is_admin());
-- A room is visible to the people with a seat in that session (and admins), the same people the video room lets in.
drop policy if exists trivia_rooms_read on trivia_rooms;
create policy trivia_rooms_read on trivia_rooms for select to authenticated
  using (is_admin() or exists (
    select 1 from bookings b
    where b.session_id = trivia_rooms.session_id and b.user_id = auth.uid()
      and b.status in ('confirmed', 'attended') and not b.held));

-- Who may play a session's game: whoever room_join lets into the video room (seat, approved Hello Video, account
-- active), from 5 minutes before the start until the end. Admins can always play. Returns the player's first name.
create or replace function trivia_seat(p_user uuid, p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg app_config%rowtype;
  v_me profiles%rowtype;
  v_s sessions%rowtype;
begin
  select * into v_cfg from app_config where id = 1;
  select * into v_me from profiles where id = p_user;
  if not found or v_me.disabled_at is not null then
    return jsonb_build_object('success', false, 'error', 'This account can’t play. Please contact us.');
  end if;
  select * into v_s from sessions where id = p_session;
  if not found or (not v_s.published and not v_me.is_admin) then
    return jsonb_build_object('success', false, 'error', 'This session was not found.');
  end if;
  if coalesce(v_s.slug, '') not like 'trivia-trivier-triviest%' then
    return jsonb_build_object('success', false, 'error', 'This session has no trivia game.');
  end if;
  if now() < v_s.starts_at - interval '5 minutes' then
    return jsonb_build_object('success', false, 'error', 'The game opens with the room, 5 minutes before the start.');
  elsif now() >= v_s.starts_at + make_interval(mins => v_s.minutes) then
    return jsonb_build_object('success', false, 'error', 'This session has ended.');
  end if;
  if not v_me.is_admin then
    if not exists (select 1 from bookings where session_id = p_session and user_id = p_user
                   and status in ('confirmed', 'attended') and not held) then
      return jsonb_build_object('success', false, 'error', 'You don’t have a seat in this session.');
    end if;
    if v_cfg.require_hello_video and v_me.hello_status <> 'approved' then
      return jsonb_build_object('success', false, 'error', 'Rooms open for you once your Hello Video is approved.');
    end if;
  end if;
  return jsonb_build_object('success', true, 'name', public_name(v_me));
end;
$$;

-- Saves one move in one step: the public state and card, then the hidden part. p_rev = -1 creates the room;
-- otherwise p_rev must still be the row's rev, or nothing is saved and false comes back (the function retries).
create or replace function trivia_save(p_session uuid, p_rev int, p_state jsonb, p_card jsonb, p_secret jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rev < 0 then
    insert into trivia_rooms (session_id, state, card, rev) values (p_session, p_state, p_card, 0)
    on conflict (session_id) do nothing;
  else
    update trivia_rooms set state = p_state, card = p_card, rev = rev + 1, updated_at = now()
    where session_id = p_session and rev = p_rev;
  end if;
  if not found then
    return false;
  end if;
  insert into trivia_room_secrets (session_id, secret) values (p_session, coalesce(p_secret, '{}'::jsonb))
  on conflict (session_id) do update set secret = excluded.secret;
  return true;
end;
$$;

revoke execute on function trivia_seat(uuid, uuid) from public, anon, authenticated;
revoke execute on function trivia_save(uuid, int, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function trivia_seat(uuid, uuid) to service_role;
grant execute on function trivia_save(uuid, int, jsonb, jsonb, jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trivia_rooms') then
    alter publication supabase_realtime add table trivia_rooms;
  end if;
end $$;

-- Kelly's question bank: 88 starter questions (25 Oct) plus 119 from her 6 Nov zip, 6 categories. Re-running keeps
-- any edits made since (on conflict do nothing). Her 6 Nov bank dropped the Louvre question (arts-07), so it is no
-- longer seeded; databases seeded before that turn it off once in jobs/meetdo-connect/kelly-fixes-2026-11-06.sql.
insert into trivia_categories (id, name, color, sort) values
  ('geo', 'Geography', '#0057E7', 1),
  ('hist', 'History', '#E4002B', 2),
  ('sci', 'Science & Nature', '#00A651', 3),
  ('arts', 'Arts & Books', '#7B2CBF', 4),
  ('play', 'Sports & Games', '#FF7A00', 5),
  ('food', 'Food & Everyday Life', '#FFD500', 6)
on conflict do nothing;
-- Kelly 6 Nov: brighter colours. Only rows still on the 25 Oct colour change, so a colour set in Admin stays.
update trivia_categories c set color = v.new
  from (values ('geo', '#2E86AB', '#0057E7'), ('hist', '#C1666B', '#E4002B'), ('sci', '#3A9D5D', '#00A651'),
               ('arts', '#8E5BA8', '#7B2CBF'), ('play', '#E08E2B', '#FF7A00'), ('food', '#D2B13C', '#FFD500')) v(id, old, new)
 where c.id = v.id and upper(c.color) = v.old;
insert into trivia_questions (id, cat, q, a, wrong, note, source) values
  ('geo-01', 'geo', 'What is the capital of Australia?', 'Canberra', array['Sydney', 'Melbourne', 'Perth'], 'Sydney is bigger, but Canberra was built to be the capital.', 'Starter question written for this project; check before relying on it'),
  ('geo-02', 'geo', 'Which is the longest river in Africa?', 'The Nile', array['The Congo', 'The Niger', 'The Zambezi'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-03', 'geo', 'Which country has the most natural lakes?', 'Canada', array['Russia', 'The United States', 'Finland'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-04', 'geo', 'Mount Kilimanjaro is in which country?', 'Tanzania', array['Kenya', 'Uganda', 'Ethiopia'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-05', 'geo', 'Which is the smallest country in the world by area?', 'Vatican City', array['Monaco', 'San Marino', 'Liechtenstein'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-06', 'geo', 'Which is the largest ocean?', 'The Pacific', array['The Atlantic', 'The Indian', 'The Arctic'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-07', 'geo', 'What is the capital of Canada?', 'Ottawa', array['Toronto', 'Montreal', 'Vancouver'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-08', 'geo', 'On which continent is the Sahara Desert?', 'Africa', array['Asia', 'Australia', 'South America'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-09', 'geo', 'Which US state is the largest by area?', 'Alaska', array['Texas', 'California', 'Montana'], null, 'Starter question written for this project; check before relying on it'),
  ('geo-10', 'geo', 'Which river flows through Paris?', 'The Seine', array['The Thames', 'The Rhine', 'The Danube'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-01', 'hist', 'In which year did the Berlin Wall fall?', '1989', array['1979', '1985', '1991'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-02', 'hist', 'Who was the first President of the United States?', 'George Washington', array['John Adams', 'Thomas Jefferson', 'Benjamin Franklin'], 'Franklin was never President.', 'Starter question written for this project; check before relying on it'),
  ('hist-03', 'hist', 'In which country were the Great Pyramids of Giza built?', 'Egypt', array['Mexico', 'Sudan', 'Iraq'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-04', 'hist', 'In which year did the Titanic sink?', '1912', array['1905', '1918', '1923'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-05', 'hist', 'Who was the first person to walk on the Moon?', 'Neil Armstrong', array['Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'], 'Buzz Aldrin followed him onto the surface.', 'Starter question written for this project; check before relying on it'),
  ('hist-06', 'hist', 'Which empire built the Colosseum in Rome?', 'The Roman Empire', array['The Greek Empire', 'The Ottoman Empire', 'The Persian Empire'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-07', 'hist', 'In which year was the US Declaration of Independence adopted?', '1776', array['1783', '1789', '1765'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-08', 'hist', 'Which English king sealed the Magna Carta in 1215?', 'King John', array['Henry VIII', 'Richard I', 'Edward I'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-09', 'hist', 'Which ship carried the Pilgrims to Plymouth in 1620?', 'The Mayflower', array['The Santa Maria', 'The Endeavour', 'The Beagle'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-10', 'hist', 'In which year did World War II end?', '1945', array['1939', '1942', '1950'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-01', 'sci', 'What is the chemical symbol for gold?', 'Au', array['Ag', 'Gd', 'Go'], 'From the Latin word aurum.', 'Starter question written for this project; check before relying on it'),
  ('sci-02', 'sci', 'Which planet is closest to the Sun?', 'Mercury', array['Venus', 'Mars', 'Earth'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-03', 'sci', 'How many bones does an adult human body have?', '206', array['180', '212', '250'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-04', 'sci', 'Which gas do plants take in for photosynthesis?', 'Carbon dioxide', array['Oxygen', 'Nitrogen', 'Hydrogen'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-05', 'sci', 'What is the largest mammal on Earth?', 'The blue whale', array['The African elephant', 'The giraffe', 'The polar bear'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-06', 'sci', 'At what temperature in Celsius does water boil at sea level?', '100', array['90', '110', '212'], '212 is the Fahrenheit figure.', 'Starter question written for this project; check before relying on it'),
  ('sci-07', 'sci', 'What is the hardest natural substance?', 'Diamond', array['Quartz', 'Steel', 'Granite'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-08', 'sci', 'Which planet is known as the Red Planet?', 'Mars', array['Jupiter', 'Mercury', 'Saturn'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-09', 'sci', 'In which part of a plant cell does photosynthesis happen?', 'The chloroplast', array['The nucleus', 'The mitochondrion', 'The ribosome'], null, 'Starter question written for this project; check before relying on it'),
  ('sci-10', 'sci', 'How many legs does an insect have?', 'Six', array['Four', 'Eight', 'Ten'], 'Spiders have eight and are not insects.', 'Starter question written for this project; check before relying on it'),
  ('arts-01', 'arts', 'Who painted the Mona Lisa?', 'Leonardo da Vinci', array['Michelangelo', 'Raphael', 'Vincent van Gogh'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-02', 'arts', 'Who wrote the novel Pride and Prejudice?', 'Jane Austen', array['Charlotte Bronte', 'Emily Bronte', 'George Eliot'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-03', 'arts', 'Who wrote the play Romeo and Juliet?', 'William Shakespeare', array['Christopher Marlowe', 'Charles Dickens', 'Oscar Wilde'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-04', 'arts', 'Who painted The Starry Night?', 'Vincent van Gogh', array['Claude Monet', 'Pablo Picasso', 'Paul Cezanne'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-05', 'arts', 'How many strings does a standard violin have?', 'Four', array['Five', 'Six', 'Three'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-06', 'arts', 'Who wrote The Hobbit?', 'J. R. R. Tolkien', array['C. S. Lewis', 'Roald Dahl', 'J. K. Rowling'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-08', 'arts', 'Which composer wrote the Fifth Symphony that begins da-da-da-DUM?', 'Ludwig van Beethoven', array['Wolfgang Mozart', 'Johann Bach', 'Franz Schubert'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-09', 'arts', 'How many keys does a standard piano have?', '88', array['76', '92', '100'], null, 'Starter question written for this project; check before relying on it'),
  ('arts-10', 'arts', 'Who wrote the novel Moby-Dick?', 'Herman Melville', array['Mark Twain', 'Nathaniel Hawthorne', 'Jack London'], null, 'Starter question written for this project; check before relying on it'),
  ('play-01', 'play', 'How many players from one team are on the field in soccer?', '11', array['9', '10', '12'], null, 'Starter question written for this project; check before relying on it'),
  ('play-02', 'play', 'How often are the Summer Olympic Games held?', 'Every 4 years', array['Every 2 years', 'Every 3 years', 'Every 5 years'], null, 'Starter question written for this project; check before relying on it'),
  ('play-03', 'play', 'In chess, which piece can only move diagonally?', 'The bishop', array['The rook', 'The knight', 'The queen'], null, 'Starter question written for this project; check before relying on it'),
  ('play-04', 'play', 'Which sport is played at Wimbledon?', 'Tennis', array['Cricket', 'Golf', 'Badminton'], null, 'Starter question written for this project; check before relying on it'),
  ('play-05', 'play', 'How many points is a touchdown worth in American football, before the extra point?', '6', array['3', '7', '5'], null, 'Starter question written for this project; check before relying on it'),
  ('play-06', 'play', 'How many cards are in a standard deck, without jokers?', '52', array['48', '54', '56'], null, 'Starter question written for this project; check before relying on it'),
  ('play-07', 'play', 'How many holes are played in a full round of golf?', '18', array['9', '12', '24'], null, 'Starter question written for this project; check before relying on it'),
  ('play-08', 'play', 'Which country hosted the 2016 Summer Olympics?', 'Brazil', array['China', 'Greece', 'Australia'], 'In Rio de Janeiro.', 'Starter question written for this project; check before relying on it'),
  ('play-09', 'play', 'Which sport uses a shuttlecock?', 'Badminton', array['Squash', 'Table tennis', 'Lacrosse'], null, 'Starter question written for this project; check before relying on it'),
  ('play-10', 'play', 'How many squares are on a chessboard?', '64', array['49', '81', '72'], null, 'Starter question written for this project; check before relying on it'),
  ('food-01', 'food', 'What is the main ingredient of guacamole?', 'Avocado', array['Cucumber', 'Pea', 'Lime'], 'Lime is in it, but avocado is the base.', 'Starter question written for this project; check before relying on it'),
  ('food-02', 'food', 'Which country did sushi come from?', 'Japan', array['China', 'Korea', 'Thailand'], null, 'Starter question written for this project; check before relying on it'),
  ('food-03', 'food', 'The pasta called farfalle is named after which shape?', 'Butterflies', array['Little ears', 'Quills', 'Shells'], 'Often called bow-tie pasta.', 'Starter question written for this project; check before relying on it'),
  ('food-04', 'food', 'Which spice is the most expensive by weight?', 'Saffron', array['Vanilla', 'Cinnamon', 'Paprika'], 'Vanilla is a close second.', 'Starter question written for this project; check before relying on it'),
  ('food-05', 'food', 'Which ingredient makes bread dough rise?', 'Yeast', array['Salt', 'Sugar', 'Flour'], null, 'Starter question written for this project; check before relying on it'),
  ('food-06', 'food', 'What is tofu made from?', 'Soybeans', array['Rice', 'Chickpeas', 'Wheat'], null, 'Starter question written for this project; check before relying on it'),
  ('food-07', 'food', 'How many minutes are in one day?', '1,440', array['1,200', '1,000', '2,400'], null, 'Starter question written for this project; check before relying on it'),
  ('food-08', 'food', 'Which vitamin does your body make when skin is in sunlight?', 'Vitamin D', array['Vitamin C', 'Vitamin A', 'Vitamin B12'], null, 'Starter question written for this project; check before relying on it'),
  ('food-09', 'food', 'Gouda cheese is named after a town in which country?', 'The Netherlands', array['Switzerland', 'France', 'Denmark'], null, 'Starter question written for this project; check before relying on it'),
  ('food-10', 'food', 'Which nut is the main ingredient of marzipan?', 'Almond', array['Walnut', 'Peanut', 'Cashew'], null, 'Starter question written for this project; check before relying on it'),
  ('hist-11', 'hist', 'What was the first state of the United States?', 'Delaware', array['Virginia', 'Massachusetts', 'New York'], 'Delaware was the first state to ratify the Constitution, in 1787.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('play-11', 'play', 'In basketball, how many players from each team are on the court at the same time?', 'Five', array['Four', 'Six', 'Seven'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('play-12', 'play', 'How many dots are there in total on a pair of standard dice?', '42', array['21', '36', '48'], 'Each die has 21 dots.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('food-11', 'food', 'Which company did Steve Jobs help start?', 'Apple', array['Microsoft', 'Amazon', 'Google'], 'He co-founded Apple in 1976.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('geo-11', 'geo', 'Which is the largest country in the world by area?', 'Russia', array['Canada', 'China', 'The United States'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-11', 'sci', 'What is the largest organ of the human body?', 'The skin', array['The liver', 'The heart', 'The lungs'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('hist-12', 'hist', 'In what year was Joe Biden elected president?', '2020', array['2016', '2018', '2022'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('geo-12', 'geo', 'In which city can you find the Eiffel Tower?', 'Paris', array['Rome', 'London', 'Brussels'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('geo-13', 'geo', 'Which of these is one of the five Great Lakes?', 'Lake Huron', array['Lake Tahoe', 'Lake Victoria', 'Lake Baikal'], 'The five are Superior, Michigan, Huron, Erie and Ontario.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('food-12', 'food', 'Which fast-food chain is known for its golden arches?', 'McDonald''s', array['Burger King', 'Wendy''s', 'Taco Bell'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('food-13', 'food', 'For how many nights is Hanukkah celebrated?', 'Eight', array['Seven', 'Ten', 'Twelve'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-12', 'sci', 'In which galaxy is our solar system?', 'The Milky Way', array['Andromeda', 'Triangulum', 'Whirlpool'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('hist-13', 'hist', 'Where did the ancient Olympic Games begin?', 'Greece', array['Italy', 'Egypt', 'Turkey'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('hist-14', 'hist', 'How many wives did King Henry VIII have?', 'Six', array['Four', 'Five', 'Eight'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('geo-14', 'geo', 'In which country is the world''s tallest building?', 'The United Arab Emirates', array['Saudi Arabia', 'China', 'The United States'], 'The Burj Khalifa, in Dubai.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-13', 'sci', 'How many stars are in our solar system?', 'One', array['Two', 'Eight', 'Nine'], 'Just one: the Sun.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-14', 'sci', 'What is a group of crows called?', 'A murder', array['A parliament', 'A pride', 'A gaggle'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('geo-15', 'geo', 'Which country has the largest population?', 'India', array['China', 'The United States', 'Indonesia'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('geo-16', 'geo', 'About how many miles is the Earth''s circumference at the equator?', '24,901', array['12,450', '18,500', '31,400'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-15', 'sci', 'How many bones does a shark have?', 'None', array['50', '100', '206'], 'Its skeleton is made of cartilage.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-16', 'sci', 'A group of which jungle animal is called an ambush?', 'Tiger', array['Lion', 'Gorilla', 'Elephant'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('arts-11', 'arts', 'Which potion grants good luck in Harry Potter and the Half-Blood Prince?', 'Felix Felicis', array['Polyjuice Potion', 'Veritaserum', 'Amortentia'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('food-14', 'food', 'How many minutes are in one week?', '10,080', array['7,200', '8,640', '14,400'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-17', 'sci', 'Which direction of travel usually makes jet lag worse?', 'Traveling east', array['Traveling west', 'North to south', 'They are exactly the same'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('hist-15', 'hist', 'Which country was the first to give women the right to vote in national elections?', 'New Zealand', array['The United States', 'Finland', 'Australia'], 'In 1893.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('sci-18', 'sci', 'What is cynophobia?', 'A fear of dogs', array['A fear of cats', 'A fear of heights', 'A fear of water'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('food-15', 'food', 'Which animal appears on the Porsche logo?', 'A horse', array['A bull', 'A lion', 'An eagle'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('hist-16', 'hist', 'Who was the first woman to fly solo across the Atlantic Ocean?', 'Amelia Earhart', array['Bessie Coleman', 'Jacqueline Cochran', 'Harriet Quimby'], 'In 1932.', 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.'),
  ('food-16', 'food', 'Which is closest to the average height of an adult man in the United States?', '5 feet 9 inches', array['5 feet 5 inches', '6 feet 0 inches', '6 feet 3 inches'], null, 'Question idea supplied by the site owner; category and wrong answers added by Claude. Check before relying on it.')
on conflict do nothing;
-- Kelly's 6 Nov additions.
insert into trivia_questions (id, cat, q, a, wrong, note, source) values
  ('geo-17', 'geo', 'Which desert covers much of northern Africa?', 'The Sahara', array['The Gobi', 'The Kalahari', 'The Mojave'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-18', 'geo', 'Which is the largest ocean on Earth?', 'The Pacific Ocean', array['The Atlantic Ocean', 'The Indian Ocean', 'The Arctic Ocean'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-19', 'geo', 'What is the capital of Brazil?', 'Brasília', array['Rio de Janeiro', 'São Paulo', 'Salvador'], 'Brasília was built in the 1950s to be the capital.', 'Written by Claude for this project; check before relying on it'),
  ('geo-20', 'geo', 'Which desert covers parts of Mongolia and northern China?', 'The Gobi Desert', array['The Sahara', 'The Atacama', 'The Thar'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-17', 'hist', 'Which ancient people built the mountain city of Machu Picchu?', 'The Inca', array['The Aztec', 'The Maya', 'The Olmec'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-18', 'hist', 'Which ship sank in 1912 after hitting an iceberg on its first voyage?', 'The Titanic', array['The Lusitania', 'The Britannic', 'The Mayflower'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-19', 'hist', 'Who was Britain''s Prime Minister for most of World War II?', 'Winston Churchill', array['Neville Chamberlain', 'Clement Attlee', 'Margaret Thatcher'], 'He took office in 1940.', 'Written by Claude for this project; check before relying on it'),
  ('hist-20', 'hist', 'Who was the main author of the U.S. Declaration of Independence?', 'Thomas Jefferson', array['Benjamin Franklin', 'George Washington', 'John Adams'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-21', 'hist', 'Which U.S. President issued the Emancipation Proclamation?', 'Abraham Lincoln', array['Ulysses S. Grant', 'Thomas Jefferson', 'Andrew Jackson'], 'In 1863.', 'Written by Claude for this project; check before relying on it'),
  ('hist-22', 'hist', 'Which Roman-built wall crosses northern England?', 'Hadrian''s Wall', array['The Antonine Wall', 'Offa''s Dyke', 'The Great Wall'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-23', 'hist', 'In which year did Columbus first sail across the Atlantic for Spain?', '1492', array['1066', '1607', '1776'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-24', 'hist', 'In which country was the Magna Carta signed in 1215?', 'England', array['France', 'Scotland', 'Spain'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-19', 'sci', 'Which planet is best known for its bright rings?', 'Saturn', array['Jupiter', 'Mars', 'Neptune'], 'Jupiter, Uranus and Neptune have rings too, but Saturn''s are the brightest.', 'Written by Claude for this project; check before relying on it'),
  ('sci-20', 'sci', 'How many legs does a spider have?', 'Eight', array['Six', 'Ten', 'Twelve'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-21', 'sci', 'At sea level, at what temperature does water boil in Fahrenheit?', '212 degrees', array['100 degrees', '180 degrees', '250 degrees'], 'That is 100 degrees Celsius.', 'Written by Claude for this project; check before relying on it'),
  ('arts-12', 'arts', 'Which Shakespeare play features Rosencrantz and Guildenstern?', 'Hamlet', array['Macbeth', 'Othello', 'King Lear'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-13', 'arts', 'Who wrote the Harry Potter books?', 'J. K. Rowling', array['Roald Dahl', 'C. S. Lewis', 'Philip Pullman'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-14', 'arts', 'Who wrote the novel 1984?', 'George Orwell', array['Aldous Huxley', 'Ray Bradbury', 'H. G. Wells'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-15', 'arts', 'Which Dr. Seuss book features Sam-I-Am?', 'Green Eggs and Ham', array['The Cat in the Hat', 'Horton Hears a Who!', 'Oh, the Places You''ll Go!'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-16', 'arts', 'Who wrote the novel To Kill a Mockingbird?', 'Harper Lee', array['Truman Capote', 'Toni Morrison', 'Maya Angelou'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-13', 'play', 'How many players does one soccer team have on the field?', 'Eleven', array['Nine', 'Ten', 'Twelve'], 'Including the goalkeeper.', 'Written by Claude for this project; check before relying on it'),
  ('play-14', 'play', 'How many rings are on the Olympic flag?', 'Five', array['Four', 'Six', 'Seven'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-15', 'play', 'At which tournament do players dress in white and play on grass in London?', 'Wimbledon', array['The U.S. Open', 'The French Open', 'The Australian Open'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-16', 'play', 'In Monopoly, how much money do you collect when you pass Go?', '$200', array['$100', '$150', '$500'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-17', 'play', 'In Scrabble, how many letter tiles does each player hold?', 'Seven', array['Five', 'Six', 'Nine'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-17', 'food', 'How many days are in a leap year?', '366', array['364', '365', '367'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-18', 'food', 'Which dried fruit is made from grapes?', 'Raisins', array['Prunes', 'Dates', 'Figs'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-19', 'food', 'Which nut is the main ingredient in marzipan?', 'Almonds', array['Peanuts', 'Cashews', 'Walnuts'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-20', 'food', 'Which fruit, with a strong smell, is called the king of fruits in Southeast Asia?', 'Durian', array['Mango', 'Jackfruit', 'Papaya'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-21', 'food', 'How many teaspoons are in one tablespoon?', 'Three', array['Two', 'Four', 'Six'], 'In the U.S. measuring system.', 'Written by Claude for this project; check before relying on it'),
  ('geo-21', 'geo', 'Which African country has Addis Ababa as its capital?', 'Ethiopia', array['Kenya', 'Nigeria', 'Tanzania'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-22', 'geo', 'Which sea lies between Italy and the Balkan Peninsula?', 'The Adriatic Sea', array['The Baltic Sea', 'The Black Sea', 'The Aegean Sea'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-23', 'geo', 'Which two countries share the world''s longest land border?', 'Canada and the United States', array['Russia and China', 'Argentina and Chile', 'India and Pakistan'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-24', 'geo', 'What is the capital of Turkey?', 'Ankara', array['Istanbul', 'Izmir', 'Antalya'], 'Istanbul is the largest city, but Ankara is the capital.', 'Written by Claude for this project; check before relying on it'),
  ('geo-25', 'geo', 'Which strait separates Spain from Morocco?', 'The Strait of Gibraltar', array['The Bosphorus', 'The Strait of Hormuz', 'The English Channel'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-26', 'geo', 'Which mountain range separates Europe from Asia in Russia?', 'The Ural Mountains', array['The Alps', 'The Carpathians', 'The Pyrenees'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-27', 'geo', 'Which South American country is named after the equator?', 'Ecuador', array['Colombia', 'Peru', 'Bolivia'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-28', 'geo', 'What is the capital of New Zealand?', 'Wellington', array['Auckland', 'Christchurch', 'Queenstown'], null, 'Written by Claude for this project; check before relying on it'),
  ('geo-29', 'geo', 'Which Hawaiian island is the largest?', 'Hawaii, the Big Island', array['Maui', 'Oahu', 'Kauai'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-25', 'hist', 'Which ancient wonder stood in the harbor of Alexandria, Egypt?', 'The Lighthouse (Pharos)', array['The Colossus', 'The Hanging Gardens', 'The Temple of Artemis'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-26', 'hist', 'Who was the first woman to win a Nobel Prize?', 'Marie Curie', array['Florence Nightingale', 'Rosalind Franklin', 'Mother Teresa'], 'In 1903, for physics.', 'Written by Claude for this project; check before relying on it'),
  ('hist-27', 'hist', 'Which treaty ended World War I with Germany in 1919?', 'The Treaty of Versailles', array['The Treaty of Paris', 'The Treaty of Ghent', 'The Treaty of Tordesillas'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-28', 'hist', 'Which Chinese dynasty is linked to the Terracotta Army?', 'The Qin dynasty', array['The Ming dynasty', 'The Tang dynasty', 'The Han dynasty'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-29', 'hist', 'Who led the Soviet Union during the 1962 Cuban Missile Crisis?', 'Nikita Khrushchev', array['Joseph Stalin', 'Leonid Brezhnev', 'Mikhail Gorbachev'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-30', 'hist', 'Which battle in 1815 ended Napoleon''s rule as emperor?', 'The Battle of Waterloo', array['The Battle of Trafalgar', 'The Battle of Hastings', 'The Battle of Gettysburg'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-31', 'hist', 'Which ancient city was buried by the eruption of Mount Vesuvius in 79 AD?', 'Pompeii', array['Athens', 'Carthage', 'Troy'], null, 'Written by Claude for this project; check before relying on it'),
  ('hist-32', 'hist', 'Who was the first President of South Africa elected after apartheid ended?', 'Nelson Mandela', array['Desmond Tutu', 'F. W. de Klerk', 'Thabo Mbeki'], 'He took office in 1994.', 'Written by Claude for this project; check before relying on it'),
  ('hist-33', 'hist', 'Which famous explorer''s ship was named the Santa María?', 'Christopher Columbus', array['Vasco da Gama', 'Ferdinand Magellan', 'Marco Polo'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-22', 'sci', 'What force keeps the planets in orbit around the Sun?', 'Gravity', array['Magnetism', 'Friction', 'Static electricity'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-23', 'sci', 'What is the closest star to Earth?', 'The Sun', array['Proxima Centauri', 'Sirius', 'Polaris'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-24', 'sci', 'Which element has the chemical symbol O?', 'Oxygen', array['Gold', 'Osmium', 'Oganesson'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-25', 'sci', 'What do bees collect from flowers to make honey?', 'Nectar', array['Tree sap', 'Dew', 'Fruit juice'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-26', 'sci', 'What is the center of an atom called?', 'The nucleus', array['The cell', 'The electron', 'The core shell'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-27', 'sci', 'Which organ pumps blood around the human body?', 'The heart', array['The lungs', 'The kidneys', 'The liver'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-28', 'sci', 'Which animal is the fastest on land?', 'The cheetah', array['The lion', 'The pronghorn', 'The greyhound'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-17', 'arts', 'Who painted the ceiling of the Sistine Chapel?', 'Michelangelo', array['Raphael', 'Leonardo da Vinci', 'Donatello'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-18', 'arts', 'Which author created the detective Sherlock Holmes?', 'Sir Arthur Conan Doyle', array['Agatha Christie', 'Edgar Allan Poe', 'Charles Dickens'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-19', 'arts', 'Which ballet by Tchaikovsky features a Sugar Plum Fairy?', 'The Nutcracker', array['Swan Lake', 'Sleeping Beauty', 'Giselle'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-20', 'arts', 'Who wrote the children''s book Charlotte''s Web?', 'E. B. White', array['Beverly Cleary', 'Roald Dahl', 'Judy Blume'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-21', 'arts', 'Who wrote A Christmas Carol?', 'Charles Dickens', array['Jane Austen', 'Thomas Hardy', 'Lewis Carroll'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-22', 'arts', 'Which Spanish artist painted Guernica?', 'Pablo Picasso', array['Salvador Dalí', 'Joan Miró', 'Francisco Goya'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-23', 'arts', 'Which author wrote Little Women?', 'Louisa May Alcott', array['Emily Dickinson', 'Laura Ingalls Wilder', 'L. M. Montgomery'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-24', 'arts', 'Who wrote the adventure novel Treasure Island?', 'Robert Louis Stevenson', array['Daniel Defoe', 'Jules Verne', 'Rudyard Kipling'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-18', 'play', 'In which sport would you perform a slam dunk?', 'Basketball', array['Volleyball', 'Netball', 'Handball'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-19', 'play', 'How many players are on a baseball team in the field at one time?', 'Nine', array['Seven', 'Ten', 'Eleven'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-20', 'play', 'What is the name for three strikes in a row in bowling?', 'A turkey', array['A hat trick', 'A birdie', 'An eagle'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-21', 'play', 'In which sport do you score a birdie?', 'Golf', array['Tennis', 'Archery', 'Cricket'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-22', 'play', 'How many minutes are in a regulation soccer match, not counting extra time?', '90', array['60', '80', '100'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-23', 'play', 'Which board game uses the words check and checkmate?', 'Chess', array['Checkers', 'Backgammon', 'Go'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-24', 'play', 'In which sport is the Stanley Cup awarded?', 'Ice hockey', array['Basketball', 'Baseball', 'Lacrosse'], null, 'Written by Claude for this project; check before relying on it'),
  ('play-25', 'play', 'What color card does a soccer referee show to send a player off?', 'Red', array['Yellow', 'Blue', 'Green'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-22', 'food', 'Which cheese is traditionally used on a Greek salad?', 'Feta', array['Cheddar', 'Brie', 'Gouda'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-23', 'food', 'What is the main ingredient in hummus?', 'Chickpeas', array['Lentils', 'Black beans', 'Peanuts'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-24', 'food', 'What do you call a baby kangaroo?', 'A joey', array['A cub', 'A kit', 'A pup'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-25', 'food', 'Which popular drink is made by steeping dried leaves in hot water?', 'Tea', array['Cocoa', 'Coffee', 'Cider'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-26', 'food', 'Which Italian dish is made of layers of pasta, sauce and cheese?', 'Lasagna', array['Ravioli', 'Gnocchi', 'Risotto'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-27', 'food', 'How many hours are in a week?', '168', array['144', '156', '180'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-25', 'arts', 'Which singer made "All I Want for Christmas Is You" famous in 1994?', 'Mariah Carey', array['Celine Dion', 'Whitney Houston', 'Madonna'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-26', 'arts', 'Who wrote the song "White Christmas"?', 'Irving Berlin', array['Bing Crosby', 'Cole Porter', 'George Gershwin'], 'Bing Crosby''s recording became the best-selling single of its time.', 'Written by Claude for this project; check before relying on it'),
  ('arts-27', 'arts', 'In which language was the carol "Silent Night" first written?', 'German', array['Latin', 'English', 'French'], 'It was written in Austria in 1818 as "Stille Nacht".', 'Written by Claude for this project; check before relying on it'),
  ('arts-28', 'arts', 'Which singing cowboy recorded "Rudolph the Red-Nosed Reindeer" in 1949?', 'Gene Autry', array['Roy Rogers', 'Bing Crosby', 'Johnny Cash'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-29', 'arts', 'In which language was the carol "O Holy Night" first written?', 'French', array['German', 'Italian', 'Latin'], 'It began as a French poem in 1847.', 'Written by Claude for this project; check before relying on it'),
  ('arts-30', 'arts', 'Which charity supergroup recorded "Do They Know It''s Christmas?" in 1984?', 'Band Aid', array['Live Aid', 'USA for Africa', 'The Traveling Wilburys'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-31', 'arts', 'Which British duo recorded the song "Last Christmas"?', 'Wham!', array['Pet Shop Boys', 'Eurythmics', 'Soft Cell'], 'George Michael and Andrew Ridgeley.', 'Written by Claude for this project; check before relying on it'),
  ('arts-32', 'arts', 'Which singer had a hit in 1958 with "Rockin'' Around the Christmas Tree"?', 'Brenda Lee', array['Connie Francis', 'Patsy Cline', 'Dusty Springfield'], 'She was only 13 when she recorded it.', 'Written by Claude for this project; check before relying on it'),
  ('arts-33', 'arts', 'Which singer is most linked with the recording of "The Christmas Song" ("Chestnuts Roasting on an Open Fire")?', 'Nat King Cole', array['Frank Sinatra', 'Dean Martin', 'Perry Como'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-34', 'arts', 'Which jazz pianist composed the music for the TV special A Charlie Brown Christmas?', 'Vince Guaraldi', array['Dave Brubeck', 'Duke Ellington', 'Thelonious Monk'], null, 'Written by Claude for this project; check before relying on it'),
  ('arts-35', 'arts', '"Carol of the Bells" is based on a folk chant from which country?', 'Ukraine', array['Poland', 'Austria', 'Russia'], 'The chant is called "Shchedryk".', 'Written by Claude for this project; check before relying on it'),
  ('arts-36', 'arts', 'In the song "The Twelve Days of Christmas", how many gifts are given in total across all twelve days?', '364', array['78', '144', '12'], '1 + 2 + 3 and so on, added up for each day, makes 364.', 'Written by Claude for this project; check before relying on it'),
  ('food-28', 'food', 'Which Italian sweet bread, with dried fruit, is a Christmas tradition from Milan?', 'Panettone', array['Focaccia', 'Ciabatta', 'Biscotti'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-29', 'food', 'Which steamed, corn-husk-wrapped dish is a traditional Christmas food in Mexico?', 'Tamales', array['Empanadas', 'Tortillas', 'Churros'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-30', 'food', 'Which drink made from milk, cream, sugar and eggs, often with nutmeg, is popular at Christmas in North America?', 'Eggnog', array['Hot chocolate', 'Mulled cider', 'Rice pudding'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-31', 'food', 'Which German Christmas bread, filled with dried fruit and dusted with sugar, is linked to Dresden?', 'Stollen', array['Pretzel', 'Pumpernickel', 'Strudel'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-32', 'food', 'Which fried potato pancakes are traditionally eaten during Hanukkah?', 'Latkes', array['Blintzes', 'Knishes', 'Pierogi'], 'Fried foods recall the miracle of the oil.', 'Written by Claude for this project; check before relying on it'),
  ('food-33', 'food', 'Which flat, unleavened bread is eaten during the Jewish holiday of Passover?', 'Matzo', array['Challah', 'Pita', 'Naan'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-34', 'food', 'In Chinese tradition, what do long noodles eaten at celebrations like birthdays and the New Year stand for?', 'A long life', array['Wealth', 'Many children', 'Good travel'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-35', 'food', 'In Spain, what do many people eat at midnight on New Year''s Eve for good luck, one with each chime of the clock?', 'Twelve grapes', array['Twelve olives', 'Twelve almonds', 'Twelve cherries'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-36', 'food', 'Which food is traditionally eaten on New Year''s Day in the American South to bring good luck?', 'Black-eyed peas', array['Corn bread', 'Fried okra', 'Pecan pie'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-37', 'food', 'Which sweet bread is baked in Mexico for the Day of the Dead?', 'Pan de muerto', array['Rosca de reyes', 'Conchas', 'Bolillos'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-38', 'food', 'What is the name of the meal that breaks the daily fast during Ramadan?', 'Iftar', array['Suhoor', 'Eid', 'Halal'], 'Suhoor is the meal before dawn.', 'Written by Claude for this project; check before relying on it'),
  ('food-39', 'food', 'In New Orleans, a small plastic baby is hidden in which cake during Mardi Gras season?', 'King cake', array['Pound cake', 'Pecan praline cake', 'Beignet cake'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-40', 'food', 'In Britain, a Christmas pudding is traditionally set alight with what?', 'Brandy', array['Vinegar', 'Whipped cream', 'Rum butter'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-41', 'food', 'Which Chinese filled dumplings, shaped like gold ingots, are eaten at the Lunar New Year?', 'Jiaozi', array['Baozi', 'Wontons', 'Shumai'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-42', 'food', 'Which festival of lights, celebrated with oil lamps and sweets, is observed by Hindus, Jains and Sikhs in autumn?', 'Diwali', array['Holi', 'Navratri', 'Vesak'], null, 'Written by Claude for this project; check before relying on it'),
  ('food-43', 'food', 'In which country is it a popular tradition to eat fried chicken from KFC at Christmas?', 'Japan', array['Brazil', 'Australia', 'Italy'], 'A famous 1970s advertising campaign started it.', 'Written by Claude for this project; check before relying on it'),
  ('food-44', 'food', 'In the Italian-American Christmas Eve tradition, how many kinds of fish are served at the feast?', 'Seven', array['Three', 'Five', 'Twelve'], 'The Feast of the Seven Fishes.', 'Written by Claude for this project; check before relying on it'),
  ('sci-29', 'sci', 'Velcro was inspired by the way which kind of plant seed clings to clothing and fur?', 'Burrs', array['Dandelion seeds', 'Acorns', 'Pine cones'], 'Swiss engineer George de Mestral noticed burrs stuck to his dog''s fur in the 1940s.', 'Written by Claude for this project; check before relying on it'),
  ('sci-30', 'sci', 'The nose of Japan''s Shinkansen bullet train was reshaped to cut noise, inspired by the beak of which bird?', 'The kingfisher', array['The eagle', 'The pelican', 'The woodpecker'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-31', 'sci', 'Self-cleaning paints and surfaces copy the water-shedding leaves of which plant?', 'The lotus', array['The fern', 'The cactus', 'The water lily pad'], 'It is known as the lotus effect.', 'Written by Claude for this project; check before relying on it'),
  ('sci-32', 'sci', 'Dry adhesives that stick without glue were inspired by the feet of which animal?', 'The gecko', array['The frog', 'The spider', 'The beetle'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-33', 'sci', 'Which animal''s skin inspired fast swimsuits and surfaces that reduce drag?', 'The shark', array['The dolphin', 'The eel', 'The seal'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-34', 'sci', 'Which insects'' mounds inspired the natural cooling system of the Eastgate Centre building in Harare, Zimbabwe?', 'Termites', array['Ants', 'Bees', 'Wasps'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-35', 'sci', 'The bumpy flipper edges of which animal inspired more efficient wind turbine blades?', 'The humpback whale', array['The blue whale', 'The orca', 'The manatee'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-36', 'sci', 'Which creature''s silk has inspired research into fibers that are strong for their weight, compared with steel?', 'The spider', array['The beetle', 'The ant', 'The firefly'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-37', 'sci', 'Which German pioneer built and flew gliders in the 1890s after studying how birds fly?', 'Otto Lilienthal', array['Samuel Langley', 'Louis Blériot', 'Count Zeppelin'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-38', 'sci', 'The hexagonal cells of which insect''s nest inspired lightweight honeycomb panels used in aircraft?', 'The honeybee', array['The wasp', 'The ant', 'The termite'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-39', 'sci', 'Which bird''s feathers have inspired quieter fans and aircraft designs because it flies almost silently?', 'The owl', array['The hawk', 'The swan', 'The crow'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-40', 'sci', 'Road reflectors called "cat''s eyes" were invented in 1934 by Percy Shaw, supposedly after seeing what?', 'A cat''s eyes shining in his headlights', array['A glowworm on the road', 'Moonlight on a puddle', 'A fox in a field'], null, 'Written by Claude for this project; check before relying on it'),
  ('sci-41', 'sci', 'What is the word for designing technology and products by copying ideas from nature?', 'Biomimicry', array['Biochemistry', 'Bioengineering', 'Biodiversity'], 'It is also called biomimetics.', 'Written by Claude for this project; check before relying on it')
on conflict do nothing;

-- 32. Connections (Andry, 5 Nov): API keys for Daily, Resend, Twilio and R2, kept encrypted in Supabase Vault and set
-- from Admin > Settings. The browser can only write a value or see its last 4 characters (plain settings like the
-- sender address are shown in full). Edge Functions read the values through service_keys(), which only the service
-- role can call; a name with nothing stored here falls back to the function secret of the same name.
create or replace function service_key_list()
returns table (name text, secret boolean)
language sql
immutable
as $$
  values
    ('DAILY_API_KEY', true), ('DAILY_MONTHLY_MINUTES', false),
    ('RESEND_API_KEY', true), ('RESEND_FROM', false), ('REPLY_TO', false),
    ('TWILIO_ACCOUNT_SID', false), ('TWILIO_AUTH_TOKEN', true), ('TWILIO_MESSAGING_SERVICE_SID', false),
    ('TWILIO_FROM', false),
    ('R2_ACCOUNT_ID', false), ('R2_ACCESS_KEY_ID', true), ('R2_SECRET_ACCESS_KEY', true), ('R2_BUCKET', false)
$$;

create or replace function admin_service_keys()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can see connections.');
  end if;
  return jsonb_build_object('success', true, 'keys', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', l.name,
      'secret', l.secret,
      'set', d.id is not null,
      'shown', case when d.id is null then null
                    when not l.secret then d.decrypted_secret
                    when length(d.decrypted_secret) >= 12 then right(d.decrypted_secret, 4)
               end,
      'updated_at', d.updated_at) order by l.ord)
    from service_key_list() with ordinality as l(name, secret, ord)
    left join vault.decrypted_secrets d on d.name = 'mdc:' || l.name), '[]'::jsonb));
end;
$$;

-- An empty value removes the stored one (the function secret applies again). The log keeps the name, never the value.
create or replace function admin_set_service_key(p_name text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret boolean;
  v_id uuid;
  v text := btrim(coalesce(p_value, ''));
begin
  if not is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an admin can change connections.');
  end if;
  select l.secret into v_secret from service_key_list() l where l.name = p_name;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Unknown connection setting.');
  end if;
  if length(v) > 500 or v ~ '[[:cntrl:]]' or (v_secret and v ~ '\s') then
    return jsonb_build_object('success', false, 'error', 'That value doesn’t look right. Paste it again without spaces.');
  end if;
  if p_name = 'DAILY_MONTHLY_MINUTES' and v <> '' and v !~ '^[0-9]{1,7}$' then
    return jsonb_build_object('success', false, 'error', 'Enter whole minutes, like 8000.');
  end if;

  perform pg_advisory_xact_lock(hashtext('mdc:' || p_name));
  select s.id into v_id from vault.secrets s where s.name = 'mdc:' || p_name;
  if v = '' then
    delete from vault.secrets where id = v_id;
  elsif v_id is null then
    perform vault.create_secret(v, 'mdc:' || p_name, 'MeetDoConnect, set in Admin > Settings');
  else
    perform vault.update_secret(v_id, v);
  end if;

  insert into admin_log (admin_id, action, details)
  values (auth.uid(), case when v = '' then 'connection_cleared' else 'connection_set' end,
          jsonb_build_object('name', p_name));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function service_keys()
returns table (name text, value text)
language sql
stable
security definer
set search_path = public
as $$
  select l.name, d.decrypted_secret
  from service_key_list() l
  join vault.decrypted_secrets d on d.name = 'mdc:' || l.name;
$$;

revoke execute on function service_keys() from public, anon, authenticated;
grant execute on function service_keys() to service_role;
revoke execute on function admin_service_keys() from public, anon;
revoke execute on function admin_set_service_key(text, text) from public, anon;
grant execute on function admin_service_keys() to authenticated;
grant execute on function admin_set_service_key(text, text) to authenticated;

-- ========================================================================
-- 33. App errors (Andry, 6 Nov): what went wrong in a member's browser (Daily video, camera and microphone, room
-- entry, Hello Video upload), so "my video didn't work" can be traced in Admin > Activity log > App errors. The
-- browser writes only through log_client_error(); admins read the table. Rows are kept 30 days, and one person can
-- send at most 30 in 10 minutes so a broken page can't flood it.
create table if not exists client_errors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  kind text not null check (length(kind) between 1 and 40),
  message text not null check (length(message) between 1 and 500),
  page text check (length(page) <= 200),
  user_agent text check (length(user_agent) <= 300),
  details jsonb not null default '{}' check (length(details::text) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_client_errors_created on client_errors (created_at desc);
create index if not exists idx_client_errors_profile on client_errors (profile_id, created_at desc);
create index if not exists idx_client_errors_session on client_errors (session_id);

alter table client_errors enable row level security;
drop policy if exists "Admins can view app errors" on client_errors;
create policy "Admins can view app errors" on client_errors for select using (is_admin());
revoke insert, update, delete on client_errors from anon, authenticated;

create or replace function log_client_error(
  p_kind text,
  p_message text,
  p_session uuid default null,
  p_page text default null,
  p_user_agent text default null,
  p_details jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('success', false, 'error', 'Please sign in.');
  end if;
  if (select count(*) from client_errors
      where profile_id = v_me and created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many error reports. Try again later.');
  end if;
  -- ponytail: rows past 30 days are trimmed on write instead of by a cron job; fine at this volume.
  -- Upgrade path: a daily pg_cron delete if errors ever arrive by the thousands.
  delete from client_errors where created_at < now() - interval '30 days';
  insert into client_errors (profile_id, session_id, kind, message, page, user_agent, details)
  values (
    v_me,
    (select id from sessions where id = p_session),
    left(coalesce(nullif(trim(p_kind), ''), 'error'), 40),
    left(coalesce(nullif(trim(p_message), ''), '(no message)'), 500),
    left(p_page, 200),
    left(p_user_agent, 300),
    case when jsonb_typeof(p_details) = 'object' and length(p_details::text) <= 2000 then p_details else '{}' end
  );
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function log_client_error(text, text, uuid, text, text, jsonb) from public, anon;
grant execute on function log_client_error(text, text, uuid, text, text, jsonb) to authenticated;

-- ========================================================================
-- 34. Room log (Andry, 6 Nov): every try to enter a live room, so admins can see who came and when, who came back
-- after a drop, and who was turned away (and why) in Admin > Activity log > Room entries. room_join() wraps the
-- decision (room_join_decide(), section 25) and writes one row per try. "entered" means the database let the person
-- in; a video failure after that (Daily down, minutes used up) shows in App errors (section 33). Leaving isn't
-- logged: the call ends in the browser and nothing reaches the server.
create table if not exists room_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  event text not null check (event in ('entered', 'returned', 'refused')),
  as_admin boolean not null default false,
  detail text check (length(detail) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists idx_room_log_created on room_log (created_at desc);
create index if not exists idx_room_log_session on room_log (session_id);
create index if not exists idx_room_log_profile on room_log (profile_id);

alter table room_log enable row level security;
drop policy if exists "Admins can view the room log" on room_log;
create policy "Admins can view the room log" on room_log for select using (is_admin());
revoke insert, update, delete on room_log from anon, authenticated;

-- Entries from before the log existed, from bookings.joined_at (first entry only). Runs only while the log is empty.
insert into room_log (session_id, profile_id, event, created_at)
select session_id, user_id, 'entered', joined_at from bookings
where joined_at is not null and not exists (select 1 from room_log);

create or replace function room_join(p_user uuid, p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_in boolean;
  v jsonb;
begin
  select bool_or(joined_at is not null) into v_was_in from bookings
  where session_id = p_session and user_id = p_user and status in ('confirmed', 'attended');
  v := room_join_decide(p_user, p_session);
  if exists (select 1 from sessions where id = p_session) then
    insert into room_log (session_id, profile_id, event, as_admin, detail)
    values (
      p_session,
      (select id from profiles where id = p_user),
      case when not coalesce((v->>'success')::boolean, false) then 'refused'
           when coalesce(v_was_in, false) then 'returned'
           else 'entered' end,
      coalesce((v->>'is_admin')::boolean, false),
      left(v->>'error', 200)
    );
  end if;
  return v;
end;
$$;

revoke execute on function room_join(uuid, uuid) from public, anon, authenticated;
