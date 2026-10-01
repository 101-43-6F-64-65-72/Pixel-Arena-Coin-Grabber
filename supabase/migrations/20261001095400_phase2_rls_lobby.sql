-- Migration: Phase 2 RLS additions — UPDATE/DELETE policies for leave room & host transfer
-- Project: Pixel Arena: Coin Grabber
-- Phase 2 Room/Lobby Foundation

-- ─── rooms: Allow UPDATE for host_id and status (narrowly scoped) ─────────────
-- Needed for: host transfer when a host leaves, room cleanup.
-- Scope: Any anon/authenticated client can update a room's host_id or status.
-- Risk documented: In a future phase with player auth, this should be tightened
--   to only allow the room host to update the room. For the current no-auth MVP
--   this is the minimum required.
CREATE POLICY "allow_update_rooms_host_status"
    ON rooms
    FOR UPDATE
    TO anon, authenticated
    USING (status = 'waiting')
    WITH CHECK (status IN ('waiting', 'playing', 'finished'));

-- ─── players: Allow DELETE for a specific player (leave room) ─────────────────
-- Needed for: A player leaving the lobby removes their own row.
-- Scope: Any anon/authenticated client can delete any player row.
-- Risk documented: Without auth, we cannot restrict to "own player only".
--   In a future auth phase, this USING clause should become:
--   USING (id = auth.uid()::uuid) or similar row-ownership check.
CREATE POLICY "allow_delete_players"
    ON players
    FOR DELETE
    TO anon, authenticated
    USING (true);
