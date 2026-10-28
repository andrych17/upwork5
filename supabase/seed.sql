-- ========================================================================
-- MeetDoConnect Supabase Database Seeder & Dummy Data (Milestone 2)
-- Run this in Supabase SQL Editor after running schema.sql.
-- ========================================================================

-- 1. Seed Official Live Sessions
insert into public.sessions (id, slug, title, blurb, host, prep, starts_at, minutes, capacity, published)
values
  (
    's0000000-0000-0000-0000-000000000001',
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
    's0000000-0000-0000-0000-000000000002',
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
    's0000000-0000-0000-0000-000000000003',
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
    's0000000-0000-0000-0000-000000000004',
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
    's0000000-0000-0000-0000-000000000005',
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
    's0000000-0000-0000-0000-000000000006',
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
    's0000000-0000-0000-0000-000000000007',
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
    's0000000-0000-0000-0000-000000000008',
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
    's0000000-0000-0000-0000-000000000009',
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
    's0000000-0000-0000-0000-000000000010',
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
    's0000000-0000-0000-0000-000000000011',
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
    's0000000-0000-0000-0000-000000000012',
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
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  -- Admin User
  (
    'u0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@meetdoconnect.com',
    crypt('AdminPass123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Kelly","last_name":"Christian"}',
    now(),
    now()
  ),
  -- Member: Maya Lin
  (
    'u0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'maya.lin@example.com',
    crypt('MemberPass123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Maya","last_name":"Lin"}',
    now() - interval '45 days',
    now()
  ),
  -- Member: Jonah Vance
  (
    'u0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'jonah.vance@example.com',
    crypt('MemberPass123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Jonah","last_name":"Vance"}',
    now() - interval '80 days',
    now()
  ),
  -- Member: Nina Patel
  (
    'u0000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'nina.patel@example.com',
    crypt('MemberPass123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Nina","last_name":"Patel"}',
    now() - interval '90 days',
    now()
  ),
  -- Member: Robert Hayes (Past due renewal with 3-day grace)
  (
    'u0000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'robert.hayes@example.com',
    crypt('MemberPass123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Robert","last_name":"Hayes"}',
    now() - interval '120 days',
    now()
  )
on conflict (id) do nothing;

-- 3. Upsert Profile Details for Dummy Users
insert into public.profiles (
  id,
  email,
  first_name,
  last_name,
  tier,
  billing_interval,
  billing_date,
  monthly_credits,
  addon_credits,
  bhd_cards_remaining,
  payment_status,
  is_admin,
  created_at
)
values
  (
    'u0000000-0000-0000-0000-000000000001',
    'admin@meetdoconnect.com',
    'Kelly',
    'Christian',
    'individual',
    'annual',
    1,
    13,
    10,
    3,
    'active',
    true,
    now()
  ),
  (
    'u0000000-0000-0000-0000-000000000002',
    'maya.lin@example.com',
    'Maya',
    'Lin',
    'individual',
    'monthly',
    12,
    9,
    2,
    2,
    'active',
    false,
    now() - interval '45 days'
  ),
  (
    'u0000000-0000-0000-0000-000000000003',
    'jonah.vance@example.com',
    'Jonah',
    'Vance',
    'individual',
    'annual',
    4,
    12,
    0,
    3,
    'active',
    false,
    now() - interval '80 days'
  ),
  (
    'u0000000-0000-0000-0000-000000000004',
    'nina.patel@example.com',
    'Nina',
    'Patel',
    'household',
    'monthly',
    28,
    4,
    5,
    3,
    'active',
    false,
    now() - interval '90 days'
  ),
  (
    'u0000000-0000-0000-0000-000000000005',
    'robert.hayes@example.com',
    'Robert',
    'Hayes',
    'individual',
    'monthly',
    25,
    0,
    0,
    1,
    'past_due',
    false,
    now() - interval '120 days'
  )
on conflict (id) do update set
  is_admin = excluded.is_admin,
  tier = excluded.tier,
  monthly_credits = excluded.monthly_credits,
  addon_credits = excluded.addon_credits,
  billing_date = excluded.billing_date,
  payment_status = excluded.payment_status;

-- Set Robert's payment failed timestamp to 1 day ago (within 3-day grace)
update public.profiles
set payment_failed_at = now() - interval '1 day'
where email = 'robert.hayes@example.com';

-- 4. Seed Sample Bookings
insert into public.bookings (id, session_id, user_id, credit_type, camera_off, status, created_at)
values
  -- Maya booked Quiet Co-Work
  (
    'b0000000-0000-0000-0000-000000000001',
    's0000000-0000-0000-0000-000000000001',
    'u0000000-0000-0000-0000-000000000002',
    'monthly',
    false,
    'confirmed',
    now() - interval '2 days'
  ),
  -- Jonah booked Quiet Co-Work
  (
    'b0000000-0000-0000-0000-000000000002',
    's0000000-0000-0000-0000-000000000001',
    'u0000000-0000-0000-0000-000000000003',
    'monthly',
    false,
    'confirmed',
    now() - interval '1 day'
  ),
  -- Nina booked Botanical Sketch Night
  (
    'b0000000-0000-0000-0000-000000000003',
    's0000000-0000-0000-0000-000000000003',
    'u0000000-0000-0000-0000-000000000004',
    'monthly',
    true,
    'confirmed',
    now() - interval '12 hours'
  ),
  -- Maya booked Write Together
  (
    'b0000000-0000-0000-0000-000000000004',
    's0000000-0000-0000-0000-000000000002',
    'u0000000-0000-0000-0000-000000000002',
    'monthly',
    false,
    'confirmed',
    now() - interval '6 hours'
  )
on conflict (id) do nothing;
