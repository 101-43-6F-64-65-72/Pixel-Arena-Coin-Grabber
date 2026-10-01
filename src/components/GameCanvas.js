"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ARENA_PADDING, BASE_PLAYER_SIZE, PLAYER_SPEED, COIN_RADIUS, getPlayerPalette } from "@/lib/arena";
import { Camera } from "@/game/camera";
import { drawPlayer } from "@/game/drawPlayer";
import { drawCoin } from "@/game/drawCoin";
import { drawCombatEffects } from "@/game/drawCombat";
import { collectCoin } from "@/lib/coins";
import { updatePlayerPosition } from "@/lib/movement";
import { attackPlayer, useDash, useShield, useShockwave, respawnPlayer } from "@/lib/combat";

const BROADCAST_THROTTLE_MS = 45; // ~22 Hz peer position broadcast
const DB_AUTH_SYNC_MS = 250;      // ~4 Hz authoritative database position sync

export default function GameCanvas({
  roomId,
  currentPlayerId,
  players = [],
  coins = [],
  matchPhase = "waiting", // "waiting" | "countdown" | "playing" | "finished"
  countdownSeconds = 3,
  isCollectiblesActive = false,
  skillCooldowns = {},
  onSkillCooldownUpdate,
}) {
  const canvasRef = useRef(null);

  // Props in refs for RAF loop
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

  // Camera & Remote players
  const cameraRef = useRef(new Camera(VIEWPORT_WIDTH, VIEWPORT_HEIGHT));
  const remotePlayersRef = useRef({});
  const visualEffectsRef = useRef([]);

  // In-flight locks
  const pendingCoinsRef = useRef(new Set());
  const isAttackingRef = useRef(false);
  const isDashingRef = useRef(false);
  const isShieldingRef = useRef(false);
  const isShockwavingRef = useRef(false);
  const isRespawningRef = useRef(false);

  // Realtime Broadcast channel
  const channelRef = useRef(null);
  const lastBroadcastTimeRef = useRef(0);
  const lastSentPosRef = useRef({ x: -999, y: -999 });
  const lastDbSyncTimeRef = useRef(0);
  const lastTrailTimeRef = useRef(0);

  // Notification Toast
  const [combatNotification, setCombatNotification] = useState(null);
  const showToast = (msg) => {
    setCombatNotification(msg);
    setTimeout(() => {
      setCombatNotification((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  // Local movement vector for Dash direction
  const lastMoveDirRef = useRef({ dx: 1, dy: 0 });

  // ── 1. Setup Supabase Realtime Broadcast Channel ────────────────────────────
  useEffect(() => {
    if (!roomId || !currentPlayerId) return;

    const channelName = `room:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channelRef.current = channel;

    // Movement broadcast
    channel.on("broadcast", { event: "move" }, (event) => {
      const payload = event?.payload;
      if (!payload || payload.type !== "move") return;

      const senderId = payload.playerId;
      if (!senderId || senderId === currentPlayerIdRef.current) return;

      const { x, y, timestamp, isShielded, hp, alive, colorKey } = payload;
      const remotes = remotePlayersRef.current;
      const existing = remotes[senderId];

      if (!existing) {
        remotes[senderId] = {
          x: typeof x === "number" ? x : 1000,
          y: typeof y === "number" ? y : 600,
          targetX: typeof x === "number" ? x : 1000,
          targetY: typeof y === "number" ? y : 600,
          lastUpdated: timestamp || Date.now(),
          isShielded: !!isShielded,
          hp: typeof hp === "number" ? hp : 100,
          alive: alive !== false,
          colorKey: colorKey || "orange",
        };
      } else {
        if (timestamp && existing.lastUpdated && timestamp < existing.lastUpdated) return;
        existing.targetX = typeof x === "number" ? x : existing.targetX;
        existing.targetY = typeof y === "number" ? y : existing.targetY;
        if (typeof isShielded === "boolean") existing.isShielded = isShielded;
        if (typeof hp === "number") existing.hp = hp;
        if (typeof alive === "boolean") existing.alive = alive;
        if (colorKey) existing.colorKey = colorKey;
        if (timestamp) existing.lastUpdated = timestamp;
      }
    });

    // Combat FX broadcast (slashes, damage numbers, shockwaves)
    channel.on("broadcast", { event: "combat_fx" }, (event) => {
      const payload = event?.payload;
      if (!payload) return;

      visualEffectsRef.current.push({
        id: `fx-${Date.now()}-${Math.random()}`,
        type: payload.type,
        x: Number(payload.x),
        y: Number(payload.y),
        radius: payload.radius || 36,
        angle: payload.angle || 0,
        damage: payload.damage || 0,
        isBlocked: !!payload.isBlocked,
        isKill: !!payload.isKill,
        color: payload.color || "#ef4444",
        startTime: performance.now(),
        duration: payload.duration || 0.6,
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[GameCanvas] Broadcast channel subscribed: ${channelName}`);
      }
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
      remotePlayersRef.current = {};
      pendingCoinsRef.current.clear();
    };
  }, [roomId, currentPlayerId]);

  // ── 2. Combat Action Handlers ───────────────────────────────────────────────
  const handlePerformAttack = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isAttackingRef.current) return;

    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    const myX = myPlayer.x || 1000;
    const myY = myPlayer.y || 600;

    // Find closest alive enemy player in same room
    const remotes = remotePlayersRef.current;
    let closestEnemyId = null;
    let closestDistSq = 90 * 90; // 90px attack range

    for (const [remoteId, remoteData] of Object.entries(remotes)) {
      const rObj = playersRef.current?.find((p) => p.id === remoteId);
      if (!rObj || !rObj.alive) continue;

      const distSq = (myX - remoteData.x) ** 2 + (myY - remoteData.y) ** 2;
      if (distSq <= closestDistSq) {
        closestDistSq = distSq;
        closestEnemyId = remoteId;
      }
    }

    if (!closestEnemyId) {
      // Slash visual in front of player
      const dir = lastMoveDirRef.current;
      const angle = Math.atan2(dir.dy, dir.dx);
      visualEffectsRef.current.push({
        id: `slash-${Date.now()}`,
        type: "melee_slash",
        x: myX + dir.dx * 28,
        y: myY + dir.dy * 28,
        radius: 36,
        angle,
        color: "#f87171",
        startTime: performance.now(),
        duration: 0.35,
      });
      return;
    }

    isAttackingRef.current = true;
    try {
      // Sync local position before attack
      await updatePlayerPosition(myX, myY);
      const res = await attackPlayer(closestEnemyId);

      if (res && res.success) {
        const targetData = remotes[closestEnemyId] || { x: myX, y: myY };
        const angle = Math.atan2(targetData.y - myY, targetData.x - myX);

        // Add visual slash
        visualEffectsRef.current.push({
          id: `slash-${Date.now()}`,
          type: "melee_slash",
          x: (myX + targetData.x) / 2,
          y: (myY + targetData.y) / 2,
          radius: 40,
          angle,
          color: res.is_shielded ? "#fbbf24" : "#ef4444",
          startTime: performance.now(),
          duration: 0.35,
        });

        // Add damage number
        visualEffectsRef.current.push({
          id: `dmg-${Date.now()}`,
          type: "damage_text",
          x: targetData.x,
          y: targetData.y - 20,
          damage: res.damage_dealt,
          isBlocked: res.is_shielded,
          isKill: res.is_kill,
          startTime: performance.now(),
          duration: 0.9,
        });

        // Broadcast combat FX
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "combat_fx",
            payload: {
              type: "damage_text",
              x: targetData.x,
              y: targetData.y - 20,
              damage: res.damage_dealt,
              isBlocked: res.is_shielded,
              isKill: res.is_kill,
            },
          });
        }

        if (res.is_shielded) {
          showToast("🛡️ Enemy Shielded! Attack Blocked.");
        } else if (res.is_kill) {
          showToast("💀 ENEMY DEFEATED! (+1 Kill)");
        }
      }
    } finally {
      setTimeout(() => { isAttackingRef.current = false; }, 400);
    }
  }, []);

  const handlePerformDash = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isDashingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    const dir = lastMoveDirRef.current;
    isDashingRef.current = true;

    try {
      const res = await useDash(dir.dx, dir.dy);
      if (res && res.success) {
        if (onSkillCooldownUpdate) onSkillCooldownUpdate("dash", 4);
        showToast("⚡ DASH!");
      }
    } finally {
      setTimeout(() => { isDashingRef.current = false; }, 600);
    }
  }, [onSkillCooldownUpdate]);

  const handlePerformShield = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isShieldingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    isShieldingRef.current = true;
    try {
      const res = await useShield();
      if (res && res.success) {
        if (onSkillCooldownUpdate) onSkillCooldownUpdate("shield", 8);
        showToast("🛡️ AEGIS SHIELD (2s)");
      }
    } finally {
      setTimeout(() => { isShieldingRef.current = false; }, 600);
    }
  }, [onSkillCooldownUpdate]);

  const handlePerformShockwave = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isShockwavingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    isShockwavingRef.current = true;
    try {
      const res = await useShockwave();
      if (res && res.success) {
        if (onSkillCooldownUpdate) onSkillCooldownUpdate("shockwave", 7);

        const now = performance.now();
        visualEffectsRef.current.push({
          id: `shock-${now}`,
          type: "shockwave",
          x: myPlayer.x,
          y: myPlayer.y,
          radius: 170,
          startTime: now,
          duration: 0.65,
        });

        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "combat_fx",
            payload: {
              type: "shockwave",
              x: myPlayer.x,
              y: myPlayer.y,
              radius: 170,
            },
          });
        }

        showToast(`💥 SHOCKWAVE! Hit ${res.hits_count} Enemies`);
      }
    } finally {
      setTimeout(() => { isShockwavingRef.current = false; }, 600);
    }
  }, [onSkillCooldownUpdate]);

  // ── 3. Main Game Engine & Canvas Loop ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const camera = cameraRef.current;

    const player = {
      x: 1000,
      y: 600,
    };

    const keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    function clampPlayer() {
      const r = BASE_PLAYER_SIZE / 2;
      const minX = ARENA_PADDING + r;
      const maxX = WORLD_WIDTH - ARENA_PADDING - r;
      const minY = ARENA_PADDING + r;
      const maxY = WORLD_HEIGHT - ARENA_PADDING - r;

      player.x = Math.max(minX, Math.min(maxX, player.x));
      player.y = Math.max(minY, Math.min(maxY, player.y));
    }

    // Initialize local position from DB if exists
    const myId = currentPlayerIdRef.current;
    const myData = playersRef.current?.find((p) => p.id === myId);
    if (myData && typeof myData.x === "number" && myData.x > 0 && typeof myData.y === "number" && myData.y > 0) {
      player.x = Number(myData.x);
      player.y = Number(myData.y);
      clampPlayer();
      camera.snapTo(player.x, player.y);
    }

    const MOVEMENT_KEYS = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "a", "s", "d", "W", "A", "S", "D",
    ]);

    function handleKeyDown(e) {
      if (MOVEMENT_KEYS.has(e.key) || e.code === "Space") {
        e.preventDefault();
      }

      if (matchPhaseRef.current !== "playing") {
        keys.up = keys.down = keys.left = keys.right = false;
        return;
      }

      // Check if player alive
      const curMe = playersRef.current?.find((p) => p.id === currentPlayerIdRef.current);
      if (curMe && !curMe.alive) return;

      switch (e.key) {
        case "ArrowUp":    case "w": case "W": keys.up    = true; break;
        case "ArrowDown":  case "s": case "S": keys.down  = true; break;
        case "ArrowLeft":  case "a": case "A": keys.left  = true; break;
        case "ArrowRight": case "d": case "D": keys.right = true; break;
      }

      // Skill Hotkeys: Q (Dash), E (Shield), R (Shockwave), Space/F (Basic Attack)
      if (e.code === "KeyQ") {
        handlePerformDash();
      } else if (e.code === "KeyE") {
        handlePerformShield();
      } else if (e.code === "KeyR") {
        handlePerformShockwave();
      } else if (e.code === "Space" || e.code === "KeyF") {
        handlePerformAttack();
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

    function handleCanvasClick() {
      handlePerformAttack();
    }

    function handleBlur() {
      keys.up = keys.down = keys.left = keys.right = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    canvas.addEventListener("click", handleCanvasClick);

    // ── Render Loop ───────────────────────────────────────────────────────────
    let lastTime = null;
    let rafId = null;

    function tick(timestamp) {
      const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;

      const currentPhase = matchPhaseRef.current;
      const currentPlayers = playersRef.current || [];
      const currentMyId = currentPlayerIdRef.current;
      const myPlayerObj = currentPlayers.find((p) => p.id === currentMyId);
      const isAlive = myPlayerObj?.alive !== false;

      // Handle Respawn Trigger if dead
      if (!isAlive && myPlayerObj?.respawn_at && !isRespawningRef.current) {
        const respawnTime = new Date(myPlayerObj.respawn_at).getTime();
        if (Date.now() >= respawnTime) {
          isRespawningRef.current = true;
          respawnPlayer().then((res) => {
            if (res && res.success) {
              player.x = Number(res.new_x);
              player.y = Number(res.new_y);
              camera.snapTo(player.x, player.y);
              showToast("✨ RESPAWNED (Spawn Shield 1.5s)");
            }
          }).finally(() => {
            setTimeout(() => { isRespawningRef.current = false; }, 1000);
          });
        }
      }

      // 1. Move Local Player (Active only when match is playing & alive)
      if (currentPhase === "playing" && isAlive) {
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
          lastMoveDirRef.current = { dx, dy };
          player.x += dx * PLAYER_SPEED * dt;
          player.y += dy * PLAYER_SPEED * dt;
          clampPlayer();
        }
      } else {
        keys.up = keys.down = keys.left = keys.right = false;
      }

      // Smooth Camera follow
      camera.follow(player.x, player.y, 0.18);

      const epochNow = Date.now();
      const currentChannel = channelRef.current;
      const isShielded = myPlayerObj?.shield_until && new Date(myPlayerObj.shield_until).getTime() > epochNow;

      // 2. Broadcast Position & Status to Peers
      if (currentChannel && currentMyId && epochNow - lastBroadcastTimeRef.current >= BROADCAST_THROTTLE_MS) {
        const distMoved =
          Math.abs(player.x - lastSentPosRef.current.x) +
          Math.abs(player.y - lastSentPosRef.current.y);

        if (distMoved > 0.05 || isShielded) {
          currentChannel.send({
            type: "broadcast",
            event: "move",
            payload: {
              type: "move",
              playerId: currentMyId,
              x: Math.round(player.x * 10) / 10,
              y: Math.round(player.y * 10) / 10,
              isShielded: !!isShielded,
              hp: myPlayerObj?.hp ?? 100,
              alive: isAlive,
              colorKey: myPlayerObj?.color_key || "orange",
              timestamp: epochNow,
            },
          });
          lastBroadcastTimeRef.current = epochNow;
          lastSentPosRef.current = { x: player.x, y: player.y };
        }
      }

      // 3. Authoritative Database Position Sync (~4 Hz)
      if (currentMyId && epochNow - lastDbSyncTimeRef.current >= DB_AUTH_SYNC_MS && currentPhase === "playing" && isAlive) {
        lastDbSyncTimeRef.current = epochNow;
        updatePlayerPosition(player.x, player.y).then((res) => {
          if (res && !res.success && res.reason === "movement_exceeded") {
            player.x = Number(res.x);
            player.y = Number(res.y);
            clampPlayer();
          }
        });
      }

      // 4. Coin Collection Check (Continuous / Infinite respawn)
      if (isCollectiblesActiveRef.current && currentPhase === "playing" && isAlive) {
        const activeCoins = coinsRef.current || [];
        const pendingSet = pendingCoinsRef.current;
        const collectionRadius = BASE_PLAYER_SIZE / 2 + COIN_RADIUS;

        for (let i = 0; i < activeCoins.length; i++) {
          const coin = activeCoins[i];
          if (!coin || !coin.active) continue;
          if (pendingSet.has(coin.id)) continue;

          const distance = Math.hypot(player.x - Number(coin.x), player.y - Number(coin.y));
          if (distance <= collectionRadius) {
            pendingSet.add(coin.id);
            coin.active = false; // Optimistic

            updatePlayerPosition(player.x, player.y)
              .then(() => collectCoin(coin.id, currentMyId))
              .then((result) => {
                if (!result || !result.success) {
                  coin.active = true;
                }
              })
              .catch(() => {
                coin.active = true;
              })
              .finally(() => {
                pendingSet.delete(coin.id);
              });
          }
        }
      }

      // ── 5. RENDER CANVAS (Camera-Relative) ───────────────────────────────────
      ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      // Arena Floor relative to camera
      const floorScreen = camera.worldToScreen(ARENA_PADDING, ARENA_PADDING);
      const arenaW = WORLD_WIDTH - ARENA_PADDING * 2;
      const arenaH = WORLD_HEIGHT - ARENA_PADDING * 2;

      ctx.fillStyle = "#18181b"; // zinc-900 floor
      ctx.fillRect(floorScreen.x, floorScreen.y, arenaW, arenaH);

      // Retro Neon Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.lineWidth = 1;
      const gridSize = 50;

      const startGridX = Math.floor(camera.x / gridSize) * gridSize;
      const endGridX = Math.ceil((camera.x + VIEWPORT_WIDTH) / gridSize) * gridSize;
      for (let gx = startGridX; gx <= endGridX; gx += gridSize) {
        if (gx < ARENA_PADDING || gx > WORLD_WIDTH - ARENA_PADDING) continue;
        const s = camera.worldToScreen(gx, ARENA_PADDING);
        ctx.beginPath();
        ctx.moveTo(s.x, camera.worldToScreen(gx, ARENA_PADDING).y);
        ctx.lineTo(s.x, camera.worldToScreen(gx, WORLD_HEIGHT - ARENA_PADDING).y);
        ctx.stroke();
      }

      const startGridY = Math.floor(camera.y / gridSize) * gridSize;
      const endGridY = Math.ceil((camera.y + VIEWPORT_HEIGHT) / gridSize) * gridSize;
      for (let gy = startGridY; gy <= endGridY; gy += gridSize) {
        if (gy < ARENA_PADDING || gy > WORLD_HEIGHT - ARENA_PADDING) continue;
        const s = camera.worldToScreen(ARENA_PADDING, gy);
        ctx.beginPath();
        ctx.moveTo(camera.worldToScreen(ARENA_PADDING, gy).x, s.y);
        ctx.lineTo(camera.worldToScreen(WORLD_WIDTH - ARENA_PADDING, gy).x, s.y);
        ctx.stroke();
      }

      // Arena Outer Border
      ctx.strokeStyle = "#52525b"; // zinc-600
      ctx.lineWidth = 4;
      ctx.strokeRect(floorScreen.x, floorScreen.y, arenaW, arenaH);

      // 6. Draw Active Coins (Camera-relative)
      const activeCoins = coinsRef.current || [];
      for (let i = 0; i < activeCoins.length; i++) {
        const coin = activeCoins[i];
        if (coin && coin.active && camera.isVisible(Number(coin.x), Number(coin.y), 20)) {
          const s = camera.worldToScreen(Number(coin.x), Number(coin.y));
          drawCoin(ctx, s.x, s.y, COIN_RADIUS);
        }
      }

      // 7. Draw Combat Effects (Camera-relative)
      const screenFx = visualEffectsRef.current.map((fx) => {
        const s = camera.worldToScreen(fx.x, fx.y);
        return { ...fx, x: s.x, y: s.y };
      });
      drawCombatEffects(ctx, screenFx, timestamp);
      visualEffectsRef.current = visualEffectsRef.current.filter(
        (fx) => (timestamp - fx.startTime) / 1000 < fx.duration
      );

      // 8. Find Leader
      const highestScore = currentPlayers.reduce((max, p) => Math.max(max, p.score ?? 0), 0);

      // 9. Draw Remote Players (Camera-relative, Authoritative color & HP)
      const remotes = remotePlayersRef.current;
      for (const [remoteId, remoteData] of Object.entries(remotes)) {
        remoteData.x += (remoteData.targetX - remoteData.x) * 0.25;
        remoteData.y += (remoteData.targetY - remoteData.y) * 0.25;

        if (camera.isVisible(remoteData.x, remoteData.y, 50)) {
          const s = camera.worldToScreen(remoteData.x, remoteData.y);
          const remoteObj = currentPlayers.find((p) => p.id === remoteId);
          const rScore = remoteObj?.score ?? 0;
          const rHp = remoteObj?.hp ?? remoteData.hp ?? 100;
          const rAlive = remoteObj ? remoteObj.alive : remoteData.alive;
          const rColorKey = remoteObj?.color_key || remoteData.colorKey || "purple";
          const rShielded = remoteObj?.shield_until && new Date(remoteObj.shield_until).getTime() > epochNow;

          let rRespawnSecs = 0;
          if (!rAlive && remoteObj?.respawn_at) {
            rRespawnSecs = Math.max(0, (new Date(remoteObj.respawn_at).getTime() - epochNow) / 1000);
          }

          drawPlayer(ctx, s.x, s.y, BASE_PLAYER_SIZE, {
            colorKey: rColorKey,
            nickname: remoteObj?.nickname || "Player",
            score: rScore,
            hp: rHp,
            maxHp: 100,
            alive: rAlive,
            isLeader: rScore === highestScore && highestScore > 0,
            isShielded: !!rShielded,
            respawnSecs: rRespawnSecs,
          });
        }
      }

      // 10. Draw Local Player (Camera-relative, Authoritative color & HP)
      const myScreen = camera.worldToScreen(player.x, player.y);
      const myScore = myPlayerObj?.score ?? 0;
      const myHp = myPlayerObj?.hp ?? 100;
      const myColorKey = myPlayerObj?.color_key || "orange";
      let myRespawnSecs = 0;
      if (!isAlive && myPlayerObj?.respawn_at) {
        myRespawnSecs = Math.max(0, (new Date(myPlayerObj.respawn_at).getTime() - epochNow) / 1000);
      }

      drawPlayer(ctx, myScreen.x, myScreen.y, BASE_PLAYER_SIZE, {
        colorKey: myColorKey,
        nickname: `${myPlayerObj?.nickname || "You"} (You)`,
        score: myScore,
        hp: myHp,
        maxHp: 100,
        alive: isAlive,
        isLeader: myScore === highestScore && highestScore > 0,
        isShielded: !!isShielded,
        respawnSecs: myRespawnSecs,
      });

      // 11. Minimap (Bottom-Right Radar)
      const miniW = 160;
      const miniH = 96;
      const miniX = VIEWPORT_WIDTH - miniW - 14;
      const miniY = VIEWPORT_HEIGHT - miniH - 14;

      ctx.save();
      ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
      ctx.fillRect(miniX, miniY, miniW, miniH);
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(miniX, miniY, miniW, miniH);

      // Minimap viewport box
      const scaleX = miniW / WORLD_WIDTH;
      const scaleY = miniH / WORLD_HEIGHT;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        miniX + camera.x * scaleX,
        miniY + camera.y * scaleY,
        VIEWPORT_WIDTH * scaleX,
        VIEWPORT_HEIGHT * scaleY
      );

      // Minimap coins
      ctx.fillStyle = "#eab308";
      for (const coin of activeCoins) {
        if (coin.active) {
          ctx.fillRect(miniX + coin.x * scaleX - 1, miniY + coin.y * scaleY - 1, 2, 2);
        }
      }

      // Minimap remote players
      for (const [rId, rData] of Object.entries(remotes)) {
        const rObj = currentPlayers.find((p) => p.id === rId);
        const palette = getPlayerPalette(rObj?.color_key || "purple");
        ctx.fillStyle = palette.body;
        ctx.beginPath();
        ctx.arc(miniX + rData.x * scaleX, miniY + rData.y * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Minimap local player
      const myPal = getPlayerPalette(myColorKey);
      ctx.fillStyle = myPal.body;
      ctx.beginPath();
      ctx.arc(miniX + player.x * scaleX, miniY + player.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // 12. Waiting Phase Overlay
      if (currentPhase === "waiting") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.font = "bold 20px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#e4e4e7";
        ctx.fillText("WAITING FOR HOST TO START ARENA BATTLE", VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
        ctx.restore();
      }

      // 13. Countdown Overlay
      if (currentPhase === "countdown") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.font = "bold 96px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#facc15";
        const count = countdownSecondsRef.current;
        ctx.fillText(count > 0 ? String(count) : "GO!", VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
        ctx.restore();
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      canvas.removeEventListener("click", handleCanvasClick);
    };
  }, [handlePerformAttack, handlePerformDash, handlePerformShield, handlePerformShockwave]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-2 bg-zinc-950">
      <canvas
        ref={canvasRef}
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        className="w-full h-auto max-w-[960px] aspect-[960/600] object-contain rounded-xl outline-none shadow-2xl border border-zinc-800/80 bg-zinc-900 cursor-crosshair"
        tabIndex={0}
        aria-label="RoyalWar Arena Viewport"
      />

      {/* Dynamic In-Arena Combat Notification Toast */}
      {combatNotification && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 px-5 py-2 bg-zinc-950/90 border border-orange-500/80 rounded-full text-orange-300 font-mono font-bold text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {combatNotification}
        </div>
      )}
    </div>
  );
}
