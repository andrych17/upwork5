-- ========================================================================
-- MeetDoConnect Supabase Seeder & Dummy Data (Milestone 2)
-- DEV PROJECT ONLY. Run in the Supabase SQL Editor after schema.sql.
-- ========================================================================

-- 1. Seed Official Live Sessions
insert into public.sessions (id, slug, title, blurb, host, prep, starts_at, minutes, capacity, published)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'quiet-co-work',
    'Quiet Co-Work',
    'Solos, couples, adults & teens working alongside each other.',
    'Kelly C.',
    'Choose the one task you will work on, bring a beverage—hot or fizzy—and put your phone out of reach.',
    now() + interval '1 day 18 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'write-together',
    'Write Together',
    'Solos, couples, adults & teens sharing creative writing time.',
    'Kelly C.',
    'Bring a notebook or blank document, a beverage of your choice, and a pick from the prompt list—or your own project.',
    now() + interval '2 days 19 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'botanical-sketch-night',
    'Botanical Sketch Night',
    'Mindful observation and sketching of botanicals with friends.',
    'Elena R.',
    'Bring paper, pencil, black pen, and one leaf or herb sprig per person. Don’t forget a delicious bevvy to sip.',
    now() + interval '3 days 20 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'skin-ritual',
    'Skin Ritual',
    'Slow down with a natural mask and tea mist routine.',
    'Kelly C.',
    'Bring 2 tbsp finely ground oats, 1 tbsp plain yogurt or mashed ripe banana, 1 tsp honey, and cooled green tea in a spray bottle.',
    now() + interval '4 days 19 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'wind-down',
    'Wind-Down',
    'Gentle stretches, slow breathing, and journaling for everyone.',
    'Kelly C.',
    'Bring a blanket, herbal tea, journal, and pen. Quiet, wordless music is optional.',
    now() + interval '5 days 19 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000006',
    'idea-lab',
    'Idea Lab',
    'Pitch a project or story and receive thoughtful "yes, and" feedback.',
    'Marcus T.',
    'Bring one sentence describing your half-formed idea, sticky notes or a blank page, and an elevator pitch.',
    now() + interval '6 days 20 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000007',
    'mocktail-studio',
    'Mocktail Studio',
    'Build two alcohol-free drinks while learning flavors and balance.',
    'Kelly C.',
    'Per drink: 120 ml unsweetened cranberry juice, 1 tsp honey or maple syrup, 2 slices ginger, sparkling water, ice.',
    now() + interval '7 days 19 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000008',
    'cards-and-collage-night',
    'Cards & Collage Night',
    'Hands-on craft and collage building on cardstock.',
    'Elena R.',
    'Bring scrap paper, old magazines or catalogs, a glue stick, scissors, and 3 pieces of cardstock.',
    now() + interval '8 days 18 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000009',
    'byo-dad-jokes',
    'BYO Dad Jokes',
    'Families, solos, couples: share groan-worthy one-liners and stories.',
    'Kelly C.',
    'Bring ’em on. Who has the groan-iest one-liner, story, or pun? Come ready to make eyes roll.',
    now() + interval '9 days 21 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000010',
    'dont-spill-the-tea',
    '(Don''t) Spill the Tea',
    'Slow down over a blind tasting of three teas and calm conversation.',
    'Kelly C.',
    'Bring three different teas or herbal blends labeled A, B, and C, a kettle, two mugs, and a tasting card.',
    now() + interval '10 days 17 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000011',
    'share-a-song',
    'Share a Song',
    'Get to know people through the music they love. Share or listen.',
    'Marcus T.',
    'Bring another device to play a favorite song or instrument. Musicians are welcome to sing.',
    now() + interval '11 days 19 hours',
    60,
    12,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000012',
    'trivia-trivier-triviest',
    'Trivia, Trivier, Triviest',
    'Proprietary trivia game to reveal who is Quizzy, Quizzier, and Quizziest.',
    'Kelly C.',
    'No prep. Just show up and guess.',
    now() + interval '12 days 20 hours',
    60,
    12,
    true
  )
on conflict (slug) do update set
  title = excluded.title,
  blurb = excluded.blurb,
  host = excluded.host,
  prep = excluded.prep,
  starts_at = excluded.starts_at;

