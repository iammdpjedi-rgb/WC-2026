import { createClient } from "@supabase/supabase-js";

// These come from your .env.local (locally) and Vercel env vars (in production).
// Fallbacks keep the build from crashing before you've set them — the app
// simply won't connect until real values are provided.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
