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

## Phase 7: Vercel deployment.
- [ ] Deploy project to Vercel.
- [ ] Configure environment variables in Vercel.
- [ ] Verify live functionality.