-- 2. Seed Dummy Users into auth.users (Pass: AdminPass123! or MemberPass123!)
-- DEV PROJECT ONLY. Never run this file on the production project: the passwords are public.
-- The empty-string token columns and the auth.identities rows are what Supabase Auth needs
-- for email + password sign-in on users created with SQL.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  email_change,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  u.id::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  u.email,
  crypt(u.pass, gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
  now() - u.age,
  now()
from (values
  ('d0000000-0000-0000-0000-000000000001', 'admin@meetdoconnect.com', 'AdminPass123!', 'Kelly', 'Christian', interval '0 days'),
  ('d0000000-0000-0000-0000-000000000002', 'maya.lin@example.com', 'MemberPass123!', 'Maya', 'Lin', interval '45 days'),
  ('d0000000-0000-0000-0000-000000000003', 'jonah.vance@example.com', 'MemberPass123!', 'Jonah', 'Vance', interval '80 days'),
  -- Nina holds a Household; Sam is a second person on it (own sign-in, shared credits)
  ('d0000000-0000-0000-0000-000000000004', 'nina.patel@example.com', 'MemberPass123!', 'Nina', 'Patel', interval '90 days'),
  ('d0000000-0000-0000-0000-000000000006', 'sam.patel@example.com', 'MemberPass123!', 'Sam', 'Patel', interval '60 days'),
  -- Robert's renewal failed yesterday (inside the 3-day grace period)
  ('d0000000-0000-0000-0000-000000000005', 'robert.hayes@example.com', 'MemberPass123!', 'Robert', 'Hayes', interval '120 days')
) as u(id, email, pass, first_name, last_name, age)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  u.created_at,
  now()
from auth.users u
where u.id::text like 'd0000000-0000-0000-0000-%'
on conflict (provider_id, provider) do nothing;

-- 3. Profile Details for Dummy Users (the sign-up trigger created the rows; this sets the plans)
update public.profiles p
set tier = v.tier,
    billing_interval = v.billing_interval,
    billing_date = v.billing_date,
    monthly_credits = v.monthly_credits,
    addon_credits = v.addon_credits,
    payment_status = v.payment_status,
    is_admin = v.is_admin,
    household_owner_id = v.household_owner_id::uuid,
    credits_cycle_start = cycle_start(v.billing_date, (now() at time zone 'America/Chicago')::date),
    created_at = now() - v.age
from (values
  ('d0000000-0000-0000-0000-000000000001', 'individual', 'annual', 1, 13, 3, 'active', true, null, interval '0 days'),
  ('d0000000-0000-0000-0000-000000000002', 'individual', 'monthly', 12, 9, 2, 'active', false, null, interval '45 days'),
  ('d0000000-0000-0000-0000-000000000003', 'individual', 'annual', 4, 12, 0, 'active', false, null, interval '80 days'),
  ('d0000000-0000-0000-0000-000000000004', 'household', 'monthly', 28, 14, 5, 'active', false, null, interval '90 days'),
  ('d0000000-0000-0000-0000-000000000006', 'household', 'monthly', 28, 0, 0, 'active', false,
    'd0000000-0000-0000-0000-000000000004', interval '60 days'),
  ('d0000000-0000-0000-0000-000000000005', 'individual', 'monthly', 25, 0, 1, 'past_due', false, null, interval '120 days')
) as v(id, tier, billing_interval, billing_date, monthly_credits, addon_credits, payment_status, is_admin,
       household_owner_id, age)
where p.id = v.id::uuid;

update public.profiles
set payment_failed_at = now() - interval '1 day',
    credits_cycle_start = null
where id = 'd0000000-0000-0000-0000-000000000005';

-- Nina has one open invite for a third person
insert into public.household_invites (email, owner_id)
values ('leo.patel@example.com', 'd0000000-0000-0000-0000-000000000004')
on conflict (email) do nothing;

-- 4. Seed Sample Bookings (charged_to = whose credits paid)
insert into public.bookings (id, session_id, user_id, charged_to, credit_type, camera_off, status, created_at)
values
  -- Maya booked Quiet Co-Work
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002',
   'monthly', false, 'confirmed', now() - interval '2 days'),
  -- Jonah booked Quiet Co-Work
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003',
   'monthly', false, 'confirmed', now() - interval '1 day'),
  -- Nina booked Botanical Sketch Night with a Bad Hair Day card
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003',
   'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004',
   'monthly', true, 'confirmed', now() - interval '12 hours'),
  -- Sam joined the same session on Nina's Household credits
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003',
   'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004',
   'monthly', false, 'confirmed', now() - interval '10 hours'),
  -- Maya booked Write Together
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002',
   'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002',
   'monthly', false, 'confirmed', now() - interval '6 hours')
on conflict (id) do nothing;
