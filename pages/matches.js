import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import MatchCard from "../components/MatchCard";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./_app";

// A match counts as "completed" once a result has been recorded.
// This is written defensively so it works whether your matches table
// stores the outcome in `result`, `winner`, `outcome`, `final_result`,
// or a `status` field. If your column is named something else, add it
// to the Boolean(...) line below.
function isCompleted(m) {
  if (m.status) {
    const s = String(m.status).toLowerCase();
    if (["completed", "finished", "final", "done", "graded"].includes(s)) return true;
    if (["scheduled", "upcoming", "pending", "live", "in_progress"].includes(s)) return false;
  }
  return Boolean(m.result ?? m.winner ?? m.outcome ?? m.final_result);
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

export default function Matches() {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [picks, setPicks] = useState({}); // { matchId: 'A'|'B'|'D' }
  const [tab, setTab] = useState("upcoming"); // upcoming | live | completed
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  async function load() {
    const { data: ms } = await supabase.from("matches").select("*").order("kickoff");
    setMatches(ms || []);
    if (user) {
      const { data: ps } = await supabase.from("predictions").select("match_id, pick").eq("user_id", user.id);
      const map = {};
      (ps || []).forEach(p => { map[p.match_id] = p.pick; });
      setPicks(map);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // Re-check upcoming/live as kickoff times pass (refreshes every 60s).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const stages = ["all", "Group Stage", "Round of 32", "Round of 16", "Quarter Final", "Semi Final", "Third Place", "Final"];

  // Sort every match into its tab.
  const buckets = { upcoming: [], live: [], completed: [] };
  matches.forEach(m => { buckets[tabOf(m, now)].push(m); });
  // Completed reads best most-recent first (query gives us oldest-first).
  buckets.completed = [...buckets.completed].reverse();

  const tabs = [
    { key: "upcoming", label: "Upcoming" },
    { key: "live", label: "Live" },
    { key: "completed", label: "Completed" },
  ];

  const inTab = buckets[tab] || [];
  const shown = inTab.filter(m => filter === "all" || m.stage === filter);

  return (
    <Layout>
      <h1 className="text-2xl font-extrabold mb-4">Matches</h1>

      {/* Upcoming / Live / Completed tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pill flex-1 text-center font-semibold ${tab === t.key ? "bg-gold text-ink" : "bg-white/10 text-white/80"}`}>
            {t.label}
            <span className="ml-1 opacity-70">({buckets[t.key].length})</span>
          </button>
        ))}
      </div>

      {/* Stage filter (still works inside the selected tab) */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {stages.map(s => (
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
        {shown.map(m => (
          <MatchCard key={m.id} match={m} myPick={picks[m.id]}
            onPredicted={(id, val) => setPicks(p => ({ ...p, [id]: val }))} />
        ))}
      </div>
    </Layout>
  );
}
