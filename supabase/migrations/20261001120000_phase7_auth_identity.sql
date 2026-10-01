-- Migration: Phase 7 — Supabase Auth + Verified Player Identity
-- Project: Pixel Arena: Coin Grabber

-- 1. Add user_id column to players table referencing auth.users
ALTER TABLE players
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add partial unique index: one player entry per user per room
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_room_user
ON players (room_id, user_id)
WHERE user_id IS NOT NULL;

-- 3. Update RLS policy for player creation to enforce user_id binding
DROP POLICY IF EXISTS "allow_insert_players" ON players;
CREATE POLICY "allow_insert_players"
    ON players
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (score = 0 AND (user_id IS NULL OR user_id = auth.uid()));

-- 4. RPC: create_room_safe
-- Atomically creates a room and the host player bound to auth.uid()
CREATE OR REPLACE FUNCTION create_room_safe(
    p_nickname TEXT
)
RETURNS TABLE (
    room_id   UUID,
    room_code TEXT,
    player_id UUID,
    nickname  TEXT,
    user_id   UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_code      TEXT;
    v_room      rooms%ROWTYPE;
    v_player    players%ROWTYPE;
    v_chars     TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_attempt   INTEGER;
    v_i         INTEGER;
BEGIN
    -- 1. Normalise nickname
    p_nickname := trim(p_nickname);
    IF char_length(p_nickname) = 0 THEN
        RAISE EXCEPTION 'Nickname is required.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_nickname) > 30 THEN
        RAISE EXCEPTION 'Nickname is too long (max 30 characters).' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Derive authenticated user_id
    v_user_id := auth.uid();

    -- 3. Generate unique room code (up to 5 attempts)
    FOR v_attempt IN 1..5 LOOP
        v_code := '';
        FOR v_i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
        END LOOP;

        BEGIN
            INSERT INTO rooms (code, status)
            VALUES (v_code, 'waiting')
            RETURNING * INTO v_room;
            EXIT; -- Success
        EXCEPTION WHEN unique_violation THEN
            IF v_attempt = 5 THEN
                RAISE EXCEPTION 'Could not generate unique room code. Please try again.' USING ERRCODE = 'P0002';
            END IF;
        END;
    END LOOP;

    -- 4. Create host player row bound to auth.uid()
    INSERT INTO players (room_id, nickname, score, user_id)
    VALUES (v_room.id, p_nickname, 0, v_user_id)
    RETURNING * INTO v_player;

    -- 5. Set host_id on the room
    UPDATE rooms r
    SET host_id = v_player.id
    WHERE r.id = v_room.id;

    RETURN QUERY
    SELECT v_room.id, v_room.code, v_player.id, v_player.nickname, v_player.user_id;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION create_room_safe(TEXT) TO anon, authenticated;


-- 5. RPC: join_room_safe (hardened with auth.uid())
CREATE OR REPLACE FUNCTION join_room_safe(
    p_code     TEXT,
    p_nickname TEXT
)
RETURNS SETOF players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_room      rooms%ROWTYPE;
    v_count     INTEGER;
    v_player    players%ROWTYPE;
    v_lock_key  BIGINT;
BEGIN
    -- 1. Normalise inputs
    p_code     := trim(upper(p_code));
    p_nickname := trim(p_nickname);
    v_user_id  := auth.uid();

    -- 2. Validate nickname length
    IF char_length(p_nickname) = 0 THEN
        RAISE EXCEPTION 'Nickname is required.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_nickname) > 30 THEN
        RAISE EXCEPTION 'Nickname is too long (max 30 characters).' USING ERRCODE = 'P0001';
    END IF;

    -- 3. Find the room
    SELECT * INTO v_room FROM rooms r WHERE r.code = p_code;
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

    -- 5. If user already in this room, return existing player row (idempotent reconnect)
    IF v_user_id IS NOT NULL THEN
        SELECT * INTO v_player FROM players p WHERE p.room_id = v_room.id AND p.user_id = v_user_id;
        IF FOUND THEN
            RETURN NEXT v_player;
            RETURN;
        END IF;
    END IF;

    -- 6. Acquire advisory lock keyed to this room
    v_lock_key := ('x' || substr(replace(v_room.id::text, '-', ''), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 7. Count current players
    SELECT COUNT(*) INTO v_count FROM players p WHERE p.room_id = v_room.id;
    IF v_count >= 4 THEN
        RAISE EXCEPTION 'This room is full (4/4 players). Please find another room.'
            USING ERRCODE = 'P0004';
    END IF;

    -- 8. Insert the player with user_id = auth.uid()
    INSERT INTO players (room_id, nickname, score, user_id)
    VALUES (v_room.id, p_nickname, 0, v_user_id)
    RETURNING * INTO v_player;

    RETURN NEXT v_player;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION join_room_safe(TEXT, TEXT) TO anon, authenticated;


-- 6. RPC: leave_room_safe (hardened with auth.uid() verification)
CREATE OR REPLACE FUNCTION leave_room_safe(
    p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_new_host  UUID;
    v_remaining INTEGER;
BEGIN
    v_user_id := auth.uid();

    -- 1. Fetch player
    SELECT * INTO v_player FROM players WHERE id = p_player_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 2. Verify caller ownership if user_id is set
    IF v_player.user_id IS NOT NULL AND v_user_id IS NOT NULL AND v_player.user_id <> v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only remove your own player record.' USING ERRCODE = '42501';
    END IF;

    -- 3. Fetch room
    SELECT * INTO v_room FROM rooms WHERE id = v_player.room_id;

    -- 4. Delete the player
    DELETE FROM players WHERE id = p_player_id;

    -- 5. Count remaining players
    SELECT COUNT(*) INTO v_remaining FROM players WHERE room_id = v_player.room_id;

    IF v_remaining = 0 THEN
        DELETE FROM rooms WHERE id = v_player.room_id;
    ELSE
        IF v_room.host_id = p_player_id THEN
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

GRANT EXECUTE ON FUNCTION leave_room_safe(UUID) TO anon, authenticated;


-- 7. RPC: start_match_safe (hardened with auth.uid() verification)
CREATE OR REPLACE FUNCTION start_match_safe(
    p_room_id   UUID,
    p_player_id UUID DEFAULT NULL
)
RETURNS TABLE (
    success    BOOLEAN,
    room_id    UUID,
    started_at TIMESTAMPTZ,
    message    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id     UUID;
    v_room        rooms%ROWTYPE;
    v_host_player players%ROWTYPE;
    v_count       INTEGER;
    v_started_at  TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();

    -- 1. Find and lock room row
    SELECT * INTO v_room
    FROM rooms r
    WHERE r.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Room not found.'::TEXT;
        RETURN;
    END IF;

    -- 2. Validate room status is waiting
    IF v_room.status <> 'waiting' THEN
        RETURN QUERY SELECT false, p_room_id, v_room.started_at, 'Match has already started or finished.'::TEXT;
        RETURN;
    END IF;

    -- 3. Fetch host player
    SELECT * INTO v_host_player FROM players p WHERE p.id = v_room.host_id;

    -- 4. Verify host authorization via auth.uid()
    IF v_user_id IS NOT NULL AND v_host_player.user_id IS NOT NULL THEN
        IF v_host_player.user_id <> v_user_id THEN
            RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Unauthorized: Only the room host can start the match.'::TEXT;
            RETURN;
        END IF;
    ELSIF p_player_id IS NOT NULL AND v_room.host_id <> p_player_id THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Unauthorized: Only the room host can start the match.'::TEXT;
        RETURN;
    END IF;

    -- 5. Validate player count
    SELECT COUNT(*) INTO v_count FROM players p WHERE p.room_id = p_room_id;
    IF v_count < 1 THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Not enough players to start match.'::TEXT;
        RETURN;
    END IF;

    -- 6. Ensure coins exist
    PERFORM ensure_room_coins(p_room_id, 15);

    -- 7. Atomically start match
    v_started_at := now();
    UPDATE rooms r
    SET status = 'playing',
        started_at = v_started_at
    WHERE r.id = p_room_id;

    RETURN QUERY SELECT true, p_room_id, v_started_at, 'Match started successfully.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION start_match_safe(UUID, UUID) TO anon, authenticated;


-- 8. RPC: collect_coin_safe (hardened: derives player from auth.uid())
CREATE OR REPLACE FUNCTION collect_coin_safe(
    p_coin_id   UUID,
    p_player_id UUID DEFAULT NULL
)
RETURNS TABLE (
    success   BOOLEAN,
    coin_id   UUID,
    player_id UUID,
    room_id   UUID,
    new_score INTEGER,
    message   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_coin    coins%ROWTYPE;
    v_player  players%ROWTYPE;
    v_room    rooms%ROWTYPE;
    v_score   INTEGER;
BEGIN
    v_user_id := auth.uid();

    -- 1. Find and lock the coin row
    SELECT * INTO v_coin
    FROM coins c
    WHERE c.id = p_coin_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, NULL::UUID, 0, 'Coin not found.'::TEXT;
        RETURN;
    END IF;

    -- 2. Verify coin is active
    IF NOT v_coin.active THEN
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 0, 'Coin already collected.'::TEXT;
        RETURN;
    END IF;

    -- 3. Find and lock the player row (derived from auth.uid() if authenticated)
    IF v_user_id IS NOT NULL THEN
        SELECT * INTO v_player
        FROM players p
        WHERE p.room_id = v_coin.room_id AND p.user_id = v_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 0, 'Unauthorized: Player not in this room.'::TEXT;
            RETURN;
        END IF;
    ELSIF p_player_id IS NOT NULL THEN
        SELECT * INTO v_player
        FROM players p
        WHERE p.id = p_player_id
        FOR UPDATE;

        IF NOT FOUND OR v_player.room_id <> v_coin.room_id THEN
            RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, 0, 'Unauthorized: Player not in this room.'::TEXT;
            RETURN;
        END IF;
    ELSE
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 0, 'Unauthorized: Authentication required.'::TEXT;
        RETURN;
    END IF;

    -- 4. Verify room status is playing and countdown has elapsed
    SELECT * INTO v_room FROM rooms r WHERE r.id = v_coin.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Game is not in playing state.'::TEXT;
        RETURN;
    END IF;

    -- Reject collection during 3-second countdown
    IF v_room.started_at IS NOT NULL AND now() < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Cannot collect coins during countdown.'::TEXT;
        RETURN;
    END IF;

    -- Reject collection after 63 seconds
    IF v_room.started_at IS NOT NULL AND now() > (v_room.started_at + interval '63 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    -- 5. Atomically deactivate coin and increment score
    UPDATE coins c
    SET active = false
    WHERE c.id = p_coin_id;

    UPDATE players p
    SET score = score + 1
    WHERE p.id = v_player.id
    RETURNING score INTO v_score;

    RETURN QUERY
    SELECT true, p_coin_id, v_player.id, v_coin.room_id, v_score, 'Coin collected successfully.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION collect_coin_safe(UUID, UUID) TO anon, authenticated;


-- 9. RPC: finish_match_safe (hardened with participant validation)
CREATE OR REPLACE FUNCTION finish_match_safe(
    p_room_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    room_id UUID,
    status  TEXT,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_room    rooms%ROWTYPE;
BEGIN
    v_user_id := auth.uid();

    -- 1. Find and lock room row
    SELECT * INTO v_room
    FROM rooms r
    WHERE r.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_room_id, ''::TEXT, 'Room not found.'::TEXT;
        RETURN;
    END IF;

    -- 2. Validate current status
    IF v_room.status = 'finished' THEN
        RETURN QUERY SELECT true, p_room_id, 'finished'::TEXT, 'Match is already finished.'::TEXT;
        RETURN;
    END IF;

    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Match is not in playing state.'::TEXT;
        RETURN;
    END IF;

    -- 3. Verify that caller is a participant in this room if authenticated
    IF v_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM players p WHERE p.room_id = p_room_id AND p.user_id = v_user_id) THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Unauthorized: You are not a player in this room.'::TEXT;
        RETURN;
    END IF;

    -- 4. Verify match duration has actually elapsed (63s)
    IF v_room.started_at IS NULL OR now() < (v_room.started_at + interval '63 seconds') THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Match duration has not elapsed yet.'::TEXT;
        RETURN;
    END IF;

    -- 5. Atomically change status to finished
    UPDATE rooms r
    SET status = 'finished'
    WHERE r.id = p_room_id;

    RETURN QUERY SELECT true, p_room_id, 'finished'::TEXT, 'Match finished successfully.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION finish_match_safe(UUID) TO anon, authenticated;
