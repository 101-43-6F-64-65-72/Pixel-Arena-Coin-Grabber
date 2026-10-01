/**
 * Authoritative player movement helper for Pixel Arena: Coin Grabber (Phase 8).
 *
 * Provides server-validated position synchronization:
 *   - updatePlayerPosition: Invokes update_player_position_safe RPC
 *   - Validates movement speed and boundaries server-side
 *   - Reconciles client position upon validation failure
 */

import { supabase } from "@/lib/supabase/client";

/**
 * Sends authoritative position to Supabase PostgreSQL.
 * Server verifies speed delta and bounding box bound to auth.uid().
 *
 * @param {number} x
 * @param {number} y
 * @returns {Promise<{ success: boolean, reason: string, x: number, y: number, message: string }>}
 */
export async function updatePlayerPosition(x, y) {
  try {
    const { data, error } = await supabase.rpc("update_player_position_safe", {
      p_x: Math.round(x * 10) / 10,
      p_y: Math.round(y * 10) / 10,
    });

    if (error) {
      console.warn("[updatePlayerPosition] RPC error:", error);
      return { success: false, reason: "rpc_error", x, y, message: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    return result;
  } catch (err) {
    console.warn("[updatePlayerPosition] catch:", err);
    return { success: false, reason: "exception", x, y, message: err.message };
  }
}
