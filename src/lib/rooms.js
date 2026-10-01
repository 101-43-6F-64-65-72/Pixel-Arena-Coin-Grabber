/**
 * Room operations for Pixel Arena: Coin Grabber.
 *
 * All database interactions relating to rooms and players are centralised
 * here so UI components stay thin and focused.
 *
 * Uses the singleton Supabase client and verified Supabase Auth sessions (Phase 7):
 *   - createRoom → delegates to create_room_safe RPC (atomic, binds host to auth.uid())
 *   - joinRoom   → delegates to join_room_safe RPC (atomic, binds player to auth.uid())
 *   - leaveRoom  → delegates to leave_room_safe RPC (verified caller identity)
 */

import { supabase } from "@/lib/supabase/client";
import { ensureAuthSession } from "@/lib/auth";

// ─── Create Room (atomic via RPC) ─────────────────────────────────────────────

/**
 * Creates a new room and registers the host player bound to the authenticated user.
 *
 * @param {string} nickname
 * @returns {Promise<{ room: object, player: object }>}
 * @throws {Error}
 */
export async function createRoom(nickname) {
  const trimmedNickname = nickname.trim();

  // 1. Ensure active Supabase Auth session exists
  await ensureAuthSession();

  // 2. Invoke create_room_safe RPC
  const { data, error } = await supabase.rpc("create_room_safe", {
    p_nickname: trimmedNickname,
  });

  if (error) {
    console.error("[createRoom] RPC error:", error);
    throw new Error(error.message || "Failed to create room. Please try again.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Failed to create room. Please try again.");
  }

  const room = {
    id: row.room_id,
    code: row.room_code,
    host_id: row.player_id,
    status: "waiting",
  };

  const player = {
    id: row.player_id,
    room_id: row.room_id,
    nickname: row.nickname,
    score: 0,
    user_id: row.user_id,
  };

  return { room, player };
}

// ─── Join Room (atomic via RPC) ──────────────────────────────────────────────

/**
 * Joins an existing waiting room atomically via the join_room_safe RPC.
 * Binds the player row to auth.uid().
 *
 * @param {string} nickname
 * @param {string} rawCode
 * @returns {Promise<{ room: object, player: object }>}
 * @throws {Error} with user-facing message
 */
export async function joinRoom(nickname, rawCode) {
  const trimmedNickname = nickname.trim();
  const code = rawCode.trim().toUpperCase();

  // 1. Ensure active Supabase Auth session exists
  await ensureAuthSession();

  // 2. Invoke join_room_safe RPC
  const { data, error } = await supabase.rpc("join_room_safe", {
    p_code: code,
    p_nickname: trimmedNickname,
  });

  if (error) {
    console.error("[joinRoom] RPC error:", error);
    throw new Error(error.message || "Failed to join room. Please try again.");
  }

  const player = Array.isArray(data) ? data[0] : data;
  if (!player) {
    throw new Error("Failed to join room. Please try again.");
  }

  // Fetch full room context
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", player.room_id)
    .single();

  if (roomErr || !room) {
    console.error("[joinRoom] room fetch after join error:", roomErr);
    throw new Error("Joined room but could not load room details. Please try again.");
  }

  return { room, player };
}

// ─── Fetch Room + Players ────────────────────────────────────────────────────

/**
 * Fetches a room by id along with all its current players.
 * @param {string} roomId
 * @returns {Promise<{ room: object, players: object[] }>}
 */
export async function getRoomWithPlayers(roomId) {
  const [{ data: room, error: roomErr }, { data: players, error: playersErr }] =
    await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase.from("players").select("*").eq("room_id", roomId).order("joined_at"),
    ]);

  if (roomErr || !room) {
    throw new Error("Room not found.");
  }
  if (playersErr) {
    throw new Error("Could not load player list.");
  }

  return { room, players: players ?? [] };
}

// ─── Leave Room (secure via RPC) ────────────────────────────────────────────

/**
 * Removes a player from a room via the leave_room_safe RPC.
 * Verified on server using auth.uid().
 *
 * @param {string} playerId
 * @returns {Promise<void>}
 */
export async function leaveRoom(playerId) {
  const { error } = await supabase.rpc("leave_room_safe", {
    p_player_id: playerId,
  });

  if (error) {
    console.error("[leaveRoom] RPC error:", error);
    throw new Error("Could not leave room. Please try again.");
  }
}
