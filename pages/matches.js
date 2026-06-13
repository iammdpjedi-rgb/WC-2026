import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import MatchCard from "../components/MatchCard";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./_app";

export default function Matches() {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [picks, setPicks] = useState({}); // { matchId: 'A'|'B'|'D' }
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

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

  const stages = ["all", "Group Stage", "Round of 32", "Round of 16", "Quarter Final", "Semi Final", "Third Place", "Final"];
  const shown = matches.filter(m => filter === "all" || m.stage === filter);

  return (
    <Layout>
      <h1 className="text-2xl font-extrabold mb-4">Matches</h1>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {stages.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`pill whitespace-nowrap ${filter === s ? "bg-gold text-ink" : "bg-white/10 text-white/80"}`}>
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {loading && <p className="text-white/50">Loading fixtures…</p>}
      {!loading && shown.length === 0 && (
        <div className="card p-6 text-center text-white/60">
          No fixtures yet. The admin can add them from the Admin panel.
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
