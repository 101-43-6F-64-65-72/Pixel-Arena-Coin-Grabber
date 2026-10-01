"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { drawPlayer } from "@/game/drawPlayer";
import { drawCoin } from "@/game/drawCoin";
import { collectCoin } from "@/lib/coins";
import { updatePlayerPosition } from "@/lib/movement";

// ─── Constants ───────────────────────────────────────────────────────────────

const LOGICAL_WIDTH = 700;    // logical arena width in pixels
const LOGICAL_HEIGHT = 440;   // logical arena height in pixels
const ARENA_PADDING = 20;     // gap between canvas edge and playable boundary
const PLAYER_SIZE = 32;       // diameter in logical arena pixels
const PLAYER_SPEED = 200;     // logical pixels per second
const COIN_RADIUS = 8;        // logical pixels
const COLLECTION_RADIUS = PLAYER_SIZE / 2 + COIN_RADIUS; // 24 logical pixels

const BROADCAST_THROTTLE_MS = 50;  // ~20 Hz low-latency peer visual broadcast
const DB_AUTH_SYNC_MS = 300;       // ~3.3 Hz authoritative database position sync

// Color palette for remote players
const REMOTE_PLAYER_COLORS = [
  { body: "#3b82f6", stroke: "#1d4ed8" }, // Blue
  { body: "#10b981", stroke: "#047857" }, // Emerald
  { body: "#a855f7", stroke: "#7e22ce" }, // Purple
  { body: "#ec4899", stroke: "#be185d" }, // Pink
  { body: "#eab308", stroke: "#ca8a04" }, // Yellow
];

/**
 * GameCanvas renders an interactive HTML5 Canvas with fixed 700x440 logical dimensions:
 *   1. Full-frame clean render loop
 *   2. Responsive aspect-ratio preserving container
 *   3. Collectible coins across 700x440 arena
 *   4. Authoritative local player and interpolated remote players
 *   5. Strict phase input locking
 */
