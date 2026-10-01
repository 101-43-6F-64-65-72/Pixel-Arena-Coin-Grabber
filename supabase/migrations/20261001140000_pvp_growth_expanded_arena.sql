-- Migration: 20261001140000_pvp_growth_expanded_arena.sql

-- 1. Expanded Coin Spawning (1200x750 arena, 45 coins capacity)
CREATE OR REPLACE FUNCTION public.ensure_room_coins(
    p_room_id UUID,
    p_count   INTEGER DEFAULT 45
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
    SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COUNT(*) INTO v_active_count
    FROM coins
    WHERE room_id = p_room_id AND active = true;

    v_needed := p_count - v_active_count;

    IF v_needed > 0 THEN
        FOR v_i IN 1..v_needed LOOP
            -- Spawn across 1200x750 arena (X: 40..1160, Y: 40..710)
            v_rand_x := round((40 + random() * 1120)::numeric, 1);
            v_rand_y := round((40 + random() * 670)::numeric, 1);

            INSERT INTO coins (room_id, x, y, active)
            VALUES (p_room_id, v_rand_x, v_rand_y, true);
        END LOOP;
    END IF;

    RETURN QUERY
    SELECT * FROM coins
    WHERE room_id = p_room_id AND active = true;
END;
$$;

-- 2. Hardened Coin Collection with dynamic growth radius and continuous respawn
CREATE OR REPLACE FUNCTION public.collect_coin_safe(
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
    v_user_id   UUID;
    v_coin      coins%ROWTYPE;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_score     INTEGER;
    v_dist_sq   NUMERIC;
    v_max_rad   NUMERIC;
    v_active_c  INTEGER;
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

    -- Reject collection after 303 seconds (5 mins + 3s countdown)
    IF v_room.started_at IS NOT NULL AND now() > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    -- 5. Dynamic Growth Distance Validation
    -- Player size grows with score: Radius = 16 + sqrt(score)*2.5. Coin radius = 8.
    -- Plus 30px latency/jitter tolerance buffer.
    v_max_rad := (16.0 + sqrt(GREATEST(0, v_player.score)::numeric) * 2.5) + 8.0 + 30.0;
    v_dist_sq := (v_player.x - v_coin.x)^2 + (v_player.y - v_coin.y)^2;

    IF v_dist_sq > (v_max_rad * v_max_rad) THEN
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

    -- 7. Continuous Coin Respawn: If active coins drop below 20, replenish up to 45!
    SELECT COUNT(*) INTO v_active_c FROM coins cn WHERE cn.room_id = v_coin.room_id AND cn.active = true;
    IF v_active_c < 20 THEN
        PERFORM ensure_room_coins(v_coin.room_id, 45);
    END IF;

    RETURN QUERY
    SELECT true, p_coin_id, v_player.id, v_coin.room_id, v_score, 'Coin collected successfully.'::TEXT;
    RETURN;
END;
$$;

-- 3. Match Lifecycle: 5 Minutes (303 seconds)
CREATE OR REPLACE FUNCTION public.finish_match_safe(
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

    SELECT * INTO v_room
    FROM rooms r
    WHERE r.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_room_id, ''::TEXT, 'Room not found.'::TEXT;
        RETURN;
    END IF;

    IF v_room.status = 'finished' THEN
        RETURN QUERY SELECT true, p_room_id, 'finished'::TEXT, 'Match is already finished.'::TEXT;
        RETURN;
    END IF;

    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Match is not in playing state.'::TEXT;
        RETURN;
    END IF;

    IF v_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM players p WHERE p.room_id = p_room_id AND p.user_id = v_user_id) THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Unauthorized: You are not a player in this room.'::TEXT;
        RETURN;
    END IF;

    -- Verify match duration has actually elapsed (303s: 3s countdown + 300s match)
    IF v_room.started_at IS NULL OR now() < (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, p_room_id, v_room.status, 'Match duration has not elapsed yet.'::TEXT;
        RETURN;
    END IF;

    UPDATE rooms r
    SET status = 'finished'
    WHERE r.id = p_room_id;

    RETURN QUERY SELECT true, p_room_id, 'finished'::TEXT, 'Match finished successfully.'::TEXT;
    RETURN;
END;
$$;

-- 4. Start Match with 45 coins
CREATE OR REPLACE FUNCTION public.start_match_safe(
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

    SELECT * INTO v_room
    FROM rooms r
    WHERE r.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Room not found.'::TEXT;
        RETURN;
    END IF;

    IF v_room.status <> 'waiting' THEN
        RETURN QUERY SELECT false, p_room_id, v_room.started_at, 'Match has already started or finished.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_host_player FROM players p WHERE p.id = v_room.host_id;

    IF v_user_id IS NOT NULL AND v_host_player.user_id IS NOT NULL THEN
        IF v_host_player.user_id <> v_user_id THEN
            RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Unauthorized: Only the room host can start the match.'::TEXT;
            RETURN;
        END IF;
    ELSIF p_player_id IS NOT NULL AND v_room.host_id <> p_player_id THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Unauthorized: Only the room host can start the match.'::TEXT;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_count FROM players p WHERE p.room_id = p_room_id;
    IF v_count < 1 THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Not enough players to start match.'::TEXT;
        RETURN;
    END IF;

    -- Ensure initial 45 coins exist across expanded arena
    PERFORM ensure_room_coins(p_room_id, 45);

    v_started_at := now();
    UPDATE rooms r
    SET status = 'playing',
        started_at = v_started_at
    WHERE r.id = p_room_id;

    RETURN QUERY SELECT true, p_room_id, v_started_at, 'Match started successfully.'::TEXT;
    RETURN;
END;
$$;

-- 5. Authoritative PvP Player-vs-Player Eating / Elimination RPC
CREATE OR REPLACE FUNCTION public.eliminate_player_safe(
    p_victim_id UUID
)
RETURNS TABLE (
    success        BOOLEAN,
    predator_id    UUID,
    victim_id      UUID,
    predator_score INTEGER,
    victim_score   INTEGER,
    stolen_pts     INTEGER,
    message        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_predator      players%ROWTYPE;
    v_victim        players%ROWTYPE;
    v_room          rooms%ROWTYPE;
    v_pred_radius   NUMERIC;
    v_vict_radius   NUMERIC;
    v_dist_sq       NUMERIC;
    v_max_dist      NUMERIC;
    v_stolen        INTEGER;
    v_respawn_x     NUMERIC;
    v_respawn_y     NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, p_victim_id, 0, 0, 0, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    -- 1. Find predator (caller)
    SELECT * INTO v_predator
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, p_victim_id, 0, 0, 0, 'Predator player not found.'::TEXT;
        RETURN;
    END IF;

    IF v_predator.id = p_victim_id THEN
        RETURN QUERY SELECT false, v_predator.id, p_victim_id, v_predator.score, 0, 0, 'Cannot eliminate yourself.'::TEXT;
        RETURN;
    END IF;

    -- 2. Find victim
    SELECT * INTO v_victim
    FROM players pl
    WHERE pl.id = p_victim_id AND pl.room_id = v_predator.room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, v_predator.id, p_victim_id, v_predator.score, 0, 0, 'Victim not found in this room.'::TEXT;
        RETURN;
    END IF;

    -- 3. Check match is playing
    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_predator.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, v_predator.id, v_victim.id, v_predator.score, v_victim.score, 0, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    -- 4. Predator must be larger (strictly higher score)
    IF v_predator.score <= v_victim.score THEN
        RETURN QUERY SELECT false, v_predator.id, v_victim.id, v_predator.score, v_victim.score, 0, 'Predator must have higher score to eat victim.'::TEXT;
        RETURN;
    END IF;

    -- 5. Distance check based on current radii
    v_pred_radius := 16.0 + sqrt(GREATEST(0, v_predator.score)::numeric) * 2.5;
    v_vict_radius := 16.0 + sqrt(GREATEST(0, v_victim.score)::numeric) * 2.5;
    v_max_dist := v_pred_radius + v_vict_radius + 25.0; -- 25px latency buffer
    v_dist_sq := (v_predator.x - v_victim.x)^2 + (v_predator.y - v_victim.y)^2;

    IF v_dist_sq > (v_max_dist * v_max_dist) THEN
        RETURN QUERY SELECT false, v_predator.id, v_victim.id, v_predator.score, v_victim.score, 0, 'Too far to eat player.'::TEXT;
        RETURN;
    END IF;

    -- 6. Calculate stolen points (steal 50% of victim score or at least 2 points)
    v_stolen := GREATEST(2, FLOOR(v_victim.score * 0.5)::INTEGER);

    -- 7. Update predator score
    UPDATE players pl
    SET score = pl.score + v_stolen
    WHERE pl.id = v_predator.id
    RETURNING pl.score INTO v_predator.score;

    -- 8. Respawn victim at safe location with reduced score
    v_respawn_x := round((100 + random() * 1000)::numeric, 1);
    v_respawn_y := round((100 + random() * 550)::numeric, 1);

    UPDATE players pl
    SET score = GREATEST(0, pl.score - v_stolen),
        x = v_respawn_x,
        y = v_respawn_y,
        position_updated_at = clock_timestamp()
    WHERE pl.id = v_victim.id
    RETURNING pl.score INTO v_victim.score;

    RETURN QUERY
    SELECT true, v_predator.id, v_victim.id, v_predator.score, v_victim.score, v_stolen, 'Player eaten successfully!'::TEXT;
    RETURN;
END;
$$;
