// =============================================================
// pages/api/fetch-results.js
//
// Reads FINISHED World Cup matches from the worldcup26.ir API and
// writes the winners into your `matches` table, then runs your
// existing scoring engine. Nothing about scoring/RLS/leaderboards
// changes — this just does the same two writes your admin "tap the
// winner" button does, automatically.
//
// Triggered two ways:
//   1) The "Fetch results" button in Admin (sends the admin's login token).
//   2) (Optional, later) a free scheduler sending the x-sync-secret header
//      — that's the fully hands-off version. No code change needed for it.
//
// ENV VARS in Vercel (Settings -> Environment Variables).
// Do NOT prefix these with NEXT_PUBLIC_ — they must stay server-side.
//   SUPABASE_SERVICE_ROLE_KEY  -> Supabase service_role key (Settings ->
//                                 API Keys -> Legacy API Keys tab).
//   WC_API_EMAIL               -> your worldcup26.ir login email   (already set)
//   WC_API_PASSWORD            -> your worldcup26.ir login password (already set)
//   RESULTS_SYNC_SECRET        -> any random string; ONLY needed when you
//                                 add the scheduler.
// The existing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// are reused automatically.
//
// After adding/changing env vars you MUST Redeploy in Vercel.
// =============================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_SECRET = process.env.RESULTS_SYNC_SECRET;

// ---- worldcup26.ir API ----
const WC_BASE = "https://worldcup26.ir";
const WC_EMAIL = process.env.WC_API_EMAIL;
const WC_PASSWORD = process.env.WC_API_PASSWORD;

// ---- Name matching helpers ----
// Normalise a team name: lowercase, drop accents and punctuation.
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
// Every variant on the left collapses to one shared key, so it does not
// matter which spelling each side uses. If a match comes back "couldn't
// match", add the two spellings here.
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
};
function canon(name) {
  const n = norm(name);
  return ALIASES[n] || n;
}

// Pull an array out of whatever shape the API returns.
function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const k of ["data", "games", "matches", "teams", "results", "items"]) {
      if (Array.isArray(payload[k])) return payload[k];
    }
    for (const v of Object.values(payload)) if (Array.isArray(v)) return v;
    const objs = Object.values(payload).filter((v) => v && typeof v === "object");
    if (objs.length) return objs;
  }
  return [];
}

// Loose check used only to break ties when the same pair appears twice.
function typeMatchesStage(typeRaw, stage) {
  const t = canon(typeRaw);
  const s = canon(stage);
  if (!t) return false;
  if (s.includes("group")) return t.includes("group");
  if (s.includes("32")) return t.includes("32");
  if (s.includes("16")) return t.includes("16");
  if (s.includes("quarter")) return t.includes("quarter") || t === "qf";
  if (s.includes("semi")) return t.includes("semi") || t === "sf";
  if (s.includes("third")) return t.includes("third") || t.includes("3rd");
  if (s.includes("final")) return t.includes("final");
  return false;
}

// ---- Log in, then read teams + games ----
async function wcLogin() {
  const res = await fetch(`${WC_BASE}/auth/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: WC_EMAIL, password: WC_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `worldcup26.ir login returned ${res.status} — check WC_API_EMAIL / WC_API_PASSWORD.`
    );
  }
  const data = await res.json();
  if (!data?.token) throw new Error("worldcup26.ir login did not return a token.");
  return data.token;
}

async function wcGet(path, token) {
  const res = await fetch(`${WC_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`worldcup26.ir ${path} returned ${res.status}.`);
  return res.json();
}

// Returns a normalised list of FINISHED matches. (This is the only part
// that is specific to worldcup26.ir — to switch feeds, replace just this.)
async function fetchFinishedMatches() {
  const token = await wcLogin();
  const teams = pickArray(await wcGet("/get/teams", token));
  const games = pickArray(await wcGet("/get/games", token));

  // team id -> English name, so we can match against your fixtures.
  const nameById = {};
  for (const t of teams) {
    if (t && t.id != null) {
      nameById[String(t.id)] = t.name_en || t.name || t.fifa_code || "";
    }
  }

  const isFinished = (v) => v === true || v === "true" || v === 1 || v === "1";

  return games.filter((g) => isFinished(g.finished)).map((g) => {
    const hg = Number(g.home_score);
    const ag = Number(g.away_score);
    let winner = null; // "HOME" | "AWAY" | "DRAW"
    if (Number.isFinite(hg) && Number.isFinite(ag)) {
      if (hg > ag) winner = "HOME";
      else if (ag > hg) winner = "AWAY";
      else winner = "DRAW";
    }
    return {
      externalId: String(g.id),
      homeName: nameById[String(g.home_team_id)] || "",
      awayName: nameById[String(g.away_team_id)] || "",
      homeGoals: Number.isFinite(hg) ? hg : null,
      awayGoals: Number.isFinite(ag) ? ag : null,
      winner,
      typeRaw: g.type || "",
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Server is missing Supabase config (SUPABASE_SERVICE_ROLE_KEY)." });
  }
  if (!WC_EMAIL || !WC_PASSWORD) {
    return res.status(500).json({ error: "Server is missing WC_API_EMAIL / WC_API_PASSWORD." });
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

    // Find the feed game: prefer a stored id, else match on the team pair.
    let f = null;
    if (m.external_id) {
      f = feed.find((x) => x.externalId === String(m.external_id)) || null;
    }
    if (!f) {
      const a = canon(m.team_a);
      const b = canon(m.team_b);
      let candidates = feed.filter((x) => {
        const h = canon(x.homeName);
        const aw = canon(x.awayName);
        return (h === a && aw === b) || (h === b && aw === a);
      });
      if (candidates.length > 1) {
        const narrowed = candidates.filter((x) => typeMatchesStage(x.typeRaw, m.stage));
        if (narrowed.length === 1) candidates = narrowed;
      }
      if (candidates.length === 1) f = candidates[0];
    }

    if (!f) {
      // Future games simply aren't finished yet — only flag past ones.
      if (new Date(m.kickoff).getTime() < now) unmatched.push(label);
      continue;
    }

    // Orientation, then the A / B / D result.
    const homeIsA = canon(f.homeName) === canon(m.team_a);
    let result = null;
    if (f.winner === "DRAW") result = "D";
    else if (f.winner === "HOME") result = homeIsA ? "A" : "B";
    else if (f.winner === "AWAY") result = homeIsA ? "B" : "A";

    // A knockout can't be a draw in this game. If the feed shows a level
    // score (a penalty shootout it can't represent), don't guess — flag it.
    if (result === "D" && m.stage !== "Group Stage") {
      if (!m.external_id) {
        await admin.from("matches").update({ external_id: f.externalId }).eq("id", m.id);
      }
      skipped.push(`${label} (level score — set this knockout by hand)`);
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
