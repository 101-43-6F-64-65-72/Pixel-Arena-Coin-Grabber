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
export const MATCH_DURATION_SECONDS = 300; // 5 minutes match
export const TOTAL_MATCH_SECONDS = COUNTDOWN_SECONDS + MATCH_DURATION_SECONDS; // 303s

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
 * Server verifies that the match duration (303s) has actually elapsed.
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
 * Attempts authoritative player-vs-player elimination (eating smaller player).
 * Server validates distance, score superiority, and bounds to auth.uid().
 *
 * @param {string} victimPlayerId
 * @returns {Promise<{ success: boolean, predator_id: string, victim_id: string, predator_score: number, victim_score: number, stolen_pts: number, message: string }>}
 */
export async function eliminatePlayer(victimPlayerId) {
  try {
    const { data, error } = await supabase.rpc("eliminate_player_safe", {
      p_victim_id: victimPlayerId,
    });

    if (error) {
      console.warn("[eliminatePlayer] RPC error:", error);
      return { success: false, message: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    return result;
  } catch (err) {
    console.warn("[eliminatePlayer] catch:", err);
    return { success: false, message: err.message };
  }
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
