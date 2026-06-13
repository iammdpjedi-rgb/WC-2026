import "../styles/globals.css";
import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "../lib/supabaseClient";

// Makes the logged-in user + their profile available everywhere.
const AuthContext = createContext({ user: null, profile: null, loading: true, refresh: () => {} });
export const useAuth = () => useContext(AuthContext);

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid) {
    if (!uid) { setProfile(null); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile(data || null);
  }

  async function refresh() {
    const { data } = await supabase.auth.getUser();
    setUser(data?.user ?? null);
    await loadProfile(data?.user?.id);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data?.session?.user ?? null);
      await loadProfile(data?.session?.user?.id);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setUser(session?.user ?? null);
      await loadProfile(session?.user?.id);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refresh }}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  );
}
