// =============================================================
// pages/api/fetch-results.js
//
// Pulls FINISHED World Cup matches from a football data feed and
// writes the winners into your `matches` table, then runs your
// existing scoring engine. Nothing about scoring/RLS/leaderboards
// changes — this just does the same two writes your admin "tap the
// winner" button does, automatically.
//
// It can be triggered two ways:
//   1) The "Fetch results" button in Admin (sends the admin's login token).
//   2) (Optional, later) a free scheduler sending the x-sync-secret header
//      — that's Option B / fully hands-off. No code change needed for it.
//
// ENV VARS to set in Vercel (Settings -> Environment Variables).
// IMPORTANT: do NOT prefix these with NEXT_PUBLIC_ — they must stay
// server-side only.
//   SUPABASE_SERVICE_ROLE_KEY   -> Supabase service_role key (Project
//                                  Settings -> API -> service_role "secret").
//   FOOTBALL_API_KEY            -> your football-data.org token.
//   RESULTS_SYNC_SECRET         -> any random string; ONLY needed when you
//                                  add the scheduler (Option B).
// The existing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// are reused automatically.
//
// After adding/changing env vars you MUST Redeploy in Vercel.
// =============================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const SYNC_SECRET = process.env.RESULTS_SYNC_SECRET;

// ---- Name matching helpers ----------------------------------
// Normalise a team name: lowercase, drop accents and punctuation.
// "Côte d'Ivoire" -> "cote d ivoire", "USA" -> "usa", etc.
function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Known naming differences between your fixtures and the feed.
// Every variant on the left collapses to one shared key, so it does
// not matter which spelling each side uses — they still match.
// If a match comes back "couldn't match", add the two spellings here.
const ALIASES = {
  "usa": "united states",
  "united states of america": "united states",
  "south korea": "korea republic",
  "korea": "korea republic",
  "ivory coast": "cote d ivoire",
  "cote divoire": "cote d ivoire",
  "czechia": "czech republic",
  "cape verde": "cabo verde",
  "iran": "ir iran",
  "drc": "congo dr",
  "dr congo": "congo dr",
};
function canon(name) {
  const n = norm(name);
  return ALIASES[n] || n;
}

function dayUTC(iso) {
  return new Date(iso).toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}
function daysApart(d1, d2) {
  const a = new Date(d1 + "T00:00:00Z").getTime();
  const b = new Date(d2 + "T00:00:00Z").getTime();
  return Math.round(Math.abs(a - b) / 86400000);
}

