-- ========================================================================
-- MeetDoConnect Supabase Database Schema (Milestone 2 - Oct 28, 2026)
-- Reflects 13 monthly credits, 4 sessions/week cap, billing cycle resets,
-- 24-hour cancellation rules, and 3-day failed payment grace periods.
-- ========================================================================

create extension if not exists pgcrypto;

-- 1. Global Application Configuration
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  tz text not null default 'America/Chicago',
  monthly_credits int not null default 13,
  max_weekly_sessions int not null default 4,
  cancel_hours int not null default 24,
  grace_days int not null default 3,
  bhd_per_month int not null default 3,
  booking_closes_minutes int not null default 15,
  book_ahead_days int not null default 14
);

insert into app_config default values on conflict do nothing;

-- 2. Member Profiles (Tied directly to auth.users)
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
  bhd_cards_remaining int not null default 3 check (bhd_cards_remaining >= 0),
  payment_status text not null default 'active' check (payment_status in ('active', 'past_due', 'paused', 'canceled')),
  payment_failed_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  credit_type text not null default 'monthly' check (credit_type in ('monthly', 'addon')),
  camera_off boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'attended')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create unique index if not exists one_active_booking on bookings (session_id, user_id) 
where (status = 'confirmed');

create index if not exists idx_bookings_user_status on bookings (user_id, status);
create index if not exists idx_bookings_session_status on bookings (session_id, status);

-- 5. Trigger: Automatically create profile upon user signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_day int;
begin
  signup_day := extract(day from now())::int;
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    billing_date,
    monthly_credits,
    addon_credits,
    bhd_cards_remaining,
    payment_status
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', 'Member'),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    signup_day,
    13,
    0,
    3,
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

-- 6. RPC Function: Book a Session
-- Validates: active payment, rolling 7-day cap of 4 sessions, available credits, and session seat capacity.
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
  v_user_id uuid;
  v_profile profiles%rowtype;
  v_session sessions%rowtype;
  v_booked_seats int;
  v_weekly_count int;
  v_credit_type text;
  v_new_booking_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Must be signed in to book a session');
  end if;

  -- Lock profile row
  select * into v_profile from profiles where id = v_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Profile not found');
  end if;

  -- Check payment status
  if v_profile.payment_status in ('paused', 'canceled') then
    return jsonb_build_object('success', false, 'error', 'Membership is paused due to payment issue. Please update your payment method.');
  end if;

  -- Lock session row
  select * into v_session from sessions where id = p_session_id for update;
  if not found or not v_session.published then
    return jsonb_build_object('success', false, 'error', 'Session not available');
  end if;

  if v_session.starts_at <= now() + interval '15 minutes' then
    return jsonb_build_object('success', false, 'error', 'Booking has closed for this session');
  end if;

  -- Check seat capacity
  select count(*) into v_booked_seats
  from bookings
  where session_id = p_session_id and status = 'confirmed';

  if v_booked_seats >= v_session.capacity then
    return jsonb_build_object('success', false, 'error', 'This session is full');
  end if;

  -- Check 4 sessions limit in any 7-day rolling window around session start
  select count(*) into v_weekly_count
  from bookings b
  join sessions s on s.id = b.session_id
  where b.user_id = v_user_id
    and b.status = 'confirmed'
    and s.starts_at between (v_session.starts_at - interval '3 days 12 hours')
                        and (v_session.starts_at + interval '3 days 12 hours');

  if v_weekly_count >= 4 then
    return jsonb_build_object('success', false, 'error', 'You have reached the maximum of 4 sessions for this 7-day stretch.');
  end if;

  -- Determine credit to deduct (monthly first, then addon)
  if v_profile.monthly_credits > 0 then
    v_credit_type := 'monthly';
    update profiles
    set monthly_credits = monthly_credits - 1,
        updated_at = now()
    where id = v_user_id;
  elsif v_profile.addon_credits > 0 then
    v_credit_type := 'addon';
    update profiles
    set addon_credits = addon_credits - 1,
        updated_at = now()
    where id = v_user_id;
  else
    return jsonb_build_object('success', false, 'error', 'No session credits available this month.');
  end if;

  -- Deduct BHD card if camera is toggled off
  if p_camera_off then
    if v_profile.bhd_cards_remaining > 0 then
      update profiles set bhd_cards_remaining = bhd_cards_remaining - 1 where id = v_user_id;
    end if;
  end if;

  -- Insert confirmed booking
  insert into bookings (
    session_id,
    user_id,
    credit_type,
    camera_off,
    status
  ) values (
    p_session_id,
    v_user_id,
    v_credit_type,
    p_camera_off,
    'confirmed'
  ) returning id into v_new_booking_id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_new_booking_id,
    'credit_type', v_credit_type
  );
