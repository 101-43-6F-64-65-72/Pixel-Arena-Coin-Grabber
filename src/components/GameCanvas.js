"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ARENA_PADDING, BASE_PLAYER_SIZE, PLAYER_SPEED, COIN_RADIUS, getPlayerPalette } from "@/lib/arena";
import { Camera } from "@/game/camera";
import { drawPlayer } from "@/game/drawPlayer";
import { drawCoin } from "@/game/drawCoin";
import { drawCombatEffects } from "@/game/drawCombat";
import { drawArena } from "@/game/drawArena";
import { collectCoin } from "@/lib/coins";
import { updatePlayerPosition } from "@/lib/movement";
import { attackPlayer, useDash, useShield, useShockwave, respawnPlayer } from "@/lib/combat";
import { getGameImage } from "@/game/spriteManager";

// ── Timing Constants ────────────────────────────────────────────────────────
const BROADCAST_THROTTLE_MS = 40;  // ~25 Hz peer position broadcast
const DB_SYNC_MIN_MS        = 100; // Minimum interval between DB syncs
const DB_SYNC_MAX_MS        = 200; // Normal target sync interval (~5–10 Hz)
const MIN_SYNC_DISTANCE     = 1.5; // px — skip sync if barely moved

// ── Reconciliation Thresholds ───────────────────────────────────────────────
// When server returns a position that differs from client prediction:
const RECONCILE_SNAP_THRESHOLD   = 100; // px — snap immediately (anti-cheat / teleport)
const RECONCILE_LERP_THRESHOLD   = 30;  // px — apply gradual correction
// Below RECONCILE_LERP_THRESHOLD: accept server ack silently, keep prediction

