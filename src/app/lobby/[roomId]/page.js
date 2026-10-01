"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getRoomWithPlayers, leaveRoom } from "@/lib/rooms";
import { getRoomCoins, ensureRoomCoins } from "@/lib/coins";
import { startMatch, finishMatch, getMatchTimeState } from "@/lib/match";
import { getSession, clearSession } from "@/lib/session";
import { ensureAuthSession } from "@/lib/auth";
import Lobby from "@/components/Lobby";

/**
 * Lobby Page — /lobby/[roomId] (Phase 9: Match UX + Polish + Reconciliation)
 *
 * Realtime synchronization strategy:
 *   - Realtime Postgres Changes on `players`, `rooms`, and `coins`
 *   - Live match lifecycle derived deterministically from `room.status` and `room.started_at`
 *   - Final authoritative score reconciliation upon match finish
 *   - Seamless reconnection and session verification
 */
export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId;

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [coins, setCoins] = useState([]);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [pageStatus, setPageStatus] = useState("loading"); // "loading" | "ready" | "error"
  const [errorMessage, setErrorMessage] = useState("");
  const [isLeaving, setIsLeaving] = useState(false);
  const [isStartingMatch, setIsStartingMatch] = useState(false);

  // Derived match time state
  const [matchState, setMatchState] = useState(() => getMatchTimeState(null));

  // Ref so Realtime callbacks can read the latest roomId and room without stale closures
  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);

  // ── Validate session & ensure Auth ───────────────────────────────────────────
  useEffect(() => {
    async function initSession() {
      const session = getSession();

      if (!session || session.roomId !== roomId) {
        router.replace("/");
        return;
      }

      try {
        await ensureAuthSession();
      } catch (authErr) {
        console.warn("[LobbyPage] Auth session warning:", authErr);
      }

      setCurrentPlayerId(session.playerId);
    }

    initSession();
  }, [roomId, router]);

  // ── Initial data load & authoritative sync ───────────────────────────────────
  const loadRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const { room: r, players: ps } = await getRoomWithPlayers(roomId);
      setRoom(r);
      setPlayers(ps);

      try {
        const initialCoins = await ensureRoomCoins(roomId, 60);
        setCoins(initialCoins.filter((c) => c.active));
      } catch (coinErr) {
        console.warn("[LobbyPage] ensureRoomCoins warning:", coinErr);
        const fallbackCoins = await getRoomCoins(roomId);
        setCoins(fallbackCoins);
      }

      setPageStatus("ready");
    } catch (err) {
      console.error("[LobbyPage] loadRoom error:", err);
      setErrorMessage(err.message || "Failed to load lobby.");
      setPageStatus("error");
    }
  }, [roomId]);

  useEffect(() => {
    if (currentPlayerId) {
      loadRoom();
    }
  }, [currentPlayerId, loadRoom]);

  // ── Live Match Timer Clock & Collectible Maintenance ────────────────────────
  // Derives match lifecycle state every 200ms based on authoritative DB timestamps
  useEffect(() => {
    if (!room) return;

    function updateClock() {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;

      const state = getMatchTimeState(currentRoom);
      setMatchState(state);

      // If match duration has elapsed, trigger authoritative server-side finish
      if (state.shouldFinish && currentRoom.status === "playing") {
        finishMatch(currentRoom.id)
          .then(() => {
            // Reconcile final scores authoritatively
            getRoomWithPlayers(currentRoom.id).then(({ room: freshRoom, players: freshPlayers }) => {
              setRoom(freshRoom);
              setPlayers(freshPlayers);
            }).catch(() => {});
          })
          .catch((err) => {
            console.log("[LobbyPage] finishMatch call:", err?.message);
          });
      }
    }

    updateClock();
    const timer = setInterval(updateClock, 200);

    // Periodic maintenance for Heal Orb spawns & coin density (every 10 seconds during match)
    const maintenanceTimer = setInterval(() => {
      const currentRoom = roomRef.current;
      if (currentRoom && currentRoom.status === "playing") {
        ensureRoomCoins(currentRoom.id, 60).then((activeSet) => {
          if (Array.isArray(activeSet)) {
            setCoins(activeSet.filter((c) => c.active));
          }
        }).catch(() => {});
      }
    }, 10000);

    return () => {
      clearInterval(timer);
      clearInterval(maintenanceTimer);
    };
  }, [room]);

  // ── Supabase Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !currentPlayerId) return;

    function applyPlayerInsert(newPlayer) {
      setPlayers((prev) => {
        if (prev.some((p) => p.id === newPlayer.id)) return prev;
        return [...prev, newPlayer].sort(
          (a, b) => new Date(a.joined_at) - new Date(b.joined_at)
        );
      });
    }

    function applyPlayerDelete(deletedId) {
      setPlayers((prev) => prev.filter((p) => p.id !== deletedId));
    }

    function applyPlayerUpdate(updated) {
      setPlayers((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
    }

    function applyRoomUpdate(updatedRoom) {
      setRoom((prev) => (prev ? { ...prev, ...updatedRoom } : prev));
      // If room transitioned to finished, re-fetch players for final authoritative scores
      if (updatedRoom?.status === "finished") {
        getRoomWithPlayers(roomIdRef.current).then(({ players: finalPlayers }) => {
          setPlayers(finalPlayers);
        }).catch(() => {});
      }
    }

    function applyCoinInsert(newCoin) {
      if (!newCoin.active) return;
      setCoins((prev) => {
        if (prev.some((c) => c.id === newCoin.id)) return prev;
        return [...prev, newCoin];
      });
    }

    function applyCoinUpdate(updatedCoin) {
      setCoins((prev) => {
        if (!updatedCoin.active) {
          return prev.filter((c) => c.id !== updatedCoin.id);
        }
        const exists = prev.some((c) => c.id === updatedCoin.id);
        if (!exists) return [...prev, updatedCoin];
        return prev.map((c) => (c.id === updatedCoin.id ? { ...c, ...updatedCoin } : c));
      });
    }

    function applyCoinDelete(deletedId) {
      setCoins((prev) => prev.filter((c) => c.id !== deletedId));
    }

    const channel = supabase
      .channel(`lobby:${roomId}`)
      // players
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => applyPlayerInsert(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => applyPlayerDelete(payload.old.id)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => applyPlayerUpdate(payload.new)
      )
      // rooms
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => applyRoomUpdate(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (_payload) => {
          clearSession();
          router.replace("/");
        }
      )
      // coins
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coins", filter: `room_id=eq.${roomId}` },
        (payload) => applyCoinInsert(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "coins", filter: `room_id=eq.${roomId}` },
        (payload) => applyCoinUpdate(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "coins", filter: `room_id=eq.${roomId}` },
        (payload) => applyCoinDelete(payload.old.id)
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          Promise.all([
            getRoomWithPlayers(roomIdRef.current),
            getRoomCoins(roomIdRef.current),
          ])
            .then(([{ room: r, players: ps }, cList]) => {
              setRoom(r);
              setPlayers(ps);
              setCoins(cList);
            })
            .catch((err) => {
              console.error("[LobbyPage] reconciliation error:", err);
            });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentPlayerId, router]);

  // ── Host Start Match Trigger ────────────────────────────────────────────────
  async function handleStartMatch() {
    if (!roomId || !currentPlayerId || isStartingMatch) return;
    setIsStartingMatch(true);

    try {
      const res = await startMatch(roomId, currentPlayerId);
      if (res && res.success) {
        setRoom((prev) => (prev ? { ...prev, status: "playing", started_at: res.started_at } : prev));
      }
    } catch (err) {
      console.error("[LobbyPage] handleStartMatch error:", err);
      alert(err.message || "Could not start match.");
    } finally {
      setIsStartingMatch(false);
    }
  }

  // ── Leave Room ──────────────────────────────────────────────────────────────
  async function handleLeave() {
    if (!currentPlayerId || !roomId || isLeaving) return;
    setIsLeaving(true);

    try {
      await leaveRoom(currentPlayerId);
    } catch (err) {
      console.error("[LobbyPage] leaveRoom error:", err);
    }

    clearSession();
    router.replace("/");
  }

  // ── Render states ───────────────────────────────────────────────────────────
  if (pageStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500 font-mono text-sm animate-pulse">
          Loading lobby…
        </p>
      </div>
    );
  }

  if (pageStatus === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-4 gap-4">
        <p className="text-red-400 font-mono text-sm text-center">{errorMessage}</p>
        <button
          onClick={() => {
            clearSession();
            router.replace("/");
          }}
          className="text-zinc-400 hover:text-white text-sm font-mono transition-colors underline"
        >
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <Lobby
      room={room}
      players={players}
      coins={coins}
      currentPlayerId={currentPlayerId}
      onLeave={handleLeave}
      isLeaving={isLeaving}
      onStartMatch={handleStartMatch}
      isStartingMatch={isStartingMatch}
      matchState={matchState}
    />
  );
}
