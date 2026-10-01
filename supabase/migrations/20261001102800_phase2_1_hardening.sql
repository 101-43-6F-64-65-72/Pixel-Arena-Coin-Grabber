-- Migration: Phase 2.1 — RPC functions for atomic join/leave + RLS hardening
-- Project: Pixel Arena: Coin Grabber
-- Phase 2.1 Lobby Hardening

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: join_room_safe
-- ─────────────────────────────────────────────────────────────────────────────
-- Atomically joins a room by code.
-- Runs in a single transaction. Acquires an advisory lock keyed on the room id
-- (bigint hash) to prevent simultaneous inserts from racing past the capacity
-- check.
--
-- Returns the inserted player row (all columns).
-- Raises an exception with a user-readable message on any violation.
--
-- SECURITY INVOKER: runs with the caller's (anon) privileges.
-- The function only reads rooms (SELECT allowed by RLS) and inserts players
-- (INSERT allowed by RLS with score=0 check).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION join_room_safe(
    p_code     TEXT,
    p_nickname TEXT
)
RETURNS SETOF players
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_room      rooms%ROWTYPE;
    v_count     INTEGER;
    v_player    players%ROWTYPE;
    v_lock_key  BIGINT;
BEGIN
    -- 1. Normalise inputs
    p_code     := trim(upper(p_code));
    p_nickname := trim(p_nickname);

    -- 2. Validate nickname length (mirrors DB constraint)
    IF char_length(p_nickname) = 0 THEN
        RAISE EXCEPTION 'Nickname is required.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_nickname) > 30 THEN
        RAISE EXCEPTION 'Nickname is too long (max 30 characters).' USING ERRCODE = 'P0001';
    END IF;

    -- 3. Find the room
    SELECT * INTO v_room FROM rooms WHERE code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room "%" not found. Check the code and try again.', p_code
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Validate room status
    IF v_room.status = 'playing' THEN
        RAISE EXCEPTION 'This room is already in a game. You cannot join now.'
            USING ERRCODE = 'P0003';
    END IF;
    IF v_room.status = 'finished' THEN
        RAISE EXCEPTION 'This game has already finished.'
            USING ERRCODE = 'P0003';
    END IF;

    -- 5. Acquire a session-level advisory lock keyed to this room's id.
    --    This serialises concurrent join attempts for the same room without
    --    locking the entire players table.
    --    The lock is released automatically at the end of the transaction.
    v_lock_key := ('x' || substr(replace(v_room.id::text, '-', ''), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 6. Count current players (inside lock — now safe from race)
    SELECT COUNT(*) INTO v_count FROM players WHERE room_id = v_room.id;
    IF v_count >= 4 THEN
        RAISE EXCEPTION 'This room is full (4/4 players). Please find another room.'
            USING ERRCODE = 'P0004';
    END IF;

    -- 7. Insert the player
    INSERT INTO players (room_id, nickname, score)
    VALUES (v_room.id, p_nickname, 0)
    RETURNING * INTO v_player;

    -- 8. Return the inserted row
    RETURN NEXT v_player;
    RETURN;
END;
$$;

-- Grant EXECUTE to anon and authenticated roles
GRANT EXECUTE ON FUNCTION join_room_safe(TEXT, TEXT) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: leave_room_safe
-- ─────────────────────────────────────────────────────────────────────────────
-- Safely removes a player from their room, then:
--   • If other players remain and the leaving player was the host,
--     transfers host ownership to the player who joined earliest.
--   • If no players remain, deletes the room
--     (CASCADE removes any coins belonging to it).
--
-- SECURITY DEFINER: runs with the function owner's (postgres) privileges so
-- it can DELETE the specific player row WITHOUT requiring a broad
-- DELETE USING (true) policy on the players table.
-- The invoker only needs EXECUTE on this function — direct DELETE is removed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION leave_room_safe(
    p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
-- Restrict search_path to prevent search-path injection
SET search_path = public
AS $$
DECLARE
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_new_host  UUID;
    v_remaining INTEGER;
BEGIN
    -- 1. Fetch the player (confirm they exist)
    SELECT * INTO v_player FROM players WHERE id = p_player_id;
    IF NOT FOUND THEN
        -- Already gone — treat as success (idempotent)
        RETURN;
    END IF;

    -- 2. Fetch the room
    SELECT * INTO v_room FROM rooms WHERE id = v_player.room_id;

    -- 3. Delete the player
    DELETE FROM players WHERE id = p_player_id;

    -- 4. Count remaining players
    SELECT COUNT(*) INTO v_remaining FROM players WHERE room_id = v_player.room_id;

    IF v_remaining = 0 THEN
        -- 5a. No players left — delete the room (cascade removes coins)
        DELETE FROM rooms WHERE id = v_player.room_id;
    ELSE
        -- 5b. Players remain — check if we need to transfer host
        IF v_room.host_id = p_player_id THEN
            -- Assign host to the player who joined earliest
            SELECT id INTO v_new_host
            FROM players
            WHERE room_id = v_player.room_id
            ORDER BY joined_at ASC
            LIMIT 1;

            IF v_new_host IS NOT NULL THEN
                UPDATE rooms SET host_id = v_new_host WHERE id = v_player.room_id;
            END IF;
        END IF;
    END IF;
END;
$$;

-- Grant EXECUTE to anon and authenticated roles
GRANT EXECUTE ON FUNCTION leave_room_safe(UUID) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICY CHANGES
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the unsafe broad DELETE policy on players.
-- Direct DELETE is no longer needed — leave_room_safe (SECURITY DEFINER)
-- handles all player deletions.
DROP POLICY IF EXISTS "allow_delete_players" ON players;

-- Remove the broad UPDATE policy on rooms (host transfer now in RPC).
-- Direct UPDATE from the client is no longer needed.
DROP POLICY IF EXISTS "allow_update_rooms_host_status" ON rooms;

-- Direct INSERT on players is still used by createRoom (host player creation).
-- join_room_safe also inserts, but it runs as SECURITY INVOKER so the INSERT
-- policy must remain active.
-- allow_insert_players (score = 0) is kept unchanged.

-- Note: createRoom still uses direct table INSERT/UPDATE because it is a
-- multi-step operation (room → player → set host_id). A future phase may
-- wrap this in an RPC too. For now the remaining UPDATE on rooms.host_id
-- is re-added with tighter scope: only allow setting host_id when the
-- current host_id IS NULL (fresh room before first host assignment).
CREATE POLICY "allow_set_initial_host"
    ON rooms
    FOR UPDATE
    TO anon, authenticated
    USING (host_id IS NULL)
    WITH CHECK (host_id IS NOT NULL);
