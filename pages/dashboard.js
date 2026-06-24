import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./_app";
import { useRouter } from "next/router";
import { formatLocal, predictionStatus, pickLabel, statusLabel } from "../lib/helpers";

// A stat tile — same look as before, tappable to filter the list below.
function Stat({ label, value, accent, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-4 text-center w-full transition hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${selected ? "ring-2 ring-white/50 bg-white/5" : ""}`}
    >
      <div className={`text-2xl font-extrabold ${accent ? "text-gold" : ""}`}>{value}</div>
      <div className="text-xs text-white/60 mt-1">{label}</div>
    </button>
  );
}

// One label/value line inside an expanded match.
function Detail({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-white/50">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  );
}

// Which predictions a given tile should reveal.
function matchesView(r, view) {
  const m = r.match;
  const isGraded = m.is_completed && m.result;
  if (view === "all") return true;
  if (view === "correct") return isGraded && r.is_correct;
  if (view === "wrong") return isGraded && !r.is_correct;
  if (view === "graded") return isGraded;
  if (view === "pending") return !isGraded;
  return true;
}

// The match outcome. Shows a goal scoreline automatically IF score columns
// (score_a / score_b) ever get added; otherwise falls back to the winner.
function resultText(m) {
  if (!m.result) return "—";
  const hasScore = m.score_a != null && m.score_b != null;
  if (m.result === "D") return hasScore ? `Draw ${m.score_a}–${m.score_b}` : "Draw";
  const winner = m.result === "A" ? m.team_a : m.team_b;
  return hasScore ? `${winner} won ${m.score_a}–${m.score_b}` : `${winner} won`;
}

export default function Dashboard() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [rank, setRank] = useState("—");
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(null);       // tapped tile id, or null = show all
  const [expandedId, setExpandedId] = useState(null); // match id currently expanded

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

  // Each tile: its number, and what tapping it opens.
  const tiles = [
    { id: "points",   label: "Points",           value: points,         accent: true,  view: "correct", heading: "Matches you won" },
    { id: "accuracy", label: "Accuracy",         value: `${accuracy}%`, accent: true,  view: "graded",  heading: "Graded predictions" },
    { id: "rank",     label: "Points Rank",      value: rank,           accent: false, view: "all",     heading: "All predictions" },
    { id: "made",     label: "Predictions Made", value: rows.length,    accent: false, view: "all",     heading: "All predictions" },
    { id: "correct",  label: "Correct Picks",    value: correct,        accent: false, view: "correct", heading: "Correct picks" },
    { id: "wrong",    label: "Wrong Picks",      value: wrong,          accent: false, view: "wrong",   heading: "Wrong picks" },
    { id: "graded",   label: "Graded",           value: graded.length,  accent: false, view: "graded",  heading: "Graded predictions" },
    { id: "pending",  label: "Pending",          value: pending,        accent: false, view: "pending", heading: "Pending predictions" },
  ];

  const activeTile = tiles.find(t => t.id === active) || null;
  const view = activeTile ? activeTile.view : "all";
  const visible = rows.filter(r => matchesView(r, view));

  return (
    <Layout>
      <h1 className="text-2xl font-extrabold mb-1">Hi, {profile?.display_name} 👋</h1>
      <p className="text-white/60 text-sm mb-5">Your prediction summary — tap any stat to filter, or a match for full details</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {tiles.map(t => (
          <Stat
            key={t.id}
            label={t.label}
            value={t.value}
            accent={t.accent}
            selected={active === t.id}
            onClick={() => { setActive(active === t.id ? null : t.id); setExpandedId(null); }}
          />
        ))}
      </div>

      {activeTile ? (
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">
            {activeTile.heading}{" "}
            <span className="text-white/50 text-sm font-normal">({visible.length})</span>
          </h2>
          <button type="button" onClick={() => setActive(null)} className="text-sm text-gold">
            Show all
          </button>
        </div>
      ) : (
        <h2 className="font-bold mb-3">Your predictions</h2>
      )}

      {!ready && <p className="text-white/50">Loading…</p>}
      {ready && rows.length === 0 && (
        <div className="card p-6 text-center text-white/60">
          You haven&apos;t made any predictions yet. Head to <b>Matches</b> to start.
        </div>
      )}
      {ready && rows.length > 0 && visible.length === 0 && (
        <div className="card p-6 text-center text-white/60">
          No matches to show here yet.
        </div>
      )}

      <div className="space-y-2">
        {ready && rows.length > 0 && visible.map((r, i) => {
          const m = r.match;
          const status = predictionStatus(m);
          const open = expandedId === m.id;
          const tone = m.is_completed
            ? (r.is_correct ? "border-green-400/40" : "border-red-400/30")
            : "border-white/10";
          return (
            <div key={m.id || i} className={`card border ${tone} overflow-hidden`}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpandedId(open ? null : m.id)}
                className="w-full text-left p-3 flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{m.team_a} vs {m.team_b}</div>
                  <div className="text-xs text-white/50">{m.stage} · {formatLocal(m.kickoff)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm">Pick: <b>{pickLabel(m, r.pick)}</b></div>
                    <div className="text-xs">
                      {m.is_completed ? (
                        <span className="text-white/70">
                          {resultText(m)}{" "}
                          {r.is_correct
                            ? <span className="text-green-400">· +2</span>
                            : <span className="text-red-400">· 0</span>}
                        </span>
                      ) : (
                        <span className="text-white/50">
                          {status === "open" ? "Editable" : status === "upcoming" ? "Upcoming" : "Locked"}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-white/40 text-xs">{open ? "▾" : "▸"}</span>
                </div>
              </button>

              {open && (
                <div className="border-t border-white/10 px-3 py-2 bg-white/5">
                  <Detail label="Stage" value={m.stage} />
                  <Detail label="Kick-off" value={formatLocal(m.kickoff)} />
                  <Detail label="Your pick" value={pickLabel(m, r.pick)} />
                  <Detail label="Result" value={m.is_completed ? resultText(m) : "Not played yet"} />
                  <Detail label="Points earned" value={m.is_completed ? (r.is_correct ? "2" : "0") : "—"} />
                  <Detail label="Status" value={statusLabel(m)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
