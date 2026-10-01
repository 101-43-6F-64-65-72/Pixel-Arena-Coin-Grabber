/**
 * Coin operations for Pixel Arena: Coin Grabber (Phase 5 & 7).
 *
 * Provides functions for:
 *   - Fetching active coins for a room
 *   - Ensuring/spawning room coins via ensure_room_coins RPC
 *   - Collecting coins authoritatively via collect_coin_safe RPC (verified via auth.uid())
 */

import { supabase } from "@/lib/supabase/client";

/**
 * Fetches all currently active coins for a given room.
 * @param {string} roomId
 * @returns {Promise<Array<{ id: string, room_id: string, x: number, y: number, active: boolean }>>}
 */
export async function getRoomCoins(roomId) {
  const { data, error } = await supabase
    .from("coins")
    .select("*")
    .eq("room_id", roomId)
    .eq("active", true);

  if (error) {
    console.error("[getRoomCoins] error:", error);
    throw new Error("Failed to load coins.");
  }
  return data || [];
}

/**
 * Ensures coins exist for a room via ensure_room_coins RPC.
 * @param {string} roomId
 * @param {number} [count=10]
 * @returns {Promise<Array<{ id: string, room_id: string, x: number, y: number, active: boolean }>>}
 */
export async function ensureRoomCoins(roomId, count = 10) {
  const { data, error } = await supabase.rpc("ensure_room_coins", {
    p_room_id: roomId,
    p_count: count,
  });

  if (error) {
    console.error("[ensureRoomCoins] error:", error);
    throw new Error(error.message || "Failed to initialize coins.");
  }
  return data || [];
}

/**
 * Attempts authoritative coin collection via collect_coin_safe RPC.
 * Player identity is derived authoritatively on the database from auth.uid().
 *
 * @param {string} coinId
 * @param {string} [playerId] - Optional fallback
 * @returns {Promise<{ success: boolean, coin_id: string, player_id: string, room_id: string, new_score: number, message: string }>}
 */
export async function collectCoin(coinId, playerId = null) {
  const { data, error } = await supabase.rpc("collect_coin_safe", {
    p_coin_id: coinId,
    p_player_id: playerId,
  });

  if (error) {
    console.error("[collectCoin] RPC error:", error);
    throw new Error(error.message || "Failed to collect coin.");
  }

  const result = Array.isArray(data) ? data[0] : data;
  return result;
}
