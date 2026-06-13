# ⚽ World Cup Prediction League

A free, mobile-friendly prediction game. Friends register, predict match
outcomes, and climb two leaderboards (Total Points + Accuracy). Everything
runs on **free** tiers. Footer always shows **"Created and Managed by Dp Poojian"**.

This guide assumes **no coding experience**. Follow it top to bottom.

---

## What you'll set up (all free)

1. **Supabase** — your database + login system (free tier).
2. **Vercel** — hosts the website for free, gives you a live link.
3. **GitHub** — stores the code so Vercel can deploy it (free).

You do **not** need to install anything on your computer if you use the
website method below. Total time: ~30–40 minutes.

---

## STEP 1 — Create the database (Supabase)

1. Go to **supabase.com** → sign up (free) → **New project**.
2. Pick a name and a strong database password. Choose the region closest to you.
3. Wait ~2 minutes for it to finish setting up.
4. In the left menu click **SQL Editor → New query**.
5. Open the file `database/schema.sql` from this project, copy **everything**,
   paste it into the editor, and click **Run**. You should see "Success".
   This creates all tables, security rules, and the scoring engine.

### Get your two keys
6. Left menu → **Project Settings → API**. Copy these two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)
   Keep them handy for Step 3.

---

## STEP 2 — Put the code on GitHub

1. Go to **github.com** → sign up → **New repository** → name it
   `world-cup-prediction-league` → **Create repository**.
2. On the new repo page click **uploading an existing file**.
3. Drag in **all the files and folders from this project** (everything except
   the `node_modules` folder if it exists). Click **Commit changes**.

> Tip: the easiest way is to upload the whole project folder contents.
> Don't upload `node_modules` or `.next` — they're rebuilt automatically.

---

## STEP 3 — Publish the website (Vercel)

1. Go to **vercel.com** → sign up **with your GitHub account**.
2. Click **Add New → Project** → import your `world-cup-prediction-league` repo.
3. Before clicking Deploy, open **Environment Variables** and add these two
   (use the values you copied in Step 1):

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |

4. Click **Deploy**. After ~1 minute you get a live link like
   `https://world-cup-prediction-league.vercel.app`. That's your website! 🎉

---

## STEP 4 — Make yourself the admin

1. Open your live website → **Register** → create your own account
   (display name, username, email, password).
2. Go back to Supabase → **Table Editor → profiles**.
3. Find your row, set the **is_admin** column to **true**, save.
4. Refresh the website. You'll now see an **Admin** link in the menu.

Only admins can add fixtures and enter results — this is enforced inside the
database, so it can't be bypassed.

---

## STEP 5 — Add the World Cup fixtures

In the **Admin → Fixtures** tab you can add matches one by one, or use
**Admin → Bulk Import** to paste the whole schedule at once. Format
(one match per line):

```
Team A | Team B | 2026-06-15 20:00 | Group Stage | AA | BB
```

- The date/time is in **your local time** (it's stored as UTC and shown to
  every visitor in their own timezone automatically).
- Stage is one of: `Group Stage`, `Round of 16`, `Quarter Final`,
  `Semi Final`, `Third Place`, `Final`.
- The last two fields are 2-letter country codes for flag emojis (optional,
  e.g. `BR`, `AR`). Leave blank if unsure.

Example block:
```
Mexico | Poland | 2026-06-11 20:00 | Group Stage | MX | PL
Qatar | Ecuador | 2026-06-12 18:00 | Group Stage | QA | EC
```

---

## How the rules work (built-in, automatic)

- **Predictions open** exactly **24 hours before** kickoff.
- **Predictions close** exactly **2 hours before** kickoff. After that the
  database itself **rejects** any new or changed pick — no one can cheat by
  editing the page.
- **Scoring:** correct pick = **2 points**, wrong = **0**. No bonuses.
- **Knockout matches:** only Team A / Team B (no Draw option).
- **Two leaderboards:**
  - *Total Points* = correct × 2.
  - *Accuracy %* = correct ÷ graded predictions × 100. Shown only for players
    with **at least 10** graded predictions, so late joiners stay competitive.
- **Entering a result** automatically recalculates everyone's points,
  accuracy, and rankings. There's also a manual **Recalculate** button.
- **Privacy:** other users only ever see your **display name**. Your email,
  username, and picks stay private.

---

## Optional extras

### Turn on "Continue with Google"
Supabase → **Authentication → Providers → Google** → enable and follow their
short setup. The button on the login page then works — no code change needed.

### Email confirmation on/off
Supabase → **Authentication → Providers → Email**. For a casual friends' game
you can turn **"Confirm email" off** so people can log in immediately after
registering.

### Reminder emails / browser notifications
These need an email service (e.g. Resend) and a scheduled job, which is a
bigger add-on. The app is fully usable without them; ask and they can be added
later.

---

## Running it on your own computer (optional, for testing)

You only need this if you want to preview changes locally.

1. Install **Node.js** (nodejs.org, the LTS version).
2. In the project folder, copy `.env.local.example` to `.env.local` and paste
   in your two Supabase values.
3. Run:
   ```
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000`.

---

## File map (what's what)

```
database/schema.sql      ← the database + security + scoring (run once)
pages/index.js           ← home / both leaderboards
pages/matches.js         ← all fixtures + make predictions
pages/dashboard.js       ← a user's personal stats
pages/hall-of-fame.js    ← public Hall of Fame
pages/login.js           ← login (+ Google)
pages/register.js        ← sign up
pages/admin/index.js     ← admin panel (fixtures, results, users, import)
components/Layout.js      ← page frame + footer
components/MatchCard.js   ← a single match with countdown + buttons
lib/helpers.js            ← prediction-window + time logic
lib/supabaseClient.js     ← database connection
```

---

Created and Managed by Dp Poojian
