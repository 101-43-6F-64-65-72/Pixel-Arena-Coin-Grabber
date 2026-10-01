/**
 * Supabase Auth helper for Pixel Arena: Coin Grabber (Phase 7).
 *
 * Implements anonymous authentication:
 *   - Checks for an existing session in localStorage
 *   - If missing, invokes supabase.auth.signInAnonymously()
 *   - Ensures every player has a verified auth.uid() before room actions
 */

import { supabase } from "@/lib/supabase/client";

/**
 * Ensures an active Supabase Auth session exists.
 * Reuses existing session or creates a new anonymous session.
 *
 * @returns {Promise<{ user: object, session: object }>}
 */
export async function ensureAuthSession() {
  try {
    // 1. Check for existing active session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return { user: session.user, session };
    }

    // 2. Try signing in anonymously first
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (!error && data?.user) {
        return { user: data.user, session: data.session };
      }
      if (error && !error.message?.includes("Anonymous sign-ins are disabled")) {
        throw error;
      }
    } catch (anonErr) {
      console.warn("[ensureAuthSession] Anonymous sign-in unavailable, attempting guest fallback:", anonErr?.message);
    }

    // 3. Fallback: Automatic guest account creation using email provider
    const GUEST_CRED_KEY = "pixel_arena_guest_auth";
    let creds = null;
    try {
      const saved = localStorage.getItem(GUEST_CRED_KEY);
      if (saved) creds = JSON.parse(saved);
    } catch (_) {}

    if (creds?.email && creds?.password) {
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (!loginErr && loginData?.user) {
        return { user: loginData.user, session: loginData.session };
      }
    }

    // Generate fresh guest credentials
    const randomSuffix = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const guestEmail = `guest_${randomSuffix}@pixelarena.local`;
    const guestPassword = `Pixel_Guest_${randomSuffix}!99`;

    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email: guestEmail,
      password: guestPassword,
    });

    if (signupErr) {
      console.error("[ensureAuthSession] Guest fallback signup error:", signupErr);
      throw new Error(signupErr.message || "Failed to initialize player session.");
    }

    try {
      localStorage.setItem(GUEST_CRED_KEY, JSON.stringify({ email: guestEmail, password: guestPassword }));
    } catch (_) {}

    return { user: signupData.user, session: signupData.session };
  } catch (err) {
    console.error("[ensureAuthSession] error:", err);
    throw err;
  }
}

/**
 * Returns the current authenticated user ID or null.
 * @returns {Promise<string|null>}
 */
export async function getAuthUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}
