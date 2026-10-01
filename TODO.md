# Roadmap: Pixel Arena: Coin Grabber

## Phase 1: Project setup, basic UI layout, and arena foundation.
- [x] Initialize Next.js App Router project with Tailwind CSS.
- [x] Create project documentation (`README.md`, `GAME_DESIGN.md`, `ARCHITECTURE.md`, `AGENTS.md`, `TODO.md`, `CHANGELOG.md`).
- [ ] Define folder structure (components, lib, etc.).
- [ ] Create basic empty UI layout for main menu and arena.

## Phase 2: Single-player movement.
- [x] Implement local HTML5 Canvas/DOM rendering for the arena.
- [x] Implement local player entity.
- [x] Implement keyboard controls for moving the local player.
- [x] Prevent player from moving outside the arena boundaries.

## Phase 3: Supabase integration and room management.
- [x] Set up Supabase project and configuration variables.
- [x] Create PostgreSQL tables (Rooms, Players, Coins) with constraints and RLS.
- [x] Implement Main Menu UI.
- [x] Implement "Create Room" functionality.
- [x] Implement "Join Room" functionality.
- [x] Implement Lobby UI showing connected players (using Supabase Realtime Postgres Changes).

## Phase 4: Realtime multiplayer synchronization.
- [x] Connect local player movement to Supabase Broadcast.
- [x] Listen to Supabase Broadcast to update remote player positions in the arena.
- [x] Ensure smooth movement and handle disconnects.

## Phase 5: Coin synchronization, scoring, timer, and leaderboard.
- [x] Create PostgreSQL table (Coins, Scores).
- [x] Implement server/database logic for coin spawning (`ensure_room_coins` RPC).
- [x] Implement client-side collision detection with coins.
- [x] Implement secure coin collection via PostgreSQL (`collect_coin_safe` RPC).
- [x] Listen to database changes for coin despawns and score updates (Supabase Realtime Postgres Changes).
- [x] Implement match timer (authoritative DB-driven 60s timer with 3s countdown).
- [x] Implement Game Over state and final score results display.

## Phase 6: UI polish, debugging, and testing.
- [x] Integrate Supabase Anonymous Auth and verified player identity (`players.user_id = auth.uid()`).
- [x] Hardened RPCs against player impersonation (`join_room_safe`, `leave_room_safe`, `start_match_safe`, `collect_coin_safe`, `finish_match_safe`).
- [x] Implement authoritative player position in database (`players.x`, `players.y`, `players.position_updated_at`).
- [x] Implement server-side movement speed and anti-teleport validation (`update_player_position_safe` RPC).
- [x] Implement server-side distance validation for coin collection in `collect_coin_safe`.
- [x] Polish UI (Main Menu, Lobby, HUD, Leaderboard, Countdown, Timer).
- [x] Implement strict state-based input locking (waiting, countdown, playing, finished).
- [x] Implement client reconciliation and optimistic coin collection rollback on server rejection.
- [x] Perform comprehensive multiplayer testing with multiple browser sessions.
- [x] Fix synchronization bugs and edge cases (reconnection, tab focus, host disconnect).

## Phase 7: Worms Zone / Agar.io PvP Battle Royale & Map Expansion
- [x] Expanded arena dimensions from 700x440 to 1200x750 high-definition logical battleground.
- [x] Increased coin density to 45 concurrent coins with dynamic auto-replenishment upon collection.
- [x] Extended match duration to 5 minutes (300s match timer + 3s countdown = 303s authoritative cycle).
- [x] Worms Zone / Agar.io style character growth: Player radius grows dynamically based on collected score (`diameter = 32 + sqrt(score)*4.2`).
- [x] Authoritative PvP Combat & Elimination: Larger players can eat/eliminate smaller players upon contact, transferring 50% score and respawning the victim (`eliminate_player_safe` RPC).
- [x] Real-time live HUD Leaderboard with dynamic ranks, gold crown (#1), silver (#2), bronze (#3) badges, and real-time score updates.
- [x] Resilient auth fallback handling (guest signup fallback if Anonymous Auth toggle is off in dashboard).

## Phase 8: Character Skills, Opponent Disruption & Skill Gacha System
- [x] Implemented Active Skills Catalog (`src/lib/skills.js`):
  - ⚡ **Hyper Dash** (`SPACE`): +150% speed boost with trailing particle visual effects.
  - ❄️ **Frost Nova** (`Q`): Emits a 220px cryogenic shockwave stunning opponents for 1.8s.
  - 🧲 **Coin Vortex / Magnet** (`E`): Gravitational vacuum pulling all coins within 260px directly to character.
  - 🛡️ **Aegis Shield** (`F`): Golden invulnerability bubble protecting from predators and stuns.
  - 💨 **Smoke Bomb** (`R`): Drops a tactical smoke cloud slowing opponents by 60%.
- [x] Implemented Skill Gacha System (`src/components/SkillBar.js`) with randomized roll animation, tier rankings (Common, Rare, Legendary), and equipment slot customization.
- [x] Arena Mystery Skill Orbs (🎁): Pulsing mystery crates scattered across arena providing free random skill rolls on contact with 14s auto-respawn.
- [x] Realtime Multiplayer Status FX Sync: Peer shockwaves, frozen ice cages, shield bubbles, and dash trails synchronized via Supabase Realtime Broadcast.

## Phase 10: RoyalWar Multiplayer Combat Arena, 2000x1200 World & Server-Validated Skills
- [x] Deterministic Player Color Identity (`players.color_key`): Server-allocated palette (`orange`, `purple`, `blue`, `green`) across rooms, race-safe via advisory locks.
- [x] Large World & Camera Viewport: `2000 x 1200` world with smooth player-following camera and boundary clamping.
- [x] Authoritative PvP Combat & Basic Attack: `attack_player_safe` RPC dealing 20 HP damage within 90px range with shield blocking and kill tracking.
- [x] Three Server-Validated Skills:
  - ⚡ **Dash** (`use_dash_safe`): Server-validated 190px displacement (4s CD).
  - 🛡️ **Shield** (`use_shield_safe`): 2.0s invulnerability barrier (8s CD).
  - 💥 **Shockwave** (`use_shockwave_safe`): 170px area burst dealing 25 DMG to nearby enemies (7s CD).
- [x] Authoritative HP, Death & Respawn: `hp`, `max_hp`, `alive`, `deaths`, `kills`, and `respawn_player_safe` RPC with 3s timer and spawn protection.
- [x] Continuous / Infinite Coin Replenishment: Bounded active pool with instant location recycling upon collection.
- [x] Multiplayer Realtime Sync & Combat FX: Melee slashes, floating damage numbers, shockwaves, shield spheres, and minimap radar.
- [x] Upgraded Arena HUD: Health bar, Kills/Deaths counters, skill buttons with cooldowns, and color-coded leaderboard.

## Phase 11: Vercel deployment.
- [ ] Deploy project to Vercel.
- [ ] Configure environment variables in Vercel.
- [ ] Verify live functionality.