end;
$$;

-- 7. RPC Function: Cancel Booking (24-Hour Rule)
create or replace function cancel_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_booking bookings%rowtype;
  v_session sessions%rowtype;
  v_refunded boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Must be signed in');
  end if;

  select * into v_booking
  from bookings
  where id = p_booking_id and user_id = v_user_id for update;

  if not found or v_booking.status != 'confirmed' then
    return jsonb_build_object('success', false, 'error', 'Booking not found or already cancelled');
  end if;

  select * into v_session from sessions where id = v_booking.session_id;

  -- Check 24-hour deadline for credit return
  if v_session.starts_at >= (now() + interval '24 hours') then
    v_refunded := true;
    if v_booking.credit_type = 'monthly' then
      update profiles set monthly_credits = monthly_credits + 1 where id = v_user_id;
    else
      update profiles set addon_credits = addon_credits + 1 where id = v_user_id;
    end if;
    if v_booking.camera_off then
      update profiles set bhd_cards_remaining = bhd_cards_remaining + 1 where id = v_user_id;
    end if;
  end if;

  update bookings
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'refunded', v_refunded,
    'message', case when v_refunded then 'Booking cancelled and credit returned.' else 'Booking cancelled. Credit used because cancellation was within 24 hours.' end
  );
end;
$$;

-- 8. Grace Period Enforcement Function
-- Releases seats for accounts whose renewal failed > 3 days ago.
create or replace function enforce_failed_payment_grace()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released_count int := 0;
begin
  -- Update past_due profiles to paused after 3-day grace
  update profiles
  set payment_status = 'paused',
      updated_at = now()
  where payment_status = 'past_due'
    and payment_failed_at is not null
    and payment_failed_at <= (now() - interval '3 days');

  -- Release upcoming bookings for paused members
  with cancelled_bookings as (
    update bookings b
    set status = 'cancelled',
        cancelled_at = now()
    from profiles p, sessions s
    where b.user_id = p.id
      and b.session_id = s.id
      and p.payment_status = 'paused'
      and b.status = 'confirmed'
      and s.starts_at > now()
    returning b.id
  )
  select count(*) into v_released_count from cancelled_bookings;

  return v_released_count;
end;
$$;

-- 9. Row Level Security Policies
alter table app_config enable row level security;
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table bookings enable row level security;

-- Policies for app_config
create policy "Anyone can read app_config" on app_config for select using (true);

-- Policies for profiles
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id or (select is_admin from profiles where id = auth.uid()));

create policy "Users can update own display details" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Policies for sessions
create policy "Published sessions viewable by all" on sessions
  for select using (published = true);

-- Policies for bookings
create policy "Users can view own bookings" on bookings
  for select using (auth.uid() = user_id or (select is_admin from profiles where id = auth.uid()));

-- 10. Hardening Privileges (Revoke dangerous access from public & anon)
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function enforce_failed_payment_grace() from public, anon, authenticated;

revoke execute on function book_session(uuid, boolean) from anon;
grant execute on function book_session(uuid, boolean) to authenticated;

revoke execute on function cancel_booking(uuid) from anon;
grant execute on function cancel_booking(uuid) to authenticated;
