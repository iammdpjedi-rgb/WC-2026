import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./_app";
import { useRouter } from "next/router";
import { formatLocal, predictionStatus, pickLabel } from "../lib/helpers";

// Big headline number (Points / Accuracy / Rank).
function HeroStat({ label, value, accent }) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl sm:text-4xl font-extrabold leading-none ${accent ? "text-gold" : ""}`}>
        {value}
      </div>
      <div className="text-xs text-white/60 mt-2 uppercase tracking-wide">{label}</div>
    </div>
  );
}

// One label/value line inside the breakdown card.
function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/70">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

// Status pill shown on each prediction.
function ResultBadge({ m, isCorrect }) {
  const base = "whitespace-nowrap text-xs font-semibold px-2 py-1 rounded-full border";
  if (m.is_completed) {
    return isCorrect ? (
      <span className={`${base} bg-green-400/10 text-green-300 border-green-400/30`}>Correct +2</span>
    ) : (
      <span className={`${base} bg-red-400/10 text-red-300 border-red-400/30`}>Wrong</span>
    );
  }
  return predictionStatus(m) === "open" ? (
    <span className={`${base} bg-blue-400/10 text-blue-300 border-blue-400/30`}>Editable</span>
  ) : (
    <span className={`${base} bg-white/5 text-white/50 border-white/10`}>Locked</span>
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
  const pending = rows.length - graded.length;

  return (
    <Layout>
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">Hi, {profile?.display_name} 👋</h1>
      <p className="text-white/60 text-sm mb-5">Your prediction summary</p>

      {/* Headline numbers — always 3 across, big and readable on a phone */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <HeroStat label="Points" value={points} accent />
        <HeroStat label="Accuracy" value={`${accuracy}%`} accent />
        <HeroStat label="Rank" value={rank} />
      </div>

      {/* The detail numbers, grouped into one tidy card instead of many tiny tiles */}
      <div className="card px-4 py-2 mb-6">
        <SummaryRow label="Predictions made" value={rows.length} />
        <SummaryRow label="Correct picks" value={correct} />
        <SummaryRow label="Wrong picks" value={wrong} />
        <SummaryRow label="Graded" value={graded.length} />
        <SummaryRow label="Pending" value={pending} />
      </div>

      <h2 className="font-bold mb-3">Your predictions</h2>
      {!ready && <p className="text-white/50">Loading…</p>}
      {ready && rows.length === 0 && (
        <div className="card p-6 text-center text-white/60">
          <p className="mb-3">You haven&apos;t made any predictions yet.</p>
          <a
            href="/matches"
            className="inline-block text-sm font-semibold px-4 py-2 rounded-lg bg-white/10 text-gold border border-white/10"
          >
            Go to Matches →
          </a>
        </div>
      )}

      {/* Each prediction stacks top-to-bottom so long team names never get squashed */}
      <div className="space-y-3">
        {ready && rows.map((r, i) => {
          const m = r.match;
          const tone = m.is_completed
            ? (r.is_correct ? "border-green-400/40" : "border-red-400/30")
            : "border-white/10";
          return (
            <div key={i} className={`card p-3 border ${tone}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-white/50 min-w-0">
                  {m.stage} · {formatLocal(m.kickoff)}
                </div>
                <ResultBadge m={m} isCorrect={r.is_correct} />
              </div>
              <div className="font-semibold text-base leading-snug mt-1">
                {m.team_a} vs {m.team_b}
              </div>
              <div className="text-sm text-white/70 mt-1">
                Your pick: <b className="text-white">{pickLabel(m, r.pick)}</b>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
