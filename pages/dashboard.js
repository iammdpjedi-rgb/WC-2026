import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./_app";
import { useRouter } from "next/router";
import { formatLocal, predictionStatus, pickLabel } from "../lib/helpers";

function Stat({ label, value, accent }) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-2xl font-extrabold ${accent ? "text-gold" : ""}`}>{value}</div>
      <div className="text-xs text-white/60 mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [rank, setRank] = useState("—");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("predictions")
        .select("pick, is_correct, points, match:matches(*)")
        .eq("user_id", user.id);
      const list = (data || []).sort(
        (a, b) => new Date(b.match.kickoff) - new Date(a.match.kickoff)
      );
      setRows(list);

      // Work out this player's rank on the points board.
      const { data: lb } = await supabase.rpc("get_total_leaderboard");
      const idx = (lb || []).findIndex(r => r.display_name === profile?.display_name);
      setRank(idx >= 0 ? idx + 1 : "—");
      setReady(true);
    })();
  }, [user, profile]);

  if (loading || !user) return <Layout><p className="text-white/50">Loading…</p></Layout>;

  const graded = rows.filter(r => r.match.is_completed && r.match.result);
  const correct = graded.filter(r => r.is_correct).length;
  const wrong = graded.length - correct;
  const points = correct * 2;
  const accuracy = graded.length ? Math.round((correct / graded.length) * 1000) / 10 : 0;

  return (
    <Layout>
      <h1 className="text-2xl font-extrabold mb-1">Hi, {profile?.display_name} 👋</h1>
      <p className="text-white/60 text-sm mb-5">Your prediction summary</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Points" value={points} accent />
        <Stat label="Accuracy" value={`${accuracy}%`} accent />
        <Stat label="Points Rank" value={rank} />
        <Stat label="Predictions Made" value={rows.length} />
        <Stat label="Correct Picks" value={correct} />
        <Stat label="Wrong Picks" value={wrong} />
        <Stat label="Graded" value={graded.length} />
        <Stat label="Pending" value={rows.length - graded.length} />
      </div>

      <h2 className="font-bold mb-3">Your predictions</h2>
      {!ready && <p className="text-white/50">Loading…</p>}
      {ready && rows.length === 0 && (
        <div className="card p-6 text-center text-white/60">
          You haven&apos;t made any predictions yet. Head to <b>Matches</b> to start.
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => {
          const m = r.match;
          const status = predictionStatus(m);
          const tone = m.is_completed
            ? (r.is_correct ? "border-green-400/40" : "border-red-400/30")
            : "border-white/10";
          return (
            <div key={i} className={`card p-3 flex items-center justify-between border ${tone}`}>
              <div>
                <div className="font-semibold text-sm">{m.team_a} vs {m.team_b}</div>
                <div className="text-xs text-white/50">{m.stage} · {formatLocal(m.kickoff)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm">Pick: <b>{pickLabel(m, r.pick)}</b></div>
                <div className="text-xs">
                  {m.is_completed
                    ? (r.is_correct ? <span className="text-green-400">Correct +2</span>
                                    : <span className="text-red-400">Wrong</span>)
                    : <span className="text-white/50">{status === "open" ? "Editable" : "Locked"}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
