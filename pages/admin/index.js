import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../_app";
import { useRouter } from "next/router";
import { formatLocal } from "../../lib/helpers";

const STAGES = ["Group Stage","Round of 32","Round of 16","Quarter Final","Semi Final","Third Place","Final"];
const empty = { team_a:"", team_b:"", team_a_code:"", team_b_code:"", kickoff:"", stage:"Group Stage" };

export default function Admin() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("fixtures");
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [bulk, setBulk] = useState("");
  const [note, setNote] = useState("");
  const [fetching, setFetching] = useState(false);
  const [scores, setScores] = useState({}); // { [matchId]: { a, b } } for the score boxes

  useEffect(() => {
    if (!loading && (!user || !profile?.is_admin)) router.replace("/");
  }, [loading, user, profile, router]);

  async function load() {
    const { data: ms } = await supabase.from("matches").select("*").order("kickoff");
    const list = ms || [];
    setMatches(list);
    // Seed the score boxes from whatever is already saved.
    const sc = {};
    list.forEach(m => { sc[m.id] = { a: m.score_a ?? "", b: m.score_b ?? "" }; });
    setScores(sc);
    const { data: us } = await supabase.from("profiles").select("*").order("created_at");
    setUsers(us || []);
  }
  useEffect(() => { if (profile?.is_admin) load(); }, [profile]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ---- Score boxes (display only — does NOT affect points) ----
  const toInt = (v) => (v === "" || v === null || isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));
  const setScoreField = (id, field) => (e) =>
    setScores(s => ({ ...s, [id]: { ...(s[id] || { a: "", b: "" }), [field]: e.target.value } }));
  async function saveScore(m) {
    const s = scores[m.id] || { a: "", b: "" };
    const { error } = await supabase.from("matches")
      .update({ score_a: toInt(s.a), score_b: toInt(s.b) })
      .eq("id", m.id);
    setNote(error ? "Error: " + error.message : `Score saved for ${m.team_a} vs ${m.team_b}.`);
    load();
  }

  // ---- Auto-fetch results from the live data feed ----
  // Calls /api/fetch-results, which fills winners + scores for finished
  // matches and recalculates everyone's points. You can still Reopen any
  // match below to override.
  async function fetchResults() {
    if (fetching) return;
    setFetching(true);
    setNote("Fetching results from the live feed…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setNote("Please log in again."); setFetching(false); return; }
      const res = await fetch("/api/fetch-results", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const out = await res.json();
      if (!res.ok) { setNote("Error: " + (out.error || res.status)); setFetching(false); return; }
      const bits = [`Updated ${out.updatedCount} result${out.updatedCount === 1 ? "" : "s"}.`];
      if (out.skipped?.length)   bits.push(`Set by hand: ${out.skipped.join("; ")}.`);
      if (out.unmatched?.length) bits.push(`Couldn't match (check team names): ${out.unmatched.join("; ")}.`);
      setNote(bits.join(" "));
      load();
    } catch (e) {
      setNote("Error: " + (e.message || e));
    } finally {
      setFetching(false);
    }
  }

  // ---- Fixtures ----
  async function saveFixture(e) {
    e.preventDefault();
    // Convert the local datetime-input value to a UTC ISO string.
    const payload = { ...form, kickoff: new Date(form.kickoff).toISOString() };
    let res;
    if (editId) res = await supabase.from("matches").update(payload).eq("id", editId);
    else res = await supabase.from("matches").insert(payload);
    if (res.error) return setNote("Error: " + res.error.message);
    setForm(empty); setEditId(null); setNote("Saved.");
    load();
  }

  function editFixture(m) {
    // datetime-local needs 'YYYY-MM-DDTHH:mm' in LOCAL time.
    const d = new Date(m.kickoff);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    setForm({ team_a:m.team_a, team_b:m.team_b, team_a_code:m.team_a_code||"",
      team_b_code:m.team_b_code||"", kickoff:local, stage:m.stage });
    setEditId(m.id); setTab("fixtures");
  }

  async function deleteFixture(id) {
    if (!confirm("Delete this fixture and all its predictions?")) return;
    await supabase.from("matches").delete().eq("id", id);
    load();
  }

  // ---- Results ----
  async function setResult(m, result) {
    await supabase.from("matches").update({ result, is_completed: true }).eq("id", m.id);
    await supabase.rpc("recalculate_scores"); // auto-score, no manual maths
    setNote(`Result saved for ${m.team_a} vs ${m.team_b}.`);
    load();
  }
  async function reopen(m) {
    await supabase.from("matches").update({ result: null, is_completed: false }).eq("id", m.id);
    await supabase.rpc("recalculate_scores");
    load();
  }

  // ---- Bulk import ----
  // Accepts lines: TeamA | TeamB | 2026-06-15 20:00 | Group Stage | AA | BB
  // (date/time in YOUR local time; codes optional)
  async function importBulk() {
    const rows = bulk.split("\n").map(l => l.trim()).filter(Boolean);
    const payload = [];
    for (const line of rows) {
      const [a, b, dt, stage, ca, cb] = line.split("|").map(s => (s || "").trim());
      if (!a || !b || !dt) continue;
      payload.push({
        team_a: a, team_b: b,
        kickoff: new Date(dt.replace(" ", "T")).toISOString(),
        stage: STAGES.includes(stage) ? stage : "Group Stage",
        team_a_code: ca || "", team_b_code: cb || "",
      });
    }
    if (!payload.length) return setNote("Nothing valid to import.");
    const { error } = await supabase.from("matches").insert(payload);
    setNote(error ? "Error: " + error.message : `Imported ${payload.length} fixtures.`);
    setBulk(""); load();
  }

  // ---- Users ----
  async function toggleDisable(u) {
    await supabase.from("profiles").update({ is_disabled: !u.is_disabled }).eq("id", u.id);
    load();
  }

  async function recalcAll() {
    await supabase.rpc("recalculate_scores");
    setNote("Scores recalculated.");
  }

  if (loading || !profile?.is_admin) return <Layout><p className="text-white/50">Checking access…</p></Layout>;

  const Tab = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      className={`pill ${tab === id ? "bg-gold text-ink" : "bg-white/10 text-white/80"}`}>{label}</button>
  );

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold">Admin Panel</h1>
        <div className="flex gap-2">
          <button onClick={fetchResults} disabled={fetching} className="btn-primary text-sm disabled:opacity-50">
            {fetching ? "Fetching…" : "⤓ Fetch results"}
          </button>
          <button onClick={recalcAll} className="btn-ghost text-sm">↻ Recalculate all scores</button>
        </div>
      </div>
      {note && <p className="text-gold text-sm mb-3">{note}</p>}

      <div className="flex gap-2 mb-5 flex-wrap">
        <Tab id="fixtures" label="Fixtures" />
        <Tab id="results" label="Results" />
        <Tab id="import" label="Bulk Import" />
        <Tab id="users" label="Users" />
      </div>

      {tab === "fixtures" && (
        <>
          <form onSubmit={saveFixture} className="card p-4 grid sm:grid-cols-2 gap-3 mb-5">
            <input className="input" placeholder="Team A" value={form.team_a} onChange={set("team_a")} required />
            <input className="input" placeholder="Team B" value={form.team_b} onChange={set("team_b")} required />
            <input className="input" placeholder="Team A code (e.g. BR)" value={form.team_a_code} onChange={set("team_a_code")} />
            <input className="input" placeholder="Team B code (e.g. AR)" value={form.team_b_code} onChange={set("team_b_code")} />
            <input className="input" type="datetime-local" value={form.kickoff} onChange={set("kickoff")} required />
            <select className="input" value={form.stage} onChange={set("stage")}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="sm:col-span-2 flex gap-2">
              <button className="btn-primary">{editId ? "Update fixture" : "Add fixture"}</button>
              {editId && <button type="button" className="btn-ghost" onClick={() => { setForm(empty); setEditId(null); }}>Cancel</button>}
            </div>
          </form>

          <div className="space-y-2">
            {matches.map(m => (
              <div key={m.id} className="card p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{m.team_a} vs {m.team_b}</div>
                  <div className="text-xs text-white/50">{m.stage} · {formatLocal(m.kickoff)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => editFixture(m)} className="btn-ghost text-xs">Edit</button>
                  <button onClick={() => deleteFixture(m.id)} className="btn text-xs bg-red-500/20 text-red-200">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "results" && (
        <div className="space-y-2">
          {matches.map(m => (
            <div key={m.id} className="card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{m.team_a} vs {m.team_b}</div>
                  <div className="text-xs text-white/50">{m.stage} · {formatLocal(m.kickoff)}
                    {m.is_completed && (
                      <span className="text-gold"> · {m.result === "D" ? "Draw" : (m.result === "A" ? m.team_a : m.team_b) + " won"}{m.score_a != null && m.score_b != null ? ` ${m.score_a}–${m.score_b}` : ""}</span>
                    )}</div>
                </div>
                {m.is_completed && <button onClick={() => reopen(m)} className="btn-ghost text-xs">Reopen</button>}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setResult(m, "A")} className={`btn text-xs flex-1 ${m.result==="A"?"bg-gold text-ink":"bg-white/10"}`}>{m.team_a} won</button>
                {m.stage === "Group Stage" &&
                  <button onClick={() => setResult(m, "D")} className={`btn text-xs flex-1 ${m.result==="D"?"bg-gold text-ink":"bg-white/10"}`}>Draw</button>}
                <button onClick={() => setResult(m, "B")} className={`btn text-xs flex-1 ${m.result==="B"?"bg-gold text-ink":"bg-white/10"}`}>{m.team_b} won</button>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs text-white/50">Score</span>
                <div className="w-14">
                  <input type="number" min="0" inputMode="numeric" className="input text-center"
                    placeholder={m.team_a_code || "A"} value={scores[m.id]?.a ?? ""} onChange={setScoreField(m.id, "a")} />
                </div>
                <span className="text-white/40">–</span>
                <div className="w-14">
                  <input type="number" min="0" inputMode="numeric" className="input text-center"
                    placeholder={m.team_b_code || "B"} value={scores[m.id]?.b ?? ""} onChange={setScoreField(m.id, "b")} />
                </div>
                <button onClick={() => saveScore(m)} className="btn-ghost text-xs">Save score</button>
                <span className="text-xs text-white/40">optional · display only</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "import" && (
        <div className="card p-4">
          <p className="text-sm text-white/70 mb-2">
            One match per line, fields separated by <code>|</code>:<br />
            <code>Team A | Team B | 2026-06-15 20:00 | Group Stage | AA | BB</code><br />
            <span className="text-white/50 text-xs">Date/time is in YOUR local time. Stage &amp; codes are optional.</span>
          </p>
          <textarea className="input h-48 font-mono text-sm" value={bulk} onChange={e => setBulk(e.target.value)}
            placeholder={"Mexico | Poland | 2026-06-11 20:00 | Group Stage | MX | PL\nQatar | Ecuador | 2026-06-12 18:00 | Group Stage | QA | EC"} />
          <button onClick={importBulk} className="btn-primary mt-3">Import fixtures</button>
        </div>
      )}

      {tab === "users" && (
        <div className="card overflow-hidden">
          {users.map(u => (
            <div key={u.id} className="grid grid-cols-12 px-4 py-3 items-center border-b border-white/5">
              <div className="col-span-5 font-semibold truncate">{u.display_name}
                {u.is_admin && <span className="pill bg-gold/30 text-gold ml-2">admin</span>}</div>
              <div className="col-span-4 text-white/50 text-sm truncate">@{u.username}</div>
              <div className="col-span-3 text-right">
                {!u.is_admin && (
                  <button onClick={() => toggleDisable(u)}
                    className={`btn text-xs ${u.is_disabled ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200"}`}>
                    {u.is_disabled ? "Enable" : "Disable"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