export default function GameCanvas({
  roomId,
  currentPlayerId,
  players = [],
  coins = [],
  matchPhase = "waiting", // "waiting" | "countdown" | "playing" | "finished"
  countdownSeconds = 3,
  isCollectiblesActive = false,
}) {
  const canvasRef = useRef(null);

  // Keep latest props in refs to avoid stale closures
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const coinsRef = useRef(coins);
  useEffect(() => { coinsRef.current = coins; }, [coins]);

  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const currentPlayerIdRef = useRef(currentPlayerId);
  useEffect(() => { currentPlayerIdRef.current = currentPlayerId; }, [currentPlayerId]);

  const matchPhaseRef = useRef(matchPhase);
  useEffect(() => { matchPhaseRef.current = matchPhase; }, [matchPhase]);

  const countdownSecondsRef = useRef(countdownSeconds);
  useEffect(() => { countdownSecondsRef.current = countdownSeconds; }, [countdownSeconds]);

  const isCollectiblesActiveRef = useRef(isCollectiblesActive);
  useEffect(() => { isCollectiblesActiveRef.current = isCollectiblesActive; }, [isCollectiblesActive]);

  // Remote player state: { [playerId]: { x, y, targetX, targetY, lastUpdated } }
  const remotePlayersRef = useRef({});

  // In-flight coin collection requests to prevent frame-spamming
  const pendingCoinsRef = useRef(new Set());

  // Realtime Broadcast channel ref
  const channelRef = useRef(null);

  // Throttling state for position broadcasts
  const lastBroadcastTimeRef = useRef(0);
  const lastSentPosRef = useRef({ x: -999, y: -999 });

  // Throttling state for authoritative database position updates
  const lastDbSyncTimeRef = useRef(0);

  // ── 1. Setup Supabase Realtime Broadcast Channel ────────────────────────────
  useEffect(() => {
    if (!roomId || !currentPlayerId) return;

    const channelName = `room:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    channel
      .on("broadcast", { event: "move" }, (event) => {
        const payload = event?.payload;
        if (!payload || payload.type !== "move") return;

        const senderId = payload.playerId;
        if (!senderId || senderId === currentPlayerIdRef.current) return;

        const { x, y, timestamp } = payload;
        const currentRemotes = remotePlayersRef.current;
        const existing = currentRemotes[senderId];

        if (!existing) {
          currentRemotes[senderId] = {
            x: typeof x === "number" ? x : LOGICAL_WIDTH / 2,
            y: typeof y === "number" ? y : LOGICAL_HEIGHT / 2,
            targetX: typeof x === "number" ? x : LOGICAL_WIDTH / 2,
            targetY: typeof y === "number" ? y : LOGICAL_HEIGHT / 2,
            lastUpdated: timestamp || Date.now(),
          };
        } else {
          if (timestamp && existing.lastUpdated && timestamp < existing.lastUpdated) {
            return;
          }
          existing.targetX = typeof x === "number" ? x : existing.targetX;
          existing.targetY = typeof y === "number" ? y : existing.targetY;
          if (timestamp) existing.lastUpdated = timestamp;
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[GameCanvas] Broadcast channel subscribed: ${channelName}`);
        }
      });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
      remotePlayersRef.current = {};
      pendingCoinsRef.current.clear();
    };
  }, [roomId, currentPlayerId]);

  // ── 2. Prune Remote Players when a player leaves ────────────────────────────
  useEffect(() => {
    if (!players || !Array.isArray(players)) return;
    const activePlayerIds = new Set(players.map((p) => p.id));
    const currentRemotes = remotePlayersRef.current;

    for (const id of Object.keys(currentRemotes)) {
      if (!activePlayerIds.has(id) || id === currentPlayerId) {
        delete currentRemotes[id];
      }
    }
  }, [players, currentPlayerId]);

  // ── 3. Main Game Engine & Canvas Loop ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Local player position (in logical canvas coordinates 700x440)
    const player = {
      x: LOGICAL_WIDTH / 2,
      y: LOGICAL_HEIGHT / 2,
    };

    // Keys currently held down
    const keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    const minX = ARENA_PADDING + PLAYER_SIZE / 2;
    const maxX = LOGICAL_WIDTH - ARENA_PADDING - PLAYER_SIZE / 2;
    const minY = ARENA_PADDING + PLAYER_SIZE / 2;
    const maxY = LOGICAL_HEIGHT - ARENA_PADDING - PLAYER_SIZE / 2;

    function clampPlayer() {
      player.x = Math.max(minX, Math.min(maxX, player.x));
      player.y = Math.max(minY, Math.min(maxY, player.y));
    }

    // Initialize spawn position (preserving server position if available)
    const myId = currentPlayerIdRef.current;
    const myData = playersRef.current?.find((p) => p.id === myId);
    if (myData && typeof myData.x === "number" && myData.x > 0 && typeof myData.y === "number" && myData.y > 0) {
      player.x = Number(myData.x);
      player.y = Number(myData.y);
      clampPlayer();
    } else {
      player.x = LOGICAL_WIDTH / 2;
      player.y = LOGICAL_HEIGHT / 2;
    }
    updatePlayerPosition(player.x, player.y).catch(() => {});

    // Input handlers
    const MOVEMENT_KEYS = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "a", "s", "d",
      "W", "A", "S", "D",
    ]);

    function handleKeyDown(e) {
      if (MOVEMENT_KEYS.has(e.key)) {
        e.preventDefault();
      }

      // Strict input locking: ignore input if not in 'playing' phase
      if (matchPhaseRef.current !== "playing") {
        keys.up = keys.down = keys.left = keys.right = false;
        return;
      }

      switch (e.key) {
        case "ArrowUp":    case "w": case "W": keys.up    = true; break;
        case "ArrowDown":  case "s": case "S": keys.down  = true; break;
        case "ArrowLeft":  case "a": case "A": keys.left  = true; break;
        case "ArrowRight": case "d": case "D": keys.right = true; break;
      }
    }

    function handleKeyUp(e) {
      switch (e.key) {
        case "ArrowUp":    case "w": case "W": keys.up    = false; break;
        case "ArrowDown":  case "s": case "S": keys.down  = false; break;
        case "ArrowLeft":  case "a": case "A": keys.left  = false; break;
        case "ArrowRight": case "d": case "D": keys.right = false; break;
      }
    }

    function handleBlur() {
      keys.up = keys.down = keys.left = keys.right = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup",   handleKeyUp);
    window.addEventListener("blur",    handleBlur);

    // ── Render Loop ───────────────────────────────────────────────────────────
    let lastTime = null;
    let rafId = null;

    function tick(timestamp) {
      const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;

      const currentPhase = matchPhaseRef.current;

      // 1. Move Local Player — STRICTLY enabled only when currentPhase === 'playing'
      if (currentPhase === "playing") {
        let dx = 0;
        let dy = 0;
        if (keys.up)    dy -= 1;
        if (keys.down)  dy += 1;
        if (keys.left)  dx -= 1;
        if (keys.right) dx += 1;

        if (dx !== 0 && dy !== 0) {
          const inv = 1 / Math.SQRT2;
          dx *= inv;
          dy *= inv;
        }

        if (dx !== 0 || dy !== 0) {
          player.x += dx * PLAYER_SPEED * dt;
          player.y += dy * PLAYER_SPEED * dt;
          clampPlayer();
        }
      } else {
        keys.up = keys.down = keys.left = keys.right = false;
      }

      const now = Date.now();
      const currentChannel = channelRef.current;
      const currentMyId = currentPlayerIdRef.current;

      // 2. Broadcast Local Position (Throttled ~20 Hz, only during playing)
      if (currentChannel && currentMyId && now - lastBroadcastTimeRef.current >= BROADCAST_THROTTLE_MS) {
        const distMoved =
          Math.abs(player.x - lastSentPosRef.current.x) +
          Math.abs(player.y - lastSentPosRef.current.y);

        if (distMoved > 0.05) {
          currentChannel.send({
            type: "broadcast",
            event: "move",
            payload: {
              type: "move",
              playerId: currentMyId,
              x: Math.round(player.x * 10) / 10,
              y: Math.round(player.y * 10) / 10,
              timestamp: now,
            },
          });
          lastBroadcastTimeRef.current = now;
          lastSentPosRef.current = { x: player.x, y: player.y };
        }
      }

      // 3. Authoritative Database Position Sync (Throttled ~3.3 Hz, only during playing)
      if (currentMyId && now - lastDbSyncTimeRef.current >= DB_AUTH_SYNC_MS && currentPhase === "playing") {
        lastDbSyncTimeRef.current = now;
        updatePlayerPosition(player.x, player.y).then((res) => {
          if (res && !res.success && res.reason === "movement_exceeded") {
            player.x = Number(res.x);
            player.y = Number(res.y);
            clampPlayer();
          }
        });
      }

      // 4. Collision Detection with Active Coins (Active only during playing)
      if (isCollectiblesActiveRef.current && currentPhase === "playing") {
        const activeCoins = coinsRef.current || [];
        const pendingSet = pendingCoinsRef.current;

        for (let i = 0; i < activeCoins.length; i++) {
          const coin = activeCoins[i];
          if (!coin || !coin.active) continue;
          if (pendingSet.has(coin.id)) continue;

          const distance = Math.hypot(player.x - Number(coin.x), player.y - Number(coin.y));

          if (distance <= COLLECTION_RADIUS) {
            pendingSet.add(coin.id);
            coin.active = false; // Optimistic hide locally

            // Synchronize position to server, then invoke authoritative collection RPC
            updatePlayerPosition(player.x, player.y)
              .then(() => collectCoin(coin.id, currentMyId))
              .then((result) => {
                if (!result || !result.success) {
                  coin.active = true; // Rollback
                }
              })
              .catch((err) => {
                console.error("[GameCanvas] Coin collection error:", err);
                coin.active = true; // Rollback
              })
              .finally(() => {
                pendingSet.delete(coin.id);
              });
          }
        }
      }

      // 5. Clean entire canvas frame buffer
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      const arenaW = LOGICAL_WIDTH - ARENA_PADDING * 2;
      const arenaH = LOGICAL_HEIGHT - ARENA_PADDING * 2;

      // Arena Floor
      ctx.fillStyle = "#18181b"; // zinc-900
      ctx.fillRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

      // Arena Grid lines for retro arcade depth
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.lineWidth = 1;
      const gridSize = 35;
      for (let gx = ARENA_PADDING + gridSize; gx < ARENA_PADDING + arenaW; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(gx, ARENA_PADDING);
        ctx.lineTo(gx, ARENA_PADDING + arenaH);
        ctx.stroke();
      }
      for (let gy = ARENA_PADDING + gridSize; gy < ARENA_PADDING + arenaH; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(ARENA_PADDING, gy);
        ctx.lineTo(ARENA_PADDING + arenaW, gy);
        ctx.stroke();
      }

      // Arena Outer Border
      ctx.strokeStyle = "#52525b"; // zinc-600
      ctx.lineWidth = 3;
      ctx.strokeRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

      // Corner accent markers
      ctx.fillStyle = "#f97316";
      const markerSize = 6;
      ctx.fillRect(ARENA_PADDING - 1, ARENA_PADDING - 1, markerSize, markerSize);
      ctx.fillRect(ARENA_PADDING + arenaW - markerSize + 1, ARENA_PADDING - 1, markerSize, markerSize);
      ctx.fillRect(ARENA_PADDING - 1, ARENA_PADDING + arenaH - markerSize + 1, markerSize, markerSize);
      ctx.fillRect(ARENA_PADDING + arenaW - markerSize + 1, ARENA_PADDING + arenaH - markerSize + 1, markerSize, markerSize);

      // 6. Draw Active Coins
      const activeCoins = coinsRef.current || [];
      for (let i = 0; i < activeCoins.length; i++) {
        const coin = activeCoins[i];
        if (coin && coin.active) {
          drawCoin(ctx, Number(coin.x), Number(coin.y), COIN_RADIUS);
        }
      }

      // 7. Map player IDs to nicknames
      const playerList = playersRef.current || [];
      const nicknameMap = new Map(playerList.map((p) => [p.id, p.nickname]));

      const remotePlayerIds = playerList
        .map((p) => p.id)
        .filter((id) => id !== currentMyId);

      // 8. Interpolate & Draw Remote Players
      const remotes = remotePlayersRef.current;
      for (const [remoteId, remoteData] of Object.entries(remotes)) {
        remoteData.x += (remoteData.targetX - remoteData.x) * 0.25;
        remoteData.y += (remoteData.targetY - remoteData.y) * 0.25;

        const colorIndex = Math.max(0, remotePlayerIds.indexOf(remoteId)) % REMOTE_PLAYER_COLORS.length;
        const color = REMOTE_PLAYER_COLORS[colorIndex];
        const nickname = nicknameMap.get(remoteId) || "Player";

        drawPlayer(ctx, remoteData.x, remoteData.y, PLAYER_SIZE, {
          bodyColor: color.body,
          strokeColor: color.stroke,
          nickname,
        });
      }

      // 9. Draw Local Player (Orange, authoritative)
      const myNickname = nicknameMap.get(currentMyId) || "You";
      drawPlayer(ctx, player.x, player.y, PLAYER_SIZE, {
        bodyColor: "#f97316",
        strokeColor: "#c2410c",
        nickname: `${myNickname} (You)`,
      });

      // 10. Waiting Phase Visual Overlay
      if (currentPhase === "waiting") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

        ctx.font = "bold 15px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#e4e4e7";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 8;
        ctx.fillText("WAITING FOR HOST TO START MATCH", LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
        ctx.restore();
      }

      // 11. Countdown Visual Overlay
      if (currentPhase === "countdown") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

        ctx.font = "bold 72px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#facc15";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 18;

        const count = countdownSecondsRef.current;
        const text = count > 0 ? String(count) : "GO!";
        ctx.fillText(text, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);

        ctx.font = "bold 16px monospace, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 4;
        ctx.fillText("GET READY", LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 60);
        ctx.restore();
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup",   handleKeyUp);
      window.removeEventListener("blur",    handleBlur);
    };
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center p-2 bg-zinc-950">
      <canvas
        ref={canvasRef}
        width={LOGICAL_WIDTH}
        height={LOGICAL_HEIGHT}
        className="w-full h-auto max-w-[700px] aspect-[700/440] object-contain rounded-xl outline-none shadow-2xl border border-zinc-800/80 bg-zinc-900"
        tabIndex={0}
        aria-label="Game arena"
      />
    </div>
  );
}
