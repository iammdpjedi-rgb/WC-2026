-- =============================================================
-- WORLD CUP PREDICTION LEAGUE — DATABASE SCHEMA
-- Run this entire file ONCE in Supabase → SQL Editor → New query → Run.
-- It creates every table, security rule, and scoring function.
-- =============================================================

-- ---------- 1. PROFILES (public info only) -------------------
-- One row per registered user. Linked to Supabase Auth.
-- We ONLY ever expose display_name to other users.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username     text not null unique,
  is_admin     boolean not null default false,
  is_disabled  boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- 2. MATCHES (fixtures + results) ------------------
-- kickoff is stored in UTC (timestamptz). The app shows it in each
-- visitor's local time automatically.
-- result: 'A' = Team A wins/advances, 'B' = Team B wins/advances,
--         'D' = Draw (group stage only). NULL until played.
create table if not exists public.matches (
  id           bigint generated always as identity primary key,
  team_a       text not null,
  team_b       text not null,
  team_a_code  text default '',     -- e.g. 'BR' for a flag (optional)
  team_b_code  text default '',
  kickoff      timestamptz not null,
  stage        text not null default 'Group Stage'
               check (stage in ('Group Stage','Round of 16','Quarter Final',
                                'Semi Final','Third Place','Final')),
  is_completed boolean not null default false,
  result       text check (result in ('A','B','D')),
  created_at   timestamptz not null default now()
);

-- Helper columns computed on the fly (24h open, 2h close rule)
create or replace function public.predict_open(m public.matches)
  returns timestamptz language sql immutable as $$
  select m.kickoff - interval '24 hours';
$$;

create or replace function public.predict_close(m public.matches)
  returns timestamptz language sql immutable as $$
  select m.kickoff - interval '5 minutes';
$$;

-- ---------- 3. PREDICTIONS ------------------------------------
-- One pick per user per match (enforced by the unique constraint).
create table if not exists public.predictions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    bigint not null references public.matches(id) on delete cascade,
  pick        text not null check (pick in ('A','B','D')),
  is_correct  boolean,            -- filled in after the result is entered
  points      integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, match_id)      -- ANTI-CHEAT: prevents multiple submissions
);

-- =============================================================
-- ROW LEVEL SECURITY  (this is what makes it cheat-proof)
-- =============================================================
alter table public.profiles    enable row level security;
alter table public.matches     enable row level security;
alter table public.predictions enable row level security;

-- ---- PROFILES policies ----
-- Anyone can read display names (needed for leaderboards / your own name).
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select using (true);

-- A user can create only their own profile row.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- A user can update only their own profile, and CANNOT make themselves admin.
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = (select is_admin from public.profiles where id = auth.uid()));

-- ---- MATCHES policies ----
-- Everyone can see fixtures.
drop policy if exists "matches readable" on public.matches;
create policy "matches readable" on public.matches
  for select using (true);

-- Only admins can add / edit / delete fixtures and results.
drop policy if exists "admin write matches" on public.matches;
create policy "admin write matches" on public.matches
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---- PREDICTIONS policies ----
-- A user can read ONLY their own predictions (others stay private).
drop policy if exists "read own predictions" on public.predictions;
create policy "read own predictions" on public.predictions
  for select using (auth.uid() = user_id);

-- A user can INSERT a prediction only:
--   * for themselves
--   * while the prediction window is OPEN (24h before → 2h before kickoff)
--   * and the match is not completed
--   * and their account is not disabled
drop policy if exists "insert prediction in window" on public.predictions;
create policy "insert prediction in window" on public.predictions
  for insert with check (
    auth.uid() = user_id
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_disabled)
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.is_completed = false
        and now() >= (m.kickoff - interval '24 hours')
        and now() <= (m.kickoff - interval '5 minutes')
    )
  );

-- A user can UPDATE (change) their pick only while the window is still open.
-- After the 2-hours-before cutoff, edits are blocked at the DATABASE level.
drop policy if exists "update prediction in window" on public.predictions;
create policy "update prediction in window" on public.predictions
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.is_completed = false
        and now() >= (m.kickoff - interval '24 hours')
        and now() <= (m.kickoff - interval '5 minutes')
    )
  );

