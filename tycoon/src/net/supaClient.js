// A single shared Supabase client, used by both the realtime net adapter and
// account auth so they share one session. Loaded from a CDN at runtime to keep
// the no-build, static-hosting nature.

import { SUPABASE } from "../config.js";

const CDN = "https://esm.sh/@supabase/supabase-js@2";
let clientPromise = null;

export function hasSupabase() { return !!(SUPABASE.url && SUPABASE.anonKey); }

export function getSupabase() {
  if (!hasSupabase()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ CDN).then(({ createClient }) =>
      createClient(SUPABASE.url, SUPABASE.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 40 } },
      })
    );
  }
  return clientPromise;
}
