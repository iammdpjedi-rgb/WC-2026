import { useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/dashboard");
  }
  async function google() {
    // Works once you enable Google in Supabase → Authentication → Providers.
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin + "/dashboard" : undefined },
    });
  }
  return (
    <Layout>
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-extrabold mb-4 text-center">Log in</h1>
        <p className="text-center text-sm text-white/70 bg-white/5 rounded-lg p-3 mb-4">
          No email confirmation needed — just log in with your email and password. Any confirmation email can be ignored.
        </p>
        <form onSubmit={login} className="space-y-3">
          <input className="input" type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : "Log in"}</button>
        </form>
        <button onClick={google} className="btn-ghost w-full mt-3">Continue with Google</button>
        <p className="text-center text-white/60 text-sm mt-4">
          No account? <Link href="/register" className="text-gold font-semibold">Register</Link>
        </p>
      </div>
    </Layout>
  );
}