export default function GameCanvas({
  roomId,
  currentPlayerId,
  players = [],
  coins = [],
  matchPhase = "waiting",
  countdownSeconds = 3,
  isCollectiblesActive = false,
  skillCooldowns = {},
  onSkillCooldownUpdate,
}) {
  const canvasRef = useRef(null);

  // Props in refs for RAF loop — avoids re-creating the engine on every render
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

  // ── Local Player Predicted State ────────────────────────────────────────────
  // ONLY modified by: user input prediction, authoritative reconciliation
  // NEVER touched by: Realtime channel events, React re-renders
  const localPlayerStateRef = useRef({
    x: 1000,
    y: 600,
    facingLeft: false,
    isMoving: false,
    animFrame: 0,
    animTimer: 0,
  });

  // ── Movement Sync State — Coalescing Queue Architecture ─────────────────────
  //
  // Instead of blocking all syncs while a request is in-flight (the previous
  // syncInFlightRef model), we use a coalescing queue:
  //
  //   latestDesiredPos  — updated every tick the player moves (never blocked)
  //   lastSyncedPos     — position we most recently sent to the server
  //   serverAckPos      — last position the server confirmed as valid
  //   syncInFlight      — true while one RPC is pending
  //
  // When a request completes:
  //   if latestDesiredPos differs meaningfully → immediately send latest
  //   otherwise → schedule next sync after DB_SYNC_MIN_MS
  //
  // This prevents long gaps between DB syncs while still sending only ONE
  // concurrent RPC (no ordering issues).
  //
  const latestDesiredPosRef   = useRef({ x: 1000, y: 600 });
  const serverAckPosRef       = useRef({ x: 1000, y: 600, seq: 0 });
  const lastSyncedPosRef      = useRef({ x: -9999, y: -9999 });
  const syncInFlightRef       = useRef(false);
  const syncSeqRef            = useRef(0);
  const lastDbSyncTimeRef     = useRef(0);
  const pendingSyncRef        = useRef(false); // coalesced position waiting to send
  const sentPosMapRef         = useRef(new Map()); // seq -> { x, y }

  // Initialise local position from DB once on first meaningful `players` update
  const hasInitializedPosRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedPosRef.current && currentPlayerId && players && players.length > 0) {
      const myObj = players.find((p) => p.id === currentPlayerId);
      if (myObj && typeof myObj.x === "number" && myObj.x > 0) {
        const ix = Number(myObj.x);
        const iy = Number(myObj.y);
        localPlayerStateRef.current.x = ix;
        localPlayerStateRef.current.y = iy;
        latestDesiredPosRef.current   = { x: ix, y: iy };
        serverAckPosRef.current       = { x: ix, y: iy, seq: 0 };
        lastSyncedPosRef.current      = { x: ix, y: iy };
        cameraRef.current.snapTo(ix, iy);
        hasInitializedPosRef.current  = true;
      }
    }
  }, [players, currentPlayerId]);

  // Debug throttle
  const lastDebugLogTimeRef = useRef(0);

  // Skill cooldown callback ref
  const onSkillCooldownUpdateRef = useRef(onSkillCooldownUpdate);
  useEffect(() => { onSkillCooldownUpdateRef.current = onSkillCooldownUpdate; }, [onSkillCooldownUpdate]);

  // Preload sprites on mount
  useEffect(() => {
    getGameImage("/uiset4.png");
    getGameImage("/uiset.png");
    getGameImage("/uiset2.png");
    getGameImage("/uiset3.png");
  }, []);

  // In-flight locks for combat / skills
  const pendingCoinsRef    = useRef(new Set());
  const isAttackingRef     = useRef(false);
  const isDashingRef       = useRef(false);
  const isShieldingRef     = useRef(false);
  const isShockwavingRef   = useRef(false);
  const isRespawningRef    = useRef(false);

  // Realtime Broadcast channel
  const channelRef          = useRef(null);
  const lastBroadcastTimeRef = useRef(0);
  const lastSentPosRef      = useRef({ x: -999, y: -999 });

  // Notification Toast
  const [combatNotification, setCombatNotification] = useState(null);
  const showToast = (msg) => {
    setCombatNotification(msg);
    setTimeout(() => {
      setCombatNotification((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const [killFeed, setKillFeed] = useState([]);
  const addKillFeed = useCallback((killerId, victimId) => {
    const id = Date.now() + Math.random();
    setKillFeed((prev) => [{ id, killerId, victimId }, ...prev].slice(0, 4));
    setTimeout(() => {
      setKillFeed((prev) => prev.filter((k) => k.id !== id));
    }, 4000);
  }, []);

  const lastMoveDirRef = useRef({ dx: 1, dy: 0 });

  // ── Movement Sync Helper — Coalescing Queue ─────────────────────────────────
  const performMovementSync = useCallback((pState, epochNow, canMove) => {
    if (!canMove || !currentPlayerIdRef.current) return;

    const desired = latestDesiredPosRef.current;
    const dist = Math.hypot(desired.x - lastSyncedPosRef.current.x, desired.y - lastSyncedPosRef.current.y);

    const timeSinceLastSync = epochNow - lastDbSyncTimeRef.current;
    if (timeSinceLastSync < DB_SYNC_MIN_MS) return;
    if (dist < MIN_SYNC_DISTANCE && timeSinceLastSync < DB_SYNC_MAX_MS) return;

    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      return;
    }

    _sendMovementSync(desired.x, desired.y, epochNow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function _sendMovementSync(x, y, epochNow) {
    syncInFlightRef.current = true;
    pendingSyncRef.current  = false;
    lastDbSyncTimeRef.current = epochNow;
    lastSyncedPosRef.current  = { x, y };
    const currentSeq = ++syncSeqRef.current;
    sentPosMapRef.current.set(currentSeq, { x, y });

    updatePlayerPosition(x, y)
      .then((res) => {
        syncInFlightRef.current = false;

        const sentPos = sentPosMapRef.current.get(currentSeq);
        sentPosMapRef.current.delete(currentSeq);

        if (!res) return;

        // Reject out-of-order / stale responses
        if (currentSeq < serverAckPosRef.current.seq) {
          return;
        }

        const pState = localPlayerStateRef.current;

        if (res.success) {
          serverAckPosRef.current = {
            x: Number(res.x),
            y: Number(res.y),
            seq: currentSeq,
          };

          // Account for movement predicted while the request was traveling
          const dxSinceSend = sentPos ? pState.x - sentPos.x : 0;
          const dySinceSend = sentPos ? pState.y - sentPos.y : 0;
          const expectedX = Number(res.x) + dxSinceSend;
          const expectedY = Number(res.y) + dySinceSend;

          const discrepancy = Math.hypot(pState.x - expectedX, pState.y - expectedY);

          if (discrepancy >= RECONCILE_SNAP_THRESHOLD) {
            pState.x = expectedX;
            pState.y = expectedY;
          } else if (discrepancy >= RECONCILE_LERP_THRESHOLD) {
            const alpha = 0.2;
            pState.x += (expectedX - pState.x) * alpha;
            pState.y += (expectedY - pState.y) * alpha;
          }
          // SMALL discrepancy: Keep client prediction untouched

        } else if (res.reason === "movement_exceeded" || res.reason === "out_of_bounds") {
          const discrepancy = Math.hypot(pState.x - Number(res.x), pState.y - Number(res.y));
          serverAckPosRef.current = {
            x: Number(res.x),
            y: Number(res.y),
            seq: currentSeq,
          };

          if (discrepancy >= RECONCILE_SNAP_THRESHOLD) {
            pState.x = Number(res.x);
            pState.y = Number(res.y);
          } else {
            const alpha = 0.1;
            pState.x += (Number(res.x) - pState.x) * alpha;
            pState.y += (Number(res.y) - pState.y) * alpha;
          }
        }

        if (pendingSyncRef.current) {
          const desired = latestDesiredPosRef.current;
          const dist = Math.hypot(desired.x - lastSyncedPosRef.current.x, desired.y - lastSyncedPosRef.current.y);
          if (dist >= MIN_SYNC_DISTANCE) {
            _sendMovementSync(desired.x, desired.y, Date.now());
          } else {
            pendingSyncRef.current = false;
          }
        }
      })
      .catch(() => {
        syncInFlightRef.current = false;
        pendingSyncRef.current  = false;
      });
  }

  // ── 2. Combat Action Handlers ──────────────────────────────────────────────
  const handlePerformAttack = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isAttackingRef.current) return;

    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    const pState = localPlayerStateRef.current;
    const myX = pState.x;
    const myY = pState.y;

    const remotes = remotePlayersRef.current;
    let closestEnemyId = null;
    let closestDistSq = 90 * 90;

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
      const res = await attackPlayer(closestEnemyId);

      if (res && res.success) {
        const targetData = remotes[closestEnemyId] || { x: myX, y: myY };
        const angle = Math.atan2(targetData.y - myY, targetData.x - myX);

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

        if (res.target_id && (res.damage_dealt > 0 || res.is_shielded)) {
          const hitX = Number(res.new_target_x) || targetData.x;
          const hitY = Number(res.new_target_y) || targetData.y;

          visualEffectsRef.current.push({
            id: `dmg-${Date.now()}`,
            type: "damage_text",
            x: hitX,
            y: hitY - 20,
            targetY: hitY,
            damage: res.damage_dealt,
            isBlocked: res.is_shielded,
            isKill: res.is_kill,
            startTime: performance.now(),
            duration: 0.9,
          });

          if (channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "combat_fx",
              payload: {
                type: "damage_text",
                x: hitX,
                y: hitY - 20,
                targetY: hitY,
                damage: res.damage_dealt,
                isBlocked: res.is_shielded,
                isKill: res.is_kill,
                killerId: currentPlayerIdRef.current,
                targetId: closestEnemyId,
                knockback: {
                  targetId: closestEnemyId,
                  x: res.new_target_x,
                  y: res.new_target_y,
                },
              },
            });
          }

          if (res.is_shielded) {
            showToast("🛡️ Enemy Shielded! Attack Blocked.");
          } else if (res.is_kill) {
            showToast("💀 ENEMY DEFEATED! (+1 Kill)");
            addKillFeed(currentPlayerIdRef.current, closestEnemyId);
          }
        } else if (res.message === "Target out of attack range.") {
          visualEffectsRef.current.push({
            id: `miss-${Date.now()}`,
            type: "damage_text",
            x: targetData.x,
            y: targetData.y - 20,
            targetY: targetData.y,
            isMiss: true,
            startTime: performance.now(),
            duration: 0.7,
          });
          showToast("⚠️ Target Out of Range");
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
      if (res) {
        if (res.cooldown_until) {
          const cdSecs = Math.max(0, (new Date(res.cooldown_until).getTime() - Date.now()) / 1000);
          onSkillCooldownUpdateRef.current?.("dash", cdSecs);
        }

        if (res.success) {
          // Advance syncSeqRef to invalidate pre-dash movement RPCs
          syncSeqRef.current += 100;

          const pState = localPlayerStateRef.current;
          const nx = Number(res.new_x);
          const ny = Number(res.new_y);
          pState.x = nx;
          pState.y = ny;
          serverAckPosRef.current     = { x: nx, y: ny, seq: syncSeqRef.current };
          latestDesiredPosRef.current = { x: nx, y: ny };
          lastSyncedPosRef.current    = { x: nx, y: ny };

          showToast("⚡ DASH!");
        } else if (res.message) {
          showToast(`❌ ${res.message}`);
        }
      }
    } finally {
      setTimeout(() => { isDashingRef.current = false; }, 400);
    }
  }, []);

  const handlePerformShield = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isShieldingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    isShieldingRef.current = true;
    try {
      const res = await useShield();
      if (res) {
        if (res.cooldown_until) {
          const cdSecs = Math.max(0, (new Date(res.cooldown_until).getTime() - Date.now()) / 1000);
          onSkillCooldownUpdateRef.current?.("shield", cdSecs);
        }

        if (res.success) {
          showToast("🛡️ AEGIS SHIELD (2s)");
        } else if (res.message) {
          showToast(`❌ ${res.message}`);
        }
      }
    } finally {
      setTimeout(() => { isShieldingRef.current = false; }, 400);
    }
  }, []);

  const handlePerformShockwave = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isShockwavingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    isShockwavingRef.current = true;
    try {
      const res = await useShockwave();
      if (res) {
        if (res.cooldown_until) {
          const cdSecs = Math.max(0, (new Date(res.cooldown_until).getTime() - Date.now()) / 1000);
          onSkillCooldownUpdateRef.current?.("shockwave", cdSecs);
        }

        if (res.success) {
          const pState = localPlayerStateRef.current;
          const now = performance.now();

          visualEffectsRef.current.push({
            id: `shock-${now}`,
            type: "shockwave",
            x: pState.x,
            y: pState.y,
            radius: 205,
            startTime: now,
            duration: 0.65,
          });

          if (channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "combat_fx",
              payload: {
                type: "shockwave",
                x: pState.x,
                y: pState.y,
                radius: 205,
              },
            });
          }

          const hitRows = res.rows || [];
          const actualHits = hitRows.filter((r) => r.target_id);

          for (const hit of actualHits) {
            const hx = Number(hit.new_target_x) || pState.x;
            const hy = Number(hit.new_target_y) || pState.y;

            visualEffectsRef.current.push({
              id: `dmg-shock-${Date.now()}-${hit.target_id}`,
              type: "damage_text",
              x: hx,
              y: hy - 20,
              targetY: hy,
              damage: hit.damage_dealt,
              isBlocked: hit.is_shielded,
              isKill: hit.is_kill,
              startTime: now,
              duration: 0.95,
            });

            if (channelRef.current) {
              channelRef.current.send({
                type: "broadcast",
                event: "combat_fx",
                payload: {
                  type: "damage_text",
                  x: hx,
                  y: hy - 20,
                  targetY: hy,
                  damage: hit.damage_dealt,
                  isBlocked: hit.is_shielded,
                  isKill: hit.is_kill,
                  killerId: currentPlayerIdRef.current,
                  targetId: hit.target_id,
                  knockback: {
                    targetId: hit.target_id,
                    x: hit.new_target_x,
                    y: hit.new_target_y,
                  },
                },
              });
            }

            if (hit.is_kill) {
              addKillFeed(currentPlayerIdRef.current, hit.target_id);
            }
          }

          showToast(`💥 BURST! Hit ${actualHits.length} Enemies`);
        } else if (res.message) {
          showToast(`❌ ${res.message}`);
        }
      }
    } finally {
      setTimeout(() => { isShockwavingRef.current = false; }, 400);
    }
  }, []);

  // Handler refs — keep engine effect listeners stable
  const attackHandlerRef    = useRef(handlePerformAttack);
  attackHandlerRef.current  = handlePerformAttack;
  const dashHandlerRef      = useRef(handlePerformDash);
  dashHandlerRef.current    = handlePerformDash;
  const shieldHandlerRef    = useRef(handlePerformShield);
  shieldHandlerRef.current  = handlePerformShield;
  const shockwaveHandlerRef = useRef(handlePerformShockwave);
  shockwaveHandlerRef.current = handlePerformShockwave;

  // ── 1. Setup Supabase Realtime Broadcast Channel ───────────────────────────
  useEffect(() => {
    if (!roomId || !currentPlayerId) return;

    const channelName = `room:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channelRef.current = channel;

    // Remote movement broadcast — updates interpolation targets only
    channel.on("broadcast", { event: "move" }, (event) => {
      const payload = event?.payload;
      if (!payload || payload.type !== "move") return;

      const senderId = payload.playerId;
      if (!senderId || senderId === currentPlayerIdRef.current) return;

      const { x, y, timestamp, isShielded, hp, alive, colorKey, isMoving, facingLeft, animFrame } = payload;
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
          isMoving: !!isMoving,
          facingLeft: !!facingLeft,
          animFrame: animFrame || 0,
        };
      } else {
        // Monotonic: discard stale out-of-order packets
        if (timestamp && existing.lastUpdated && timestamp < existing.lastUpdated) return;

        existing.lastUpdated = timestamp || Date.now();
        const newTargetX = typeof x === "number" ? x : existing.targetX;
        const newTargetY = typeof y === "number" ? y : existing.targetY;

        // Snap immediately if remote player teleported/dashed (>250px jump)
        if (Math.hypot(newTargetX - existing.x, newTargetY - existing.y) > 250) {
          existing.x = newTargetX;
          existing.y = newTargetY;
        }
        existing.targetX = newTargetX;
        existing.targetY = newTargetY;

        if (typeof isShielded === "boolean") existing.isShielded = isShielded;
        if (typeof hp === "number") existing.hp = hp;
        if (typeof alive === "boolean") existing.alive = alive;
        if (typeof isMoving === "boolean") existing.isMoving = isMoving;
        if (typeof facingLeft === "boolean") existing.facingLeft = facingLeft;
        if (typeof animFrame === "number") existing.animFrame = animFrame;
        if (colorKey) existing.colorKey = colorKey;
      }
    });

    // Combat FX broadcast
    channel.on("broadcast", { event: "combat_fx" }, (event) => {
      const payload = event?.payload;
      if (!payload) return;

      if (payload.isKill && payload.killerId && payload.targetId) {
        addKillFeed(payload.killerId, payload.targetId);
      }

      if (payload.knockback && payload.knockback.targetId === currentPlayerIdRef.current) {
        const pState = localPlayerStateRef.current;
        pState.x = Number(payload.knockback.x) || pState.x;
        pState.y = Number(payload.knockback.y) || pState.y;
        serverAckPosRef.current = { x: pState.x, y: pState.y, seq: syncSeqRef.current };
        latestDesiredPosRef.current = { x: pState.x, y: pState.y };
        lastSyncedPosRef.current = { x: pState.x, y: pState.y };
      }

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

  // ── 3. Main Game Engine — RAF Loop (runs exactly once, never recreated) ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const camera = cameraRef.current;
    const pState = localPlayerStateRef.current;

    // Input state — local to this closure, never shared with React
    const keys = { up: false, down: false, left: false, right: false };

    function clampPlayer() {
      const r = BASE_PLAYER_SIZE / 2;
      const minX = ARENA_PADDING + r;
      const maxX = WORLD_WIDTH  - ARENA_PADDING - r;
      const minY = ARENA_PADDING + r;
      const maxY = WORLD_HEIGHT - ARENA_PADDING - r;
      pState.x = Math.max(minX, Math.min(maxX, pState.x));
      pState.y = Math.max(minY, Math.min(maxY, pState.y));
    }

    const MOVEMENT_KEY_CODES = new Set([
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    ]);

    function isMovementKey(e) {
      return (
        MOVEMENT_KEY_CODES.has(e.code) ||
        ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d","i","j","k","l"].includes((e.key || "").toLowerCase())
      );
    }

    function handleKeyDown(e) {
      if (isMovementKey(e) || e.code === "Space" || e.key === " ") {
        e.preventDefault();
      }

      const curMe = playersRef.current?.find((p) => p.id === currentPlayerIdRef.current);
      if (curMe && !curMe.alive) return;

      const k = (e.key || "").toLowerCase();
      const c = e.code || "";

      if (k === "arrowup"    || k === "w" || k === "i" || c === "KeyW" || c === "ArrowUp")    keys.up    = true;
      if (k === "arrowdown"  || k === "s" || k === "k" || c === "KeyS" || c === "ArrowDown")  keys.down  = true;
      if (k === "arrowleft"  || k === "a" || k === "j" || c === "KeyA" || c === "ArrowLeft")  keys.left  = true;
      if (k === "arrowright" || k === "d" || k === "l" || c === "KeyD" || c === "ArrowRight") keys.right = true;

      if (c === "KeyQ" || k === "q") dashHandlerRef.current?.();
      else if (c === "KeyE" || k === "e") shieldHandlerRef.current?.();
      else if (c === "KeyR" || k === "r") shockwaveHandlerRef.current?.();
      else if (c === "Space" || k === " " || c === "KeyF" || k === "f") attackHandlerRef.current?.();
    }

    function handleKeyUp(e) {
      const k = (e.key || "").toLowerCase();
      const c = e.code || "";

      if (k === "arrowup"    || k === "w" || k === "i" || c === "KeyW" || c === "ArrowUp")    keys.up    = false;
      if (k === "arrowdown"  || k === "s" || k === "k" || c === "KeyS" || c === "ArrowDown")  keys.down  = false;
      if (k === "arrowleft"  || k === "a" || k === "j" || c === "KeyA" || c === "ArrowLeft")  keys.left  = false;
      if (k === "arrowright" || k === "d" || k === "l" || c === "KeyD" || c === "ArrowRight") keys.right = false;
    }

    function handleBlur() {
      keys.up = keys.down = keys.left = keys.right = false;
    }

    function handleCanvasClick() {
      if (canvas) canvas.focus();
      attackHandlerRef.current?.();
    }

    // Exactly ONE set of listeners — cleaned up on unmount
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup",   handleKeyUp);
    window.addEventListener("blur",    handleBlur);
    canvas.addEventListener("click",   handleCanvasClick);

    // ── RAF Render Loop ───────────────────────────────────────────────────────
    let lastTime = null;
    let rafId    = null;

    function tick(timestamp) {
      const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;

      const currentPhase   = matchPhaseRef.current;
      const currentPlayers = playersRef.current || [];
      const currentMyId    = currentPlayerIdRef.current;
      const myPlayerObj    = currentPlayers.find((p) => p.id === currentMyId);
      const isAlive        = myPlayerObj?.alive !== false;
      const canMove        = (currentPhase === "playing" || currentPhase === "waiting") && isAlive;

      // Respawn trigger
      if (!isAlive && myPlayerObj?.respawn_at && !isRespawningRef.current) {
        const respawnTime = new Date(myPlayerObj.respawn_at).getTime();
        if (Date.now() >= respawnTime) {
          isRespawningRef.current = true;
          respawnPlayer().then((res) => {
            if (res && res.success) {
              const nx = Number(res.new_x);
              const ny = Number(res.new_y);
              pState.x = nx;
              pState.y = ny;
              serverAckPosRef.current     = { x: nx, y: ny, seq: syncSeqRef.current };
              latestDesiredPosRef.current = { x: nx, y: ny };
              lastSyncedPosRef.current    = { x: nx, y: ny };
              camera.snapTo(nx, ny);
              showToast("✨ RESPAWNED (Spawn Shield 1.5s)");
            }
          }).finally(() => {
            setTimeout(() => { isRespawningRef.current = false; }, 1000);
          });
        }
      }

      // ── 1. Move Local Player (Pure Client Prediction) ─────────────────────
      if (canMove) {
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

        const isMoving = dx !== 0 || dy !== 0;
        pState.isMoving = isMoving;

        if (isMoving) {
          lastMoveDirRef.current = { dx, dy };
          if (dx < -0.01) pState.facingLeft = true;
          if (dx >  0.01) pState.facingLeft = false;

          pState.x += dx * PLAYER_SPEED * dt;
          pState.y += dy * PLAYER_SPEED * dt;
          clampPlayer();

          pState.animTimer += dt;
          if (pState.animTimer >= 0.075) {
            pState.animTimer = 0;
            pState.animFrame = (pState.animFrame + 1) % 8;
          }

          // Keep latestDesiredPos updated every tick
          latestDesiredPosRef.current = { x: pState.x, y: pState.y };
        } else {
          pState.animFrame = 0;
        }
      } else {
        keys.up = keys.down = keys.left = keys.right = false;
        pState.isMoving = false;
      }

      // Camera smooth follow
      camera.follow(pState.x, pState.y, 1 - Math.exp(-12 * dt));

      const epochNow     = Date.now();
      const currentChannel = channelRef.current;
      const isShielded   = myPlayerObj?.shield_until && new Date(myPlayerObj.shield_until).getTime() > epochNow;

      // ── 2. Broadcast Position to Peers (~25 Hz) ────────────────────────────
      if (currentChannel && currentMyId && epochNow - lastBroadcastTimeRef.current >= BROADCAST_THROTTLE_MS) {
        const distMoved = Math.abs(pState.x - lastSentPosRef.current.x) + Math.abs(pState.y - lastSentPosRef.current.y);

        if (distMoved > 0.02 || isShielded || pState.isMoving) {
          currentChannel.send({
            type: "broadcast",
            event: "move",
            payload: {
              type: "move",
              playerId: currentMyId,
              x: Math.round(pState.x * 10) / 10,
              y: Math.round(pState.y * 10) / 10,
              isShielded: !!isShielded,
              hp: myPlayerObj?.hp ?? 100,
              alive: isAlive,
              colorKey: myPlayerObj?.color_key || "orange",
              isMoving: pState.isMoving,
              facingLeft: pState.facingLeft,
              animFrame: pState.animFrame,
              timestamp: epochNow,
            },
          });
          lastBroadcastTimeRef.current = epochNow;
          lastSentPosRef.current = { x: pState.x, y: pState.y };
        }
      }

      // ── 3. Authoritative DB Position Sync — Coalescing Queue ──────────────
      // performMovementSync handles rate-limiting and coalescing internally.
      // The RAF loop NEVER waits for this — it is fully fire-and-continue.
      performMovementSync(pState, epochNow, canMove);

      // ── 4. Coin Collection ─────────────────────────────────────────────────
      if (isCollectiblesActiveRef.current && currentPhase === "playing" && isAlive) {
        const activeCoins    = coinsRef.current || [];
        const pendingSet     = pendingCoinsRef.current;
        const collectRadius  = BASE_PLAYER_SIZE / 2 + COIN_RADIUS;

        for (let i = 0; i < activeCoins.length; i++) {
          const coin = activeCoins[i];
          if (!coin || !coin.active) continue;
          if (pendingSet.has(coin.id)) continue;

          const distance = Math.hypot(pState.x - Number(coin.x), pState.y - Number(coin.y));
          if (distance <= collectRadius) {
            pendingSet.add(coin.id);
            coin.active = false;

            // Coin collection does NOT modify pState or movement sync state.
            // The server validates collection distance independently.
            collectCoin(coin.id, currentMyId)
              .then((result) => {
                const now = performance.now();
                const pState = localPlayerStateRef.current;

                if (!result || !result.success) {
                  coin.active = true;
                } else {
                  if (result.collectible_type === "heal") {
                    const healAmt = typeof result.heal_amount === "number" ? result.heal_amount : (typeof result.heal_delta === "number" ? result.heal_delta : 0);
                    if (healAmt > 0) {
                      showToast(`💚 +${healAmt} HP HEALED!`);
                      visualEffectsRef.current.push({
                        id: `heal-${now}`,
                        type: "pickup_text",
                        x: pState.x,
                        y: pState.y - 25,
                        text: `+${healAmt} HP`,
                        color: "#4ade80",
                        glowColor: "#22c55e",
                        startTime: now,
                        duration: 0.85,
                      });
                    } else {
                      showToast(`💛 HEAL FULL`);
                      visualEffectsRef.current.push({
                        id: `hpfull-${now}`,
                        type: "pickup_text",
                        x: pState.x,
                        y: pState.y - 25,
                        text: "HEAL FULL",
                        color: "#facc15",
                        glowColor: "#f59e0b",
                        startTime: now,
                        duration: 0.85,
                      });
                    }
                  } else {
                    const delta = result.score_delta || 1;
                    const text = `+${delta}`;
                    const color = delta === 3 ? "#facc15" : delta === 2 ? "#4ade80" : "#fef08a";
                    const glow = delta === 3 ? "#f59e0b" : delta === 2 ? "#10b981" : "#eab308";

                    visualEffectsRef.current.push({
                      id: `coin-${now}`,
                      type: "pickup_text",
                      x: pState.x,
                      y: pState.y - 25,
                      text,
                      color,
                      glowColor: glow,
                      startTime: now,
                      duration: 0.75,
                    });
                  }
                }
                pendingSet.delete(coin.id);
              })
              .catch(() => {
                coin.active = true;
                pendingSet.delete(coin.id);
              });
          }
        }
      }

      // ── 5. RENDER CANVAS (HD Arena Floor & Environment) ─────────────────
      drawArena(ctx, camera, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, timestamp);

      // ── 6. Draw Active Coins & Collectibles ──────────────────────────────
      const activeCoins = coinsRef.current || [];
      for (let i = 0; i < activeCoins.length; i++) {
        const coin = activeCoins[i];
        if (coin && coin.active && camera.isVisible(Number(coin.x), Number(coin.y), 20)) {
          const s = camera.worldToScreen(Number(coin.x), Number(coin.y));
          drawCoin(ctx, s.x, s.y, COIN_RADIUS, timestamp, coin.coin_type || "coin_1");
        }
      }

      // ── 7. Draw Combat Effects ────────────────────────────────────────────
      const screenFx = visualEffectsRef.current.map((fx) => {
        const s = camera.worldToScreen(fx.x, fx.y);
        return { ...fx, x: s.x, y: s.y };
      });
      drawCombatEffects(ctx, screenFx, timestamp);
      visualEffectsRef.current = visualEffectsRef.current.filter(
        (fx) => (timestamp - fx.startTime) / 1000 < fx.duration
      );

      // ── 8. Find Leader ────────────────────────────────────────────────────
      const highestScore = currentPlayers.reduce((max, p) => Math.max(max, p.score ?? 0), 0);

      // ── 9. Draw Remote Players (Delta-time Interpolated) ──────────────────
      const remotes = remotePlayersRef.current;
      const remoteSmoothing = 1 - Math.exp(-18 * dt);

      // Sync remote player map with active players from DB
      const activeRemoteIds = new Set();
      for (let i = 0; i < currentPlayers.length; i++) {
        const p = currentPlayers[i];
        if (!p || p.id === currentMyId) continue;
        activeRemoteIds.add(p.id);

        if (!remotes[p.id]) {
          remotes[p.id] = {
            x: typeof p.x === "number" ? Number(p.x) : 1000,
            y: typeof p.y === "number" ? Number(p.y) : 600,
            targetX: typeof p.x === "number" ? Number(p.x) : 1000,
            targetY: typeof p.y === "number" ? Number(p.y) : 600,
            lastUpdated: 0,
            isShielded: false,
            hp: p.hp ?? 100,
            alive: p.alive !== false,
            colorKey: p.color_key || "purple",
            isMoving: false,
            facingLeft: false,
            animFrame: 0,
          };
        } else if (epochNow - (remotes[p.id].lastUpdated || 0) > 1500) {
          // Idle remote: sync target from authoritative DB snapshot (monotonic only)
          if (typeof p.x === "number") remotes[p.id].targetX = Number(p.x);
          if (typeof p.y === "number") remotes[p.id].targetY = Number(p.y);
        }
      }

      // Cleanup disconnected peers
      for (const rId of Object.keys(remotes)) {
        if (!activeRemoteIds.has(rId)) delete remotes[rId];
      }

      // Interpolate and draw remote players
      for (const [remoteId, remoteData] of Object.entries(remotes)) {
        remoteData.x += (remoteData.targetX - remoteData.x) * remoteSmoothing;
        remoteData.y += (remoteData.targetY - remoteData.y) * remoteSmoothing;

        if (camera.isVisible(remoteData.x, remoteData.y, 50)) {
          const s = camera.worldToScreen(remoteData.x, remoteData.y);
          const remoteObj = currentPlayers.find((p) => p.id === remoteId);
          const rScore    = remoteObj?.score ?? 0;
          const rHp       = remoteObj?.hp ?? remoteData.hp ?? 100;
          const rAlive    = remoteObj ? remoteObj.alive : remoteData.alive;
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
            isMoving: remoteData.isMoving,
            facingLeft: remoteData.facingLeft,
            animFrame: remoteData.animFrame,
          });
        }
      }

      // ── 10. Draw Local Player ─────────────────────────────────────────────
      const myScreen  = camera.worldToScreen(pState.x, pState.y);
      const myScore   = myPlayerObj?.score ?? 0;
      const myHp      = myPlayerObj?.hp ?? 100;
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
        isMoving: pState.isMoving,
        facingLeft: pState.facingLeft,
        animFrame: pState.animFrame,
      });

      // ── 11. Minimap Radar ─────────────────────────────────────────────────
      const miniW = 160;
      const miniH = 96;
      const miniX = VIEWPORT_WIDTH  - miniW - 14;
      const miniY = VIEWPORT_HEIGHT - miniH - 14;

      ctx.save();
      ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
      ctx.fillRect(miniX, miniY, miniW, miniH);
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(miniX, miniY, miniW, miniH);

      const scaleX = miniW / WORLD_WIDTH;
      const scaleY = miniH / WORLD_HEIGHT;

      ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        miniX + camera.x * scaleX,
        miniY + camera.y * scaleY,
        VIEWPORT_WIDTH  * scaleX,
        VIEWPORT_HEIGHT * scaleY
      );

      ctx.fillStyle = "#eab308";
      for (const coin of activeCoins) {
        if (coin.active) {
          ctx.fillRect(miniX + coin.x * scaleX - 1, miniY + coin.y * scaleY - 1, 2, 2);
        }
      }

      for (const [rId, rData] of Object.entries(remotes)) {
        const rObj = currentPlayers.find((p) => p.id === rId);
        const palette = getPlayerPalette(rObj?.color_key || "purple");
        ctx.fillStyle = palette.body;
        ctx.beginPath();
        ctx.arc(miniX + rData.x * scaleX, miniY + rData.y * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const myPal = getPlayerPalette(myColorKey);
      ctx.fillStyle = myPal.body;
      ctx.beginPath();
      ctx.arc(miniX + pState.x * scaleX, miniY + pState.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // ── 11.5. Low HP State ────────────────────────────────────────────────
      if (isAlive && myHp > 0 && myHp <= 25) {
        ctx.save();
        const pulse = Math.abs(Math.sin(epochNow / 200));
        ctx.fillStyle = `rgba(239, 68, 68, ${0.1 + pulse * 0.15})`;
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.restore();
      }

      // ── 12. Waiting Phase Overlay ─────────────────────────────────────────
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

      // ── 13. Countdown Overlay ─────────────────────────────────────────────
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

    // Start exactly ONE RAF loop
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup",   handleKeyUp);
      window.removeEventListener("blur",    handleBlur);
      canvas.removeEventListener("click",   handleCanvasClick);
    };
  }, []); // Empty deps: engine runs exactly once per mount

  return (
    <div className="relative w-full h-full bg-[#0d0d0f]">
      <canvas
        ref={canvasRef}
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
        className="outline-none cursor-crosshair"
        tabIndex={0}
        aria-label="Pixel Arena Viewport"
      />

      {/* Combat toast — flat bar */}
      {combatNotification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 bg-[#1c1c21] border border-[#f5a623] text-[#f5a623] font-mono font-bold text-xs state-in">
          {combatNotification}
        </div>
      )}

      {/* Kill Feed */}
      <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-1 pointer-events-none">
        {killFeed.map((kf) => {
          const killer = players.find(p => p.id === kf.killerId);
          const victim = players.find(p => p.id === kf.targetId);
          if (!killer || !victim) return null;
          return (
            <div key={kf.id} className="bg-black/60 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-white border border-[#3f3f46] state-in flex items-center gap-2 shadow-lg">
              <span style={{ color: getPlayerPalette(killer.color_key).body }}>{killer.nickname}</span>
              <span className="text-[#a0a0a8]">⚔</span>
              <span style={{ color: getPlayerPalette(victim.color_key).body }}>{victim.nickname}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
