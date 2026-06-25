import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../pages/_app";
import { supabase } from "../lib/supabaseClient";
import Background3D from "./Background3D";

// --- Bottom-bar icons (inline SVG, inherit colour from the tab) ---
const IconBall = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <circle cx="12" cy="12" r="9" />
    <polygon points="12 8 15.2 10.3 14 14 10 14 8.8 10.3" />
    <path d="M12 8V4.6M15.2 10.3l3.1-1.5M14 14l2.3 2.6M10 14l-2.3 2.6M8.8 10.3 5.7 8.8" />
  </svg>
);
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <line x1="5" y1="21" x2="5" y2="15" />
    <line x1="12" y1="21" x2="12" y2="10" />
    <line x1="19" y1="21" x2="19" y2="5" />
  </svg>
);
const IconTrophy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M8 4h8v4a4 4 0 0 1-8 0V4z" />
    <path d="M8 6H5a2.5 2.5 0 0 0 3 2.4" />
    <path d="M16 6h3a2.5 2.5 0 0 1-3 2.4" />
    <line x1="12" y1="12" x2="12" y2="16" />
    <path d="M9 20a3 3 0 0 1 6 0z" />
  </svg>
);
const IconGrid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);
const IconGear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M22 12h-3M5 12H2M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12M19.07 19.07l-2.12-2.12M7.05 7.05 4.93 4.93" />
  </svg>
);

export default function Layout({ children }) {
  const { user, profile } = useAuth();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  // A single bottom tab: icon + label, gold when it's the current page.
  const TabLink = ({ href, label, icon }) => {
    const on = router.pathname === href;
    return (
      <Link href={href}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-2 ${on ? "text-gold" : "text-white/55"}`}>
        <span className={`h-0.5 w-6 rounded-full ${on ? "bg-gold" : "bg-transparent"}`} />
        {icon}
        <span className="text-xs font-medium leading-none">{label}</span>
      </Link>
    );
  };

  return (
    <>
      <Background3D />
      <div
        className="relative z-10 min-h-screen flex flex-col bg-gradient-to-b from-pitch2/40 to-transparent"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
      >
        {/* Slim top bar: logo + Log out only */}
        <header className="sticky top-0 z-20 backdrop-blur bg-ink/70 border-b border-white/10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 mr-auto">
              <span className="text-2xl">⚽</span>
              <span className="font-extrabold tracking-tight leading-tight">
                World Cup<br className="sm:hidden" /> Prediction League
              </span>
            </Link>
            {user ? (
              <button onClick={logout} className="btn-ghost text-sm">Log out</button>
            ) : (
              <Link href="/login" className="btn-primary text-sm">Log in</Link>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>

        <footer className="border-t border-white/10 py-6 text-center text-white/60 text-sm">
          Created and Managed by Dp Poojian
        </footer>

        {/* App-style bottom navigation */}
        <nav
          className="fixed bottom-0 inset-x-0 z-30 bg-ink/90 backdrop-blur border-t border-white/10"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="max-w-5xl mx-auto px-1 flex items-stretch">
            <TabLink href="/matches" label="Matches" icon={<IconBall />} />
            <TabLink href="/" label="Leaders" icon={<IconChart />} />
            <TabLink href="/hall-of-fame" label="Fame" icon={<IconTrophy />} />
            {user && <TabLink href="/dashboard" label="Dashboard" icon={<IconGrid />} />}
            {profile?.is_admin && <TabLink href="/admin" label="Admin" icon={<IconGear />} />}
          </div>
        </nav>
      </div>
    </>
  );
}
