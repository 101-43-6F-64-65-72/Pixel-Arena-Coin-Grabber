"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import HomeScreen from "@/components/HomeScreen";
import CreateRoom from "@/components/CreateRoom";
import JoinRoom from "@/components/JoinRoom";
import { createRoom, joinRoom } from "@/lib/rooms";
import { saveSession } from "@/lib/session";
import { ensureAuthSession } from "@/lib/auth";

/**
 * Home page — /
 *
 * Manages which screen is displayed:
 *   "home"   → HomeScreen (Create Room / Join Room buttons)
 *   "create" → CreateRoom form
 *   "join"   → JoinRoom form
 *
 * On success, saves the player session to sessionStorage and navigates
 * to /lobby/[roomId].
 */
export default function Home() {
  const router = useRouter();
  const [screen, setScreen] = useState("home"); // "home" | "create" | "join"
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Eagerly initialize anonymous Auth session on mount
  useEffect(() => {
    ensureAuthSession().catch((err) => {
      console.warn("[Home] Auth initialization warning:", err);
    });
  }, []);

  function resetError() {
    setError("");
  }

  // ── Create Room ─────────────────────────────────────────────────────────────
  async function handleCreateRoom(nickname) {
    setIsLoading(true);
    setError("");

    // Validate nickname here as well (belt-and-suspenders)
    if (!nickname || nickname.trim().length === 0) {
      setError("Nickname is required.");
      setIsLoading(false);
      return;
    }
    if (nickname.trim().length > 30) {
      setError("Nickname must be 30 characters or fewer.");
      setIsLoading(false);
      return;
    }

    try {
      const { room, player } = await createRoom(nickname.trim());

      saveSession({
        playerId: player.id,
        roomId: room.id,
        nickname: player.nickname,
      });

      router.push(`/lobby/${room.id}`);
    } catch (err) {
      console.error("[Home] createRoom error:", err);
      setError(err.message || "Failed to create room. Please try again.");
      setIsLoading(false);
    }
  }

  // ── Join Room ───────────────────────────────────────────────────────────────
  async function handleJoinRoom(nickname, code) {
    setIsLoading(true);
    setError("");

    if (!nickname || nickname.trim().length === 0) {
      setError("Nickname is required.");
      setIsLoading(false);
      return;
    }
    if (nickname.trim().length > 30) {
      setError("Nickname must be 30 characters or fewer.");
      setIsLoading(false);
      return;
    }
    if (!code || code.trim().length === 0) {
      setError("Room code is required.");
      setIsLoading(false);
      return;
    }

    try {
      const { room, player } = await joinRoom(nickname.trim(), code.trim());

      saveSession({
        playerId: player.id,
        roomId: room.id,
        nickname: player.nickname,
      });

      router.push(`/lobby/${room.id}`);
    } catch (err) {
      console.error("[Home] joinRoom error:", err);
      setError(err.message || "Failed to join room. Please try again.");
      setIsLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (screen === "create") {
    return (
      <CreateRoom
        onSubmit={handleCreateRoom}
        onBack={() => { resetError(); setScreen("home"); }}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  if (screen === "join") {
    return (
      <JoinRoom
        onSubmit={handleJoinRoom}
        onBack={() => { resetError(); setScreen("home"); }}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  return (
    <HomeScreen
      onCreateRoom={() => { resetError(); setScreen("create"); }}
      onJoinRoom={() => { resetError(); setScreen("join"); }}
    />
  );
}
