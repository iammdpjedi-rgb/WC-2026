import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

export default function HallOfFame() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_hall_of_fame");
      setData(data || []);
      setLoading(false);
    })();
  }, []);

  const winner = data[0];
  const bestAccuracy = [...data].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];
  const mostCorrect = [...data].sort((a, b) => b.correct - a.correct)[0];
  const top10 = data.slice(0, 10);

  const Award = ({ title, name, sub }) => (
    <div className="card p-5 text-center">
      <div className="text-sm text-white/60">{title}</div>
      <div className="text-xl font-extrabold text-gold mt-1">{name || "—"}</div>
      <div className="text-xs text-white/50 mt-1">{sub}</div>
    </div>
  );

  return (
    <Layout>
      <div className="text-center mb-6">
        <h1 className="text-3xl font-extrabold">🏆 Prediction Hall of Fame</h1>
      </div>

      {loading ? <p className="text-white/50 text-center">Loading…</p> : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            <Award title="Tournament Winner" name={winner?.display_name}
              sub={winner ? `${winner.points} pts · ${winner.accuracy ?? 0}% accuracy` : ""} />
            <Award title="Highest Accuracy" name={bestAccuracy?.display_name}
              sub={bestAccuracy ? `${bestAccuracy.accuracy ?? 0}% (${bestAccuracy.predictions_made} preds)` : ""} />
            <Award title="Most Correct Predictions" name={mostCorrect?.display_name}
              sub={mostCorrect ? `${mostCorrect.correct} correct` : ""} />
          </div>

          <h2 className="font-bold mb-3">Top 10</h2>
          <div className="card overflow-hidden">
            {top10.map((r, i) => (
              <div key={i} className="grid grid-cols-12 px-4 py-3 items-center border-b border-white/5">
                <div className="col-span-1 font-bold">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </div>
                <div className="col-span-6 font-semibold truncate">{r.display_name}</div>
                <div className="col-span-2 text-right text-gold font-bold">{r.points} pts</div>
                <div className="col-span-3 text-right text-white/60">{r.accuracy ?? 0}% acc</div>
              </div>
            ))}
            {top10.length === 0 && <div className="p-6 text-center text-white/50">No data yet.</div>}
          </div>
        </>
      )}
    </Layout>
  );
}