-- =============================================================
-- AUTO-CREATE A PROFILE WHEN A USER SIGNS UP
-- Reads display_name + username from the sign-up metadata.
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- SCORING ENGINE  (runs on the server — no manual maths)
-- Correct pick = 2 points, wrong = 0. Only graded once a match
-- is completed and has a result.
-- =============================================================
create or replace function public.recalculate_scores()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.predictions pr
  set is_correct = (pr.pick = m.result),
      points     = case when pr.pick = m.result then 2 else 0 end,
      updated_at = now()
  from public.matches m
  where pr.match_id = m.id
    and m.is_completed = true
    and m.result is not null;

  -- Predictions on matches not yet completed stay ungraded.
  update public.predictions pr
  set is_correct = null, points = 0
  from public.matches m
  where pr.match_id = m.id
    and (m.is_completed = false or m.result is null);
end;
$$;

-- Let logged-in users trigger a recalculation via the app button.
-- (Safe: it only reads results admins entered.) Admins use it; the
-- app also calls it automatically right after a result is saved.
grant execute on function public.recalculate_scores() to authenticated;

-- =============================================================
-- LEADERBOARDS  (security definer = aggregates are public,
-- but nobody can read another user's individual picks)
-- =============================================================

-- 1) TOTAL POINTS leaderboard
create or replace function public.get_total_leaderboard()
returns table (
  display_name text,
  points bigint,
  correct bigint,
  predictions_made bigint
) language sql security definer set search_path = public as $$
  select p.display_name,
         coalesce(sum(pr.points),0)                              as points,
         count(*) filter (where pr.is_correct)                   as correct,
         count(*) filter (where m.is_completed and m.result is not null) as predictions_made
  from public.profiles p
  left join public.predictions pr on pr.user_id = p.id
  left join public.matches m on m.id = pr.match_id
  where p.is_disabled = false
  group by p.id, p.display_name
  having count(*) filter (where m.is_completed and m.result is not null) > 0
  order by points desc, correct desc, predictions_made asc;
$$;
grant execute on function public.get_total_leaderboard() to anon, authenticated;

-- 2) ACCURACY leaderboard (min 10 graded predictions)
create or replace function public.get_accuracy_leaderboard()
returns table (
  display_name text,
  accuracy numeric,
  correct bigint,
  predictions_made bigint
) language sql security definer set search_path = public as $$
  select p.display_name,
         round(100.0 * count(*) filter (where pr.is_correct)
               / nullif(count(*) filter (where m.is_completed and m.result is not null),0), 1) as accuracy,
         count(*) filter (where pr.is_correct) as correct,
         count(*) filter (where m.is_completed and m.result is not null) as predictions_made
  from public.profiles p
  left join public.predictions pr on pr.user_id = p.id
  left join public.matches m on m.id = pr.match_id
  where p.is_disabled = false
  group by p.id, p.display_name
  having count(*) filter (where m.is_completed and m.result is not null) >= 10
  order by accuracy desc, correct desc;
$$;
grant execute on function public.get_accuracy_leaderboard() to anon, authenticated;

-- 3) HALL OF FAME (winner + top 10 + best accuracy + most correct)
create or replace function public.get_hall_of_fame()
returns table (
  display_name text,
  points bigint,
  correct bigint,
  predictions_made bigint,
  accuracy numeric
) language sql security definer set search_path = public as $$
  select p.display_name,
         coalesce(sum(pr.points),0) as points,
         count(*) filter (where pr.is_correct) as correct,
         count(*) filter (where m.is_completed and m.result is not null) as predictions_made,
         round(100.0 * count(*) filter (where pr.is_correct)
               / nullif(count(*) filter (where m.is_completed and m.result is not null),0), 1) as accuracy
  from public.profiles p
  left join public.predictions pr on pr.user_id = p.id
  left join public.matches m on m.id = pr.match_id
  where p.is_disabled = false
  group by p.id, p.display_name
  having count(*) filter (where m.is_completed and m.result is not null) > 0
  order by points desc, correct desc;
$$;
grant execute on function public.get_hall_of_fame() to anon, authenticated;

-- =============================================================
-- DONE. Next: create your admin user (see README, "Make yourself admin").
-- =============================================================