// ---- Provider adapter: football-data.org --------------------
// Returns a normalised list of FINISHED matches. To use a DIFFERENT
// provider (or a feed you already have), replace ONLY this function
// with one that returns the same shape. Nothing else needs to change.
async function fetchFinishedMatches() {
  // Competition "WC" = FIFA World Cup. (Numeric id 2000 also works if
  // you ever get a 404 on the code.)
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    { headers: { "X-Auth-Token": FOOTBALL_API_KEY } }
  );
  if (!res.ok) {
    throw new Error(
      `Football data feed returned ${res.status}. Check FOOTBALL_API_KEY / your free-tier access.`
    );
  }
  const data = await res.json();
  const matches = Array.isArray(data.matches) ? data.matches : [];
  return matches
    .filter((m) => m.status === "FINISHED")
    .map((m) => {
      let winner = null; // "HOME" | "AWAY" | "DRAW"
      if (m.score?.winner === "HOME_TEAM") winner = "HOME";
      else if (m.score?.winner === "AWAY_TEAM") winner = "AWAY";
      else if (m.score?.winner === "DRAW") winner = "DRAW";
      return {
        externalId: String(m.id),
        day: dayUTC(m.utcDate),
        homeName: m.homeTeam?.name || m.homeTeam?.shortName || "",
        awayName: m.awayTeam?.name || m.awayTeam?.shortName || "",
        homeGoals: m.score?.fullTime?.home ?? null,
        awayGoals: m.score?.fullTime?.away ?? null,
        winner,
      };
    });
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Server is missing Supabase config." });
  }
  if (!FOOTBALL_API_KEY) {
    return res.status(500).json({ error: "Server is missing FOOTBALL_API_KEY." });
  }

  // ---- Authorise: admin login token (button) OR sync secret (scheduler) ----
  const authedBySecret =
    !!SYNC_SECRET && req.headers["x-sync-secret"] === SYNC_SECRET;

  let authedByAdmin = false;
  if (!authedBySecret) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token && ANON_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });
      const { data } = await userClient.auth.getUser();
      const user = data?.user;
      if (user) {
        const { data: prof } = await userClient
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .single();
        authedByAdmin = !!prof?.is_admin;
      }
    }
  }
  if (!authedBySecret && !authedByAdmin) {
    return res.status(401).json({ error: "Not authorised." });
  }

  // ---- Service-role client does the writes (bypasses RLS safely) ----
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 1) Matches that still need a result.
  const { data: pending, error: loadErr } = await admin
    .from("matches")
    .select("id, team_a, team_b, stage, kickoff, external_id")
    .or("is_completed.eq.false,result.is.null");
  if (loadErr) return res.status(500).json({ error: loadErr.message });

  // 2) Finished matches from the feed.
  let feed;
  try {
    feed = await fetchFinishedMatches();
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }

  const now = Date.now();
  const updated = [];
  const skipped = [];
  const unmatched = [];

  for (const m of pending || []) {
    const label = `${m.team_a} vs ${m.team_b}`;

    // Find the feed fixture: prefer a stored id, else match by name + date.
    let f = null;
    if (m.external_id) {
      f = feed.find((x) => x.externalId === String(m.external_id)) || null;
    }
    if (!f) {
      const day = dayUTC(m.kickoff);
      const a = canon(m.team_a);
      const b = canon(m.team_b);
      const candidates = feed.filter((x) => {
        const h = canon(x.homeName);
        const aw = canon(x.awayName);
        const samePair = (h === a && aw === b) || (h === b && aw === a);
        return samePair && daysApart(day, x.day) <= 1; // allow midnight-UTC straddle
      });
      if (candidates.length === 1) f = candidates[0];
    }

    if (!f) {
      // Only worth flagging if it already kicked off; future games just
      // aren't finished yet, so we stay quiet about those.
      if (new Date(m.kickoff).getTime() < now) unmatched.push(label);
      continue;
    }

    // Work out orientation, then the A / B / D result.
    const homeIsA = canon(f.homeName) === canon(m.team_a);
    let result = null;
    if (f.winner === "DRAW") result = "D";
    else if (f.winner === "HOME") result = homeIsA ? "A" : "B";
    else if (f.winner === "AWAY") result = homeIsA ? "B" : "A";

    // A knockout can never be a draw in this game. If the feed reports a
    // level result (penalty shootout not reflected), don't guess — flag it.
    if (result === "D" && m.stage !== "Group Stage") {
      if (!m.external_id) {
        await admin.from("matches").update({ external_id: f.externalId }).eq("id", m.id);
      }
      skipped.push(`${label} (decided on penalties — set this one by hand)`);
      continue;
    }
    if (!result) {
      skipped.push(`${label} (no clear winner yet)`);
      continue;
    }

    const patch = { result, is_completed: true, external_id: f.externalId };
    if (f.homeGoals != null && f.awayGoals != null) {
      patch.score_a = homeIsA ? f.homeGoals : f.awayGoals;
      patch.score_b = homeIsA ? f.awayGoals : f.homeGoals;
    }
    const { error: upErr } = await admin.from("matches").update(patch).eq("id", m.id);
    if (upErr) {
      skipped.push(`${label} (${upErr.message})`);
      continue;
    }
    updated.push(label);
  }

  // 3) Recalculate everyone's points/accuracy/rankings if anything changed.
  if (updated.length) {
    await admin.rpc("recalculate_scores");
  }

  return res.status(200).json({
    updatedCount: updated.length,
    updated,
    skipped,
    unmatched,
  });
}
