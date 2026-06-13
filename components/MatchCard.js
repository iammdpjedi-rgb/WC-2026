import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../pages/_app";
import {
  predictionStatus, statusLabel, formatLocal, allowsDraw, windowFor,
} from "../lib/helpers";

function Flag({ code, name }) {
  // Uses emoji flags if a 2-letter code is given, else a placeholder.
  const emoji = code && code.length === 2
    ? code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()))
    : "🏳️";
  return (
    <div className="flex flex-col items-center gap-1 w-24">
      <span className="text-3xl">{emoji}</span>
      <span className="text-sm font-semibold text-center leading-tight">{name}</span>
    </div>
  );
}

export default function MatchCard({ match, myPick, onPredicted }) {
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [pick, setPick] = useState(myPick ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setPick(myPick ?? null); }, [myPick]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  const status = predictionStatus(match, now);
  const canPredict = status === "open" && !!user;
  const { kickoff } = windowFor(match);

  async function choose(value) {
    if (!canPredict || saving) return;
    setSaving(true); setError("");
    // Upsert: insert or update the single (user, match) row.
    const { error } = await supabase
      .from("predictions")
      .upsert(
        { user_id: user.id, match_id: match.id, pick: value, updated_at: new Date().toISOString() },
        { onConflict: "user_id,match_id" }
      );
    setSaving(false);
    if (error) {
      // The database itself blocks out-of-window edits, so this is the
      // last line of defence if someone tries to cheat.
      setError("Could not save — predictions may be closed.");
      return;
    }
    setPick(value);
    onPredicted?.(match.id, value);
  }

  const pillTone = {
    upcoming: "bg-white/15 text-white/80",
    open: "bg-gold text-ink",
    closed: "bg-red-500/20 text-red-300",
    completed: "bg-pitch text-white",
  }[status];

  const Choice = ({ value, label }) => {
    const active = pick === value;
    const correct = match.is_completed && match.result === value;
    return (
      <button
        onClick={() => choose(value)}
        disabled={!canPredict}
        className={`flex-1 rounded-xl px-2 py-3 text-sm font-semibold border transition
          ${active ? "bg-gold text-ink border-gold" : "bg-white/5 border-white/15 text-white"}
          ${!canPredict ? "cursor-default opacity-90" : "hover:border-gold"}
          ${correct ? "ring-2 ring-green-400" : ""}`}>
        {label}{active ? " ✓" : ""}
      </button>
    );
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/50">{match.stage}</span>
        <span className={`pill ${pillTone}`}>{statusLabel(match, now)}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Flag code={match.team_a_code} name={match.team_a} />
        <div className="text-center">
          <div className="text-xs text-white/50">Kick-off (your time)</div>
          <div className="text-sm font-semibold">{formatLocal(match.kickoff)}</div>
          {match.is_completed && match.result && (
            <div className="mt-1 text-gold text-sm font-bold">
              Result: {match.result === "A" ? match.team_a : match.result === "B" ? match.team_b : "Draw"}
            </div>
          )}
        </div>
        <Flag code={match.team_b_code} name={match.team_b} />
      </div>

      <div className="mt-4 flex gap-2">
        <Choice value="A" label={match.team_a} />
        {allowsDraw(match) && <Choice value="D" label="Draw" />}
        <Choice value="B" label={match.team_b} />
      </div>

      {!user && status === "open" && (
        <p className="mt-2 text-xs text-white/50 text-center">Log in to make your prediction.</p>
      )}
      {pick && status !== "open" && (
        <p className="mt-2 text-xs text-white/60 text-center">
          Your pick: {pick === "A" ? match.team_a : pick === "B" ? match.team_b : "Draw"}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-300 text-center">{error}</p>}
    </div>
  );
}
