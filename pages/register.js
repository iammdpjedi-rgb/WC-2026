import { useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ display_name: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  async function register(e) {
    e.preventDefault();
    setBusy(true); setError(""); setMsg("");
    // Quick check that the username isn't taken (the DB also enforces this).
    const { data: taken } = await supabase
      .from("profiles").select("id").eq("username", form.username).maybeSingle();
    if (taken) { setBusy(false); return setError("That username is already taken."); }
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { display_name: form.display_name, username: form.username } },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setMsg("You're all set — account created! Just head to Log in and sign in with your email and password. No need to check your email or confirm anything.");
  }
  return (
    <Layout>
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-extrabold mb-1 text-center">Create your account</h1>
        <p className="text-center text-white/50 text-xs mb-4">
          Only your <b>display name</b> is ever shown to others. Your email stays private.
        </p>
        <form onSubmit={register} className="space-y-3">
          <input className="input" placeholder="Display name (shown on leaderboard)"
            value={form.display_name} onChange={set("display_name")} required />
          <input className="input" placeholder="Username (private, for login)"
            value={form.username} onChange={set("username")} required />
          <input className="input" type="email" placeholder="Email (private)"
            value={form.email} onChange={set("email")} required />
          <input className="input" type="password" placeholder="Password (min 6 chars)"
            value={form.password} onChange={set("password")} minLength={6} required />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          {msg && <p className="text-green-300 text-sm">{msg}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : "Register"}</button>
        </form>
        <p className="text-center text-white/60 text-sm mt-4">
          Already have an account? <Link href="/login" className="text-gold font-semibold">Log in</Link>
        </p>
      </div>
    </Layout>
  );
}
