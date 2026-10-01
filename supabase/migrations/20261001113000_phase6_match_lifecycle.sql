-- Migration: Phase 6 — Match Lifecycle + Countdown + Timer + Game Over
-- Project: Pixel Arena: Coin Grabber

-- 1. RPC: start_match_safe
CREATE OR REPLACE FUNCTION start_match_safe(
    p_room_id   UUID,
    p_player_id UUID
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
    v_room       rooms%ROWTYPE;
    v_count      INTEGER;
    v_started_at TIMESTAMPTZ;
BEGIN
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

    -- 3. Validate requesting player is the room host
    IF v_room.host_id IS NULL OR v_room.host_id <> p_player_id THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Only the room host can start the match.'::TEXT;
        RETURN;
    END IF;

    -- 4. Validate player count (at least 1 player)
    SELECT COUNT(*) INTO v_count FROM players p WHERE p.room_id = p_room_id;
    IF v_count < 1 THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Not enough players to start match.'::TEXT;
        RETURN;
    END IF;

    -- 5. Ensure coins exist for the room
    PERFORM ensure_room_coins(p_room_id, 15);

    -- 6. Atomically update room status and started_at
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


-- 2. RPC: finish_match_safe
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
    v_room rooms%ROWTYPE;
BEGIN
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

    -- 3. Verify match duration has actually elapsed (63 seconds: 3s countdown + 60s gameplay)
    IF v_room.started_at IS NULL OR now() < (v_room.started_at + interval '63 seconds') THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Match duration has not elapsed yet.'::TEXT;
        RETURN;
    END IF;

    -- 4. Atomically change status to finished
    UPDATE rooms r
    SET status = 'finished'
    WHERE r.id = p_room_id;

    RETURN QUERY SELECT true, p_room_id, 'finished'::TEXT, 'Match finished successfully.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION finish_match_safe(UUID) TO anon, authenticated;


-- 3. Update collect_coin_safe to enforce countdown and match end lifecycle rules
CREATE OR REPLACE FUNCTION collect_coin_safe(
    p_coin_id   UUID,
    p_player_id UUID
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
    v_coin   coins%ROWTYPE;
    v_player players%ROWTYPE;
    v_room   rooms%ROWTYPE;
    v_score  INTEGER;
BEGIN
    -- 1. Find and lock the coin row
    SELECT * INTO v_coin
    FROM coins c
    WHERE c.id = p_coin_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, NULL::UUID, 0, 'Coin not found.'::TEXT;
        RETURN;
    END IF;

    -- 2. Verify coin is active
    IF NOT v_coin.active THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, 0, 'Coin already collected.'::TEXT;
        RETURN;
    END IF;

    -- 3. Find and lock the player row
    SELECT * INTO v_player
    FROM players p
    WHERE p.id = p_player_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, 0, 'Player not found.'::TEXT;
        RETURN;
    END IF;

    -- 4. Verify player and coin belong to the same room
    IF v_coin.room_id <> v_player.room_id THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, v_player.score, 'Player and coin are not in the same room.'::TEXT;
        RETURN;
    END IF;

    -- 5. Verify room status is playing and countdown has elapsed
    SELECT * INTO v_room FROM rooms r WHERE r.id = v_coin.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, v_player.score, 'Game is not in playing state.'::TEXT;
        RETURN;
    END IF;

    -- Reject collection during 3-second countdown
    IF v_room.started_at IS NOT NULL AND now() < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, v_player.score, 'Cannot collect coins during countdown.'::TEXT;
        RETURN;
    END IF;

    -- Reject collection after 63 seconds
    IF v_room.started_at IS NOT NULL AND now() > (v_room.started_at + interval '63 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, v_player.score, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    -- 6. Atomically deactivate coin and increment score
    UPDATE coins c
    SET active = false
    WHERE c.id = p_coin_id;

    UPDATE players p
    SET score = score + 1
    WHERE p.id = p_player_id
    RETURNING score INTO v_score;

    -- 7. Return success result
    RETURN QUERY
    SELECT true, p_coin_id, p_player_id, v_coin.room_id, v_score, 'Coin collected successfully.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION collect_coin_safe(UUID, UUID) TO anon, authenticated;
