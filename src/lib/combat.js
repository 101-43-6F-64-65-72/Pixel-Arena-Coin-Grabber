import { supabase } from "@/lib/supabase/client";

/**
 * Authoritative PvP Combat & Skill Client Functions
 */

/**
 * Perform a basic melee attack on another player in the same room.
 * @param {string} targetPlayerId - UUID of the target player
 */
export async function attackPlayer(targetPlayerId) {
  if (!targetPlayerId) return { success: false, reason: "missing_target" };

  try {
    const { data, error } = await supabase.rpc("attack_player_safe", {
      p_target_id: targetPlayerId,
    });

    if (error) {
      console.error("[Combat] attack_player_safe error:", error);
      return { success: false, reason: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row || { success: false };
  } catch (err) {
    console.error("[Combat] attackPlayer exception:", err);
    return { success: false, reason: err.message };
  }
}

/**
 * Perform Dash Skill (Skill 1).
 * @param {number} dx - X direction (-1 to 1)
 * @param {number} dy - Y direction (-1 to 1)
 */
export async function useDash(dx, dy) {
  try {
    const { data, error } = await supabase.rpc("use_dash_safe", {
      p_dx: dx,
      p_dy: dy,
    });

    if (error) {
      console.error("[Combat] use_dash_safe error:", error);
      return { success: false, reason: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row || { success: false };
  } catch (err) {
    console.error("[Combat] useDash exception:", err);
    return { success: false, reason: err.message };
  }
}

/**
 * Perform Shield Skill (Skill 2).
 */
export async function useShield() {
  try {
    const { data, error } = await supabase.rpc("use_shield_safe");

    if (error) {
      console.error("[Combat] use_shield_safe error:", error);
      return { success: false, reason: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row || { success: false };
  } catch (err) {
    console.error("[Combat] useShield exception:", err);
    return { success: false, reason: err.message };
  }
}

/**
 * Perform Shockwave Skill (Skill 3).
 */
export async function useShockwave() {
  try {
    const { data, error } = await supabase.rpc("use_shockwave_safe");

    if (error) {
      console.error("[Combat] use_shockwave_safe error:", error);
      return { success: false, reason: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row || { success: false };
  } catch (err) {
    console.error("[Combat] useShockwave exception:", err);
    return { success: false, reason: err.message };
  }
}

/**
 * Respawn player after death countdown.
 */
export async function respawnPlayer() {
  try {
    const { data, error } = await supabase.rpc("respawn_player_safe");

    if (error) {
      console.error("[Combat] respawn_player_safe error:", error);
      return { success: false, reason: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row || { success: false };
  } catch (err) {
    console.error("[Combat] respawnPlayer exception:", err);
    return { success: false, reason: err.message };
  }
}
