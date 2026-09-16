import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[Sportconn] Missing Supabase env. Copy frontend/.env.example to .env and set " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

/**
 * Single browser Supabase client. All SportConn tables live in the `sportconn`
 * Postgres schema, so PostgREST calls are pinned to it here.
 */
export const supabase = createClient(url ?? "http://localhost", anon ?? "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: { schema: "sportconn" },
});
