/**
 * Session management for Pixel Arena: Coin Grabber.
 *
 * Purpose:
 *   Provides a lightweight per-browser-tab identity for the current game
 *   session. Because the MVP has no authentication system, we generate a
 *   UUID for each player on first use and store it alongside their room
 *   context in sessionStorage.
 *
 * Storage: sessionStorage
 *   - Scoped to a single browser tab / window.
 *   - Automatically cleared when the tab is closed.
 *   - Safe for ephemeral game-session data (no sensitive credentials stored).
 *   - Does NOT persist across page refreshes in a different tab.
 *
 * Future: when Supabase Auth is added, replace this with auth.uid().
 */

const SESSION_KEY = 'pixel_arena_session';

/**
 * Returns the current session, or null if none exists.
 * @returns {{ playerId: string, roomId: string, nickname: string } | null}
 */
export function getSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persists the current player/room session to sessionStorage.
 * @param {{ playerId: string, roomId: string, nickname: string }} session
 */
export function saveSession(session) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Clears the session (used when leaving a room).
 */
export function clearSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}
