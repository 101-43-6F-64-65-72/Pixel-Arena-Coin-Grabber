-- Migration: Phase 8 — Authoritative Gameplay + Server-Validated Movement
-- Project: Pixel Arena: Coin Grabber

-- 1. Add authoritative position columns to players table
ALTER TABLE players
ADD COLUMN IF NOT EXISTS x NUMERIC DEFAULT 320 NOT NULL,
ADD COLUMN IF NOT EXISTS y NUMERIC DEFAULT 210 NOT NULL,
ADD COLUMN IF NOT EXISTS position_updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- 2. Add coordinates constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_players_coords'
    ) THEN
        ALTER TABLE players ADD CONSTRAINT chk_players_coords CHECK (x >= 0 AND y >= 0);
    END IF;
END $$;

-- 3. RPC: update_player_position_safe
-- Validates movement speed and arena bounds server-side based on auth.uid()
CREATE OR REPLACE FUNCTION update_player_position_safe(
    p_x NUMERIC,
    p_y NUMERIC
)
RETURNS TABLE (
    success BOOLEAN,
    reason  TEXT,
    x       NUMERIC,
    y       NUMERIC,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_player_id     UUID;
    v_curr_x        NUMERIC;
    v_curr_y        NUMERIC;
    v_updated_at    TIMESTAMPTZ;
    v_room_status   TEXT;
    v_elapsed       NUMERIC;
    v_dist          NUMERIC;
    v_max_dist      NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 'unauthenticated'::TEXT, 0::NUMERIC, 0::NUMERIC, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    -- Validate input coordinates
    IF p_x IS NULL OR p_y IS NULL OR p_x < 0 OR p_y < 0 THEN
        RETURN QUERY SELECT false, 'invalid_coordinates'::TEXT, 0::NUMERIC, 0::NUMERIC, 'Coordinates must be non-negative.'::TEXT;
        RETURN;
    END IF;

    -- Find and lock active player record for this user
    SELECT p.id, p.x, p.y, p.position_updated_at, r.status
    INTO v_player_id, v_curr_x, v_curr_y, v_updated_at, v_room_status
    FROM players p
    JOIN rooms r ON r.id = p.room_id
    WHERE p.user_id = v_user_id
    ORDER BY p.joined_at DESC
    LIMIT 1
    FOR UPDATE OF p;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'player_not_found'::TEXT, 0::NUMERIC, 0::NUMERIC, 'Active player not found.'::TEXT;
        RETURN;
    END IF;

    IF v_room_status = 'finished' THEN
        RETURN QUERY SELECT false, 'game_finished'::TEXT, v_curr_x, v_curr_y, 'Match is already finished.'::TEXT;
        RETURN;
    END IF;

    -- Calculate elapsed seconds since last authoritative update
    v_elapsed := GREATEST(0.02, EXTRACT(EPOCH FROM (clock_timestamp() - v_updated_at)));
    v_dist := sqrt((p_x - v_curr_x)^2 + (p_y - v_curr_y)^2);

    -- Max allowed speed is 200 px/s + 70px burst tolerance for network jitter
    -- If last update was more than 10s ago (e.g. initial spawn / pause), allow initial repositioning
    v_max_dist := (200.0 * v_elapsed) + 70.0;

    IF v_elapsed < 10.0 AND v_dist > v_max_dist THEN
        RETURN QUERY SELECT false, 'movement_exceeded'::TEXT, v_curr_x, v_curr_y, 'Movement speed limit exceeded.'::TEXT;
        RETURN;
    END IF;

    -- Update authoritative position
    UPDATE players p
    SET x = round(p_x, 1),
        y = round(p_y, 1),
        position_updated_at = clock_timestamp()
    WHERE p.id = v_player_id;

    RETURN QUERY SELECT true, 'ok'::TEXT, round(p_x, 1), round(p_y, 1), 'Position updated.'::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION update_player_position_safe(NUMERIC, NUMERIC) TO anon, authenticated;


-- 4. RPC: collect_coin_safe (hardened with server-side distance validation)
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
    v_dist_sq NUMERIC;
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

    -- 3. Find and lock the player row
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

    -- 5. Server-Side Distance Validation
    -- Collection radius is 24px + 18px latency tolerance = 42px (radius^2 = 1764)
    v_dist_sq := (v_player.x - v_coin.x)^2 + (v_player.y - v_coin.y)^2;
    IF v_dist_sq > 1764 THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Too far from coin to collect.'::TEXT;
        RETURN;
    END IF;

    -- 6. Atomically deactivate coin and increment score
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
