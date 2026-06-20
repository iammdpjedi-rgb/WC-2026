// pages/api/live-scores.js
// -----------------------------------------------------------------------------
// Server-side proxy for free World Cup 2026 live scores (worldcup26.ir).
//
// Why this exists:
//   * Keeps the API token OFF the browser (it lives in Vercel env vars).
//   * Avoids CORS — your page calls THIS route, which calls the upstream.
//   * Caches results for 30s so we don't hammer the free API.
//
// SETUP (Vercel → Settings → Environment Variables), then Redeploy:
//   Option 1 (simplest): set WC_API_EMAIL and WC_API_PASSWORD.
//                         (Register once on the API — see the chat notes.)
//   Option 2: set WC_API_TOKEN to a JWT you already obtained.
//   Optional: WC_API_BASE (defaults to https://worldcup26.ir).
//
// If no credentials are set, the route simply returns an empty list and your
// page shows no score badges — nothing breaks.
// -----------------------------------------------------------------------------

const BASE = process.env.WC_API_BASE || "https://worldcup26.ir";

// In-memory caches. These persist only while a serverless instance stays warm,
// which is fine here — worst case we do a few extra upstream calls.
let tokenCache = { token: null, exp: 0 };
let teamsCache = { map: null, ts: 0 };
let scoresCache = { data: null, ts: 0 };

const TEAMS_TTL = 6 * 60 * 60 * 1000; // team list barely changes -> 6 hours
const SCORES_TTL = 30 * 1000; // scores -> 30 seconds

async function getToken() {
  // 1) An explicit token always wins.
  if (process.env.WC_API_TOKEN) return process.env.WC_API_TOKEN;

  // 2) Reuse a cached login token if it's still fresh.
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;

  // 3) Otherwise log in with email + password.
  const email = process.env.WC_API_EMAIL;
  const password = process.env.WC_API_PASSWORD;
  if (!email || !password) return null;

  try {
    const r = await fetch(`${BASE}/auth/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.token) return null;
    tokenCache = { token: j.token, exp: Date.now() + 60 * 60 * 1000 }; // re-check hourly
    return j.token;
  } catch (_) {
    return null;
  }
}

async function apiGet(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  // Token expired? Force a fresh login and retry once.
  if (r.status === 401) {
    tokenCache = { token: null, exp: 0 };
    const fresh = await getToken();
    if (fresh && fresh !== token) {
      const r2 = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${fresh}` },
      });
      if (r2.ok) return r2.json();
    }
    return null;
  }

  if (!r.ok) return null;
  return r.json();
}

async function getTeamsMap(token) {
  if (teamsCache.map && Date.now() - teamsCache.ts < TEAMS_TTL) return teamsCache.map;

  const data = await apiGet("/get/teams", token);
  const list = Array.isArray(data) ? data : data?.teams || data?.data || [];
  const map = {};
  for (const t of list) {
    const id = String(t.id ?? t._id ?? "");
    if (id) map[id] = { name: t.name_en || t.name || "", code: t.fifa_code || "" };
  }
  if (Object.keys(map).length) teamsCache = { map, ts: Date.now() };
  return teamsCache.map || map;
}

export default async function handler(req, res) {
  try {
    // Serve cached scores if still fresh.
    if (scoresCache.data && Date.now() - scoresCache.ts < SCORES_TTL) {
      res.setHeader("Cache-Control", "public, max-age=30");
      return res.status(200).json({ games: scoresCache.data, cached: true });
    }

    const token = await getToken();
    if (!token) return res.status(200).json({ games: [], error: "no_credentials" });

    const teams = await getTeamsMap(token);
    const raw = await apiGet("/get/games", token);
    const list = Array.isArray(raw) ? raw : raw?.games || raw?.data || [];
    if (!Array.isArray(list)) return res.status(200).json({ games: [], error: "bad_upstream" });

    const games = list
      .map((g) => {
        const home = teams[String(g.home_team_id)] || {};
        const away = teams[String(g.away_team_id)] || {};
        return {
          home: home.name || "",
          homeCode: home.code || "",
          away: away.name || "",
          awayCode: away.code || "",
          homeScore: g.home_score ?? null,
          awayScore: g.away_score ?? null,
          finished: Boolean(g.finished),
          // Pass through a live minute/status if the upstream ever provides one.
          minute: g.minute ?? g.elapsed ?? g.time ?? null,
          status: g.status ?? null,
        };
      })
      .filter((x) => x.home && x.away);

    scoresCache = { data: games, ts: Date.now() };
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.status(200).json({ games });
  } catch (_) {
    // Never break the page — just return nothing on error.
    return res.status(200).json({ games: [], error: "exception" });
  }
}
