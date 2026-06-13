import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

function Tabs({ tab, setTab }) {
  const T = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      className={`btn flex-1 ${tab === id ? "bg-gold text-ink" : "bg-white/10 text-white"}`}>
      {label}
    </button>
  );
  return (
    <div className="flex gap-2 mb-4">
      <T id="accuracy" label="🎯 Accuracy Ranking" />
      <T id="points" label="🏆 Total Points" />
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState("accuracy");
  const [points, setPoints] = useState([]);
  const [accuracy, setAccuracy] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, a] = await Promise.all([
        supabase.rpc("get_total_leaderboard"),
        supabase.rpc("get_accuracy_leaderboard"),
      ]);
      setPoints(p.data || []);
      setAccuracy(a.data || []);
      setLoading(false);
    })();
  }, []);

  const rows = tab === "points" ? points : accuracy;

  return (
    <Layout>
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold">Leaderboards</h1>
        <p className="text-white/60 text-sm mt-1">
          Accuracy is the main ranking — late joiners aren&apos;t disadvantaged.
        </p>
      </div>

      <Tabs tab={tab} setTab={setTab} />

      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-xs uppercase tracking-wide text-white/50 border-b border-white/10">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Player</div>
          <div className="col-span-2 text-right">{tab === "points" ? "Points" : "Acc %"}</div>
          <div className="col-span-2 text-right">Correct</div>
          <div className="col-span-2 text-right">Made</div>
        </div>

        {loading && <div className="p-6 text-center text-white/50">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-6 text-center text-white/50">
            No ranked players yet.{tab === "accuracy" && " (Accuracy needs at least 10 predictions.)"}
          </div>
        )}

        {rows.map((r, i) => (
          <div key={i}
            className={`grid grid-cols-12 px-4 py-3 items-center border-b border-white/5 ${
              i < 3 ? "bg-gold/5" : ""
            }`}>
            <div className="col-span-1 font-bold">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
            </div>
            <div className="col-span-5 font-semibold truncate">{r.display_name}</div>
            <div className="col-span-2 text-right font-bold text-gold">
              {tab === "points" ? r.points : `${r.accuracy ?? 0}%`}
            </div>
            <div className="col-span-2 text-right text-white/80">{r.correct}</div>
            <div className="col-span-2 text-right text-white/60">{r.predictions_made}</div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
