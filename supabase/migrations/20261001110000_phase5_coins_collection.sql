-- Migration: Phase 5 — Coin Spawning, Authoritative Collection, Realtime Sync
-- Project: Pixel Arena: Coin Grabber

-- 1. Ensure coins table is in supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'coins'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE coins;
    END IF;
END $$;

-- 2. Set REPLICA IDENTITY FULL on coins so realtime payload.old contains all fields
ALTER TABLE coins REPLICA IDENTITY FULL;

-- 3. RPC: ensure_room_coins
-- Spawns active coins for a room if none exist or if active count is below threshold.
-- Safe and idempotent: avoids duplicate coin flood if called repeatedly.
CREATE OR REPLACE FUNCTION ensure_room_coins(
    p_room_id UUID,
    p_count   INTEGER DEFAULT 10
)
RETURNS SETOF coins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room          rooms%ROWTYPE;
    v_active_count  INTEGER;
    v_needed        INTEGER;
    v_i             INTEGER;
    v_rand_x        NUMERIC;
    v_rand_y        NUMERIC;
BEGIN
    -- Validate room exists
    SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found.' USING ERRCODE = 'P0002';
    END IF;

    -- Count active coins in room
    SELECT COUNT(*) INTO v_active_count
    FROM coins
    WHERE room_id = p_room_id AND active = true;

    v_needed := p_count - v_active_count;

    -- Spawn if needed
    IF v_needed > 0 THEN
        FOR v_i IN 1..v_needed LOOP
            -- Generate coordinates inside logical playable arena (e.g. 50..650 X, 50..370 Y)
            v_rand_x := round((50 + random() * 580)::numeric, 1);
            v_rand_y := round((50 + random() * 320)::numeric, 1);

            INSERT INTO coins (room_id, x, y, active)
            VALUES (p_room_id, v_rand_x, v_rand_y, true);
        END LOOP;
    END IF;

    -- Return all currently active coins for this room
    RETURN QUERY
    SELECT * FROM coins
    WHERE room_id = p_room_id AND active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_room_coins(UUID, INTEGER) TO anon, authenticated;


-- 4. RPC: collect_coin_safe
-- Authoritative, atomic coin collection:
--   - Locks coin and player rows
--   - Validates coin is active and belongs to same room as player
--   - Deactivates coin (active = false)
--   - Increments player score (+1)
--   - Returns result record with success flag and new score
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
    -- 1. Find and lock the coin row to prevent concurrent race condition
    SELECT * INTO v_coin
    FROM coins
    WHERE id = p_coin_id
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
    FROM players
    WHERE id = p_player_id
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

    -- 5. Verify room status is not finished
    SELECT * INTO v_room FROM rooms WHERE id = v_coin.room_id;
    IF v_room.status = 'finished' THEN
        RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, v_player.score, 'Game is already finished.'::TEXT;
        RETURN;
    END IF;

    -- 6. Atomically deactivate coin and increment score
    UPDATE coins
    SET active = false
    WHERE id = p_coin_id;

    UPDATE players
    SET score = score + 1
    WHERE id = p_player_id
    RETURNING score INTO v_score;

    -- 7. Return success result
    RETURN QUERY
    SELECT true, p_coin_id, p_player_id, v_coin.room_id, v_score, 'Coin collected successfully.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION collect_coin_safe(UUID, UUID) TO anon, authenticated;
