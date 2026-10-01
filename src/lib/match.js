/**
 * Match Lifecycle helpers for Pixel Arena: Coin Grabber (Phase 6).
 *
 * Provides central constants and RPC wrappers for match lifecycle:
 *   - startMatch: Authoritative host start via start_match_safe RPC
 *   - finishMatch: Authoritative match completion via finish_match_safe RPC
 *   - getMatchTimeState: Deterministic calculation of current match phase
 *     and remaining seconds derived from authoritative DB timestamps.
 */

import { supabase } from "@/lib/supabase/client";

// Central match timing constants
export const COUNTDOWN_SECONDS = 3;
export const MATCH_DURATION_SECONDS = 60;
export const TOTAL_MATCH_SECONDS = COUNTDOWN_SECONDS + MATCH_DURATION_SECONDS; // 63s

/**
 * Starts a match authoritatively via start_match_safe RPC.
 * Only the room host can invoke this successfully.
 *
 * @param {string} roomId
 * @param {string} playerId
 * @returns {Promise<{ success: boolean, room_id: string, started_at: string, message: string }>}
 */
export async function startMatch(roomId, playerId) {
  const { data, error } = await supabase.rpc("start_match_safe", {
    p_room_id: roomId,
    p_player_id: playerId,
  });

  if (error) {
    console.error("[startMatch] RPC error:", error);
    throw new Error(error.message || "Failed to start match.");
  }

  const result = Array.isArray(data) ? data[0] : data;
  return result;
}

/**
 * Finishes a match authoritatively via finish_match_safe RPC.
 * Server verifies that the match duration has actually elapsed.
 *
 * @param {string} roomId
 * @returns {Promise<{ success: boolean, room_id: string, status: string, message: string }>}
 */
export async function finishMatch(roomId) {
  const { data, error } = await supabase.rpc("finish_match_safe", {
    p_room_id: roomId,
  });

  if (error) {
    console.error("[finishMatch] RPC error:", error);
    throw new Error(error.message || "Failed to finish match.");
  }

  const result = Array.isArray(data) ? data[0] : data;
  return result;
}

/**
 * Derives current match lifecycle phase and remaining timers from room state.
 * Fully deterministic: works identically upon reconnection or browser reload.
 *
 * @param {object} room
 * @returns {{
 *   phase: 'waiting' | 'countdown' | 'playing' | 'finished',
 *   countdownSeconds: number,
 *   matchSecondsRemaining: number,
 *   isCollectiblesActive: boolean
 * }}
 */
export function getMatchTimeState(room) {
  if (!room || room.status === "waiting") {
    return {
      phase: "waiting",
      countdownSeconds: COUNTDOWN_SECONDS,
      matchSecondsRemaining: MATCH_DURATION_SECONDS,
      isCollectiblesActive: false,
    };
  }

  if (room.status === "finished") {
    return {
      phase: "finished",
      countdownSeconds: 0,
      matchSecondsRemaining: 0,
      isCollectiblesActive: false,
    };
  }

  // Room status is 'playing' (started_at determines countdown vs active match)
  if (!room.started_at) {
    return {
      phase: "waiting",
      countdownSeconds: COUNTDOWN_SECONDS,
      matchSecondsRemaining: MATCH_DURATION_SECONDS,
      isCollectiblesActive: false,
    };
  }

  const startedAtMs = new Date(room.started_at).getTime();
  const nowMs = Date.now();
  const elapsedSeconds = Math.max(0, (nowMs - startedAtMs) / 1000);

  if (elapsedSeconds < COUNTDOWN_SECONDS) {
    const countdown = Math.ceil(COUNTDOWN_SECONDS - elapsedSeconds);
    return {
      phase: "countdown",
      countdownSeconds: Math.max(1, countdown),
      matchSecondsRemaining: MATCH_DURATION_SECONDS,
      isCollectiblesActive: false,
    };
  }

  const matchElapsed = elapsedSeconds - COUNTDOWN_SECONDS;
  const remaining = Math.max(0, Math.ceil(MATCH_DURATION_SECONDS - matchElapsed));

  if (remaining <= 0) {
    return {
      phase: "playing",
      countdownSeconds: 0,
      matchSecondsRemaining: 0,
      isCollectiblesActive: false,
      shouldFinish: true,
    };
  }

  return {
    phase: "playing",
    countdownSeconds: 0,
    matchSecondsRemaining: remaining,
    isCollectiblesActive: true,
  };
}
