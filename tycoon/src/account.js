// Optional accounts via Supabase Auth, so a Joey survives a cookie wipe or
// moves between devices. Username/password maps onto Supabase email auth using
// a synthetic email, so no real email is needed. Login is optional: the game
// works as a local guest without it.
//
// Setup note: in the Supabase dashboard, turn OFF "Confirm email"
// (Authentication -> Providers -> Email), otherwise sign-up needs a link that
// this synthetic address can't receive. See tycoon/README.md.

import { getSupabase, hasSupabase } from "./net/supaClient.js";

export { hasSupabase };

const DOMAIN = "joetime.app";
function emailFor(username) {
  const clean = String(username).toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return clean + "@" + DOMAIN;
}
function accFromUser(u) {
  return u ? { userId: u.id, username: (u.user_metadata && u.user_metadata.username) || u.email } : null;
}

export async function currentUser() {
  if (!hasSupabase()) return null;
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return accFromUser(data && data.session && data.session.user);
}

export async function signUp(username, password) {
  if (!username || username.length < 2) throw new Error("Pick a username (2+ characters).");
  if (!password || password.length < 6) throw new Error("Password must be 6+ characters.");
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signUp({ email: emailFor(username), password, options: { data: { username } } });
  if (error) throw error;
  if (!data.session) {
    // email confirmation is still on; try an immediate sign-in in case it's off
    return signIn(username, password);
  }
  return accFromUser(data.user);
}

export async function signIn(username, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: emailFor(username), password });
  if (error) throw error;
  return accFromUser(data.user);
}

export async function signOut() {
  const sb = await getSupabase();
  if (sb) await sb.auth.signOut();
}

// Surface profile save/load failures (usually a missing `profiles` table or an
// RLS policy) to the UI so they're diagnosable instead of silently swallowed.
let errCb = null;
export function onProfileError(fn) { errCb = fn; }
function reportErr(kind, msg) { console.warn("[joetime] profile " + kind + ":", msg); if (errCb) try { errCb(kind, msg); } catch {} }

export async function loadProfile(userId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from("profiles").select("data").eq("id", userId).maybeSingle();
  if (error) { reportErr("load", error.message || String(error)); return null; }
  return data ? data.data : null;
}

let saveTimer = null, pending = null, pendingUser = null;
export function saveProfile(userId, meData) {
  pending = meData; pendingUser = userId;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    const data = pending, id = pendingUser; pending = null; saveTimer = null;
    try {
      const sb = await getSupabase();
      const { error } = await sb.from("profiles").upsert({ id, data, updated_at: new Date().toISOString() });
      if (error) reportErr("save", error.message || String(error));
    } catch (e) { reportErr("save", (e && e.message) || String(e)); }
  }, 2500);
}
