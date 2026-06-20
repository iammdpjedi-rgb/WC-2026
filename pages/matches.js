import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import MatchCard from "../components/MatchCard";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./_app";

// ---- completion + tab logic ---------------------------------------------
// A match counts as "completed" once the admin has graded it. This matches
// the exact flag your scoring engine and leaderboards use, so the tabs always
// agree with the points shown elsewhere.
function isCompleted(m) {
  return m.is_completed === true || Boolean(m.result);
}

// Decide which tab a match belongs to.
function tabOf(m, nowMs) {
  if (isCompleted(m)) return "completed";
  const kickoff = new Date(m.kickoff).getTime();
  return kickoff <= nowMs ? "live" : "upcoming";
}

function emptyMessage(tab, filter) {
  const stageNote = filter === "all" ? "" : ` in ${filter}`;
  if (tab === "upcoming") return `No upcoming matches${stageNote} right now.`;
  if (tab === "live") return `No matches are live${stageNote} right now.`;
  return `No completed matches${stageNote} yet.`;
}

// ---- live-score name matching -------------------------------------------
// Normalise team names so the live feed (FIFA names) lines up with your
// fixtures, handling accents and common naming differences.
function canon(name) {
  const s = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const aliases = {
    unitedstates: "usa", us: "usa", unitedstatesofamerica: "usa",
    korearepublic: "southkorea", republicofkorea: "southkorea", korea: "southkorea",
    cotedivoire: "ivorycoast",
    iriran: "iran", islamicrepublicofiran: "iran",
    caboverde: "capeverde",
    bosniaandherzegovina: "bosnia", bosniaherzegovina: "bosnia",
    czechrepublic: "czechia",
    democraticrepublicofcongo: "drcongo", congodr: "drcongo",
    turkiye: "turkey", holland: "netherlands",
  };
  return aliases[s] || s;
}

// An order-independent key for a fixture (Team A vs Team B == Team B vs Team A).
function pairKey(a, b) {
  return [canon(a), canon(b)].sort().join("|");
}

export default function Matches() {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [picks, setPicks] = useState({}); // { matchId: 'A'|'B'|'D' }
  const [tab, setTab] = useState("upcoming"); // upcoming | live | completed
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [liveScores, setLiveScores] = useState({}); // pairKey -> score object

  async function load() {
    const { data: ms } = await supabase.from("matches").select("*").order("kickoff");
    setMatches(ms || []);
    if (user) {
      const { data: ps } = await supabase.from("predictions").select("match_id, pick").eq("user_id", user.id);
      const map = {};
      (ps || []).forEach((p) => { map[p.match_id] = p.pick; });
      setPicks(map);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // Re-check upcoming/live as kickoff times pass (every 60s).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Fetch scores on the Live and Completed tabs.
  //   * Live tab      -> refresh every 45s (scores are changing).
  //   * Completed tab -> fetch once (final scores don't change).
  useEffect(() => {
    if (tab !== "live" && tab !== "completed") return;
    let active = true;
    async function pull() {
      try {
        const r = await fetch("/api/live-scores");
        const j = await r.json();
        if (!active) return;
        const map = {};
        (j.games || []).forEach((g) => { map[pairKey(g.home, g.away)] = g; });
        setLiveScores(map);
      } catch (_) { /* ignore — page still works without scores */ }
    }
    pull();
    const t = tab === "live" ? setInterval(pull, 45000) : null;
    return () => { active = false; if (t) clearInterval(t); };
  }, [tab]);

  const stages = ["all", "Group Stage", "Round of 32", "Round of 16", "Quarter Final", "Semi Final", "Third Place", "Final"];

  // Sort every match into its tab.
  const buckets = { upcoming: [], live: [], completed: [] };
  matches.forEach((m) => { buckets[tabOf(m, now)].push(m); });
  // Completed reads best most-recent first (query gives us oldest-first).
  buckets.completed = [...buckets.completed].reverse();

  const tabs = [
    { key: "upcoming", label: "Upcoming" },
    { key: "live", label: "Live" },
    { key: "completed", label: "Completed" },
  ];

  const inTab = buckets[tab] || [];
  const shown = inTab.filter((m) => filter === "all" || m.stage === filter);

  // Find the score for one of our matches, oriented to Team A / Team B.
  function scoreFor(m) {
    const g = liveScores[pairKey(m.team_a, m.team_b)];
    if (!g || g.homeScore == null || g.awayScore == null) return null;
    const aIsHome = canon(m.team_a) === canon(g.home);
    return {
      aScore: aIsHome ? g.homeScore : g.awayScore,
      bScore: aIsHome ? g.awayScore : g.homeScore,
      finished: g.finished,
      minute: g.minute,
    };
  }

  return (
    <Layout>
      <h1 className="text-2xl font-extrabold mb-4">Matches</h1>

      {/* Upcoming / Live / Completed tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pill flex-1 text-center font-semibold ${tab === t.key ? "bg-gold text-ink" : "bg-white/10 text-white/80"}`}>
            {t.label}
            <span className="ml-1 opacity-70">({buckets[t.key].length})</span>
          </button>
        ))}
      </div>

      {/* Stage filter (still works inside the selected tab) */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {stages.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`pill whitespace-nowrap ${filter === s ? "bg-gold text-ink" : "bg-white/10 text-white/80"}`}>
            {s === "all" ? "All stages" : s}
          </button>
        ))}
      </div>

      {loading && <p className="text-white/50">Loading fixtures…</p>}
      {!loading && shown.length === 0 && (
        <div className="card p-6 text-center text-white/60">
          {emptyMessage(tab, filter)}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {shown.map((m) => {
          // Show a score badge on both the Live and Completed tabs.
          const sc = (tab === "live" || tab === "completed") ? scoreFor(m) : null;
          const isFinal = tab === "completed" || (sc && sc.finished);
          return (
            <div key={m.id}>
              {sc && (
                <div className="mb-1 flex items-center justify-center gap-3 rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                  <span>{m.team_a} <b className="text-gold">{sc.aScore}</b></span>
                  <span className="text-white/40">–</span>
                  <span><b className="text-gold">{sc.bScore}</b> {m.team_b}</span>
                  {isFinal ? (
                    <span className="ml-1 text-white/50">FT</span>
                  ) : (
                    <span className="ml-1 flex items-center gap-1 text-red-400">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      {sc.minute ? `${sc.minute}'` : "LIVE"}
                    </span>
                  )}
                </div>
              )}
              <MatchCard match={m} myPick={picks[m.id]}
                onPredicted={(id, val) => setPicks((p) => ({ ...p, [id]: val }))} />
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
