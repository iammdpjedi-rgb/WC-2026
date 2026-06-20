import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../pages/_app";
import { supabase } from "../lib/supabaseClient";
import Background3D from "./Background3D";

export default function Layout({ children }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }
  const NavLink = ({ href, label }) => (
    <Link href={href}
      className={`px-3 py-2 rounded-lg text-sm font-medium ${
        router.pathname === href ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
      }`}>
      {label}
    </Link>
  );
  return (
    <>
      <Background3D />
      <div className="relative z-10 min-h-screen flex flex-col bg-gradient-to-b from-pitch2/40 to-transparent">
        <header className="sticky top-0 z-20 backdrop-blur bg-ink/70 border-b border-white/10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-1 flex-wrap">
            <Link href="/" className="flex items-center gap-2 mr-auto">
              <span className="text-2xl">⚽</span>
              <span className="font-extrabold tracking-tight leading-tight">
                World Cup<br className="sm:hidden" /> Prediction League
              </span>
            </Link>
            <NavLink href="/matches" label="Matches" />
            <NavLink href="/" label="Leaderboard" />
            <NavLink href="/hall-of-fame" label="Hall of Fame" />
            {user && <NavLink href="/dashboard" label="My Dashboard" />}
            {profile?.is_admin && <NavLink href="/admin" label="Admin" />}
            {user ? (
              <button onClick={logout} className="btn-ghost text-sm ml-1">Log out</button>
            ) : (
              <Link href="/login" className="btn-primary text-sm ml-1">Log in</Link>
            )}
          </div>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-white/10 py-6 text-center text-white/60 text-sm">
          Created and Managed by Dp Poojian
        </footer>
      </div>
    </>
  );
}
