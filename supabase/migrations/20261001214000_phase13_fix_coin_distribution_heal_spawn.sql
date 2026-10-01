-- ============================================================
-- Migration: Phase 13 Fix — Fixed Coin Quotas (30/20/10) & Heal Item Spawning
-- Project:   Pixel Arena: Coin Grabber / RoyalWar
-- Purpose:
--   1. Enforces 60 total coins in arena simultaneously (30 x coin_1, 20 x coin_2, 10 x coin_3).
--   2. Enforces Heal Item spawn (max 1 active, 15s server cooldown).
--   3. Updates start_match_safe to call ensure_room_coins(p_room_id, 60).
--   4. Updates collect_coin_safe for 30:20:10 rerolls and authoritative heal validation.
-- ============================================================

-- 1. Schema Check
ALTER TABLE coins
ADD COLUMN IF NOT EXISTS coin_type TEXT NOT NULL DEFAULT 'coin_1'
CHECK (coin_type IN ('coin_1', 'coin_2', 'coin_3', 'heal'));

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS last_heal_spawned_at TIMESTAMPTZ DEFAULT NULL;

-- Drop existing functions to allow clean signature overrides
DROP FUNCTION IF EXISTS public.ensure_room_coins(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.start_match_safe(UUID, UUID);
DROP FUNCTION IF EXISTS public.collect_coin_safe(UUID, UUID);

-- 2. Authoritative Coin & Heal Spawner (ensure_room_coins)
CREATE OR REPLACE FUNCTION public.ensure_room_coins(
    p_room_id UUID,
    p_count   INTEGER DEFAULT 60
)
RETURNS SETOF coins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room             rooms%ROWTYPE;
    v_active_c1        INTEGER := 0;
    v_active_c2        INTEGER := 0;
    v_active_c3        INTEGER := 0;
    v_active_heals     INTEGER := 0;
    v_needed_c1        INTEGER := 0;
    v_needed_c2        INTEGER := 0;
    v_needed_c3        INTEGER := 0;
    v_i                INTEGER;
    v_rand_x           NUMERIC;
    v_rand_y           NUMERIC;
    v_reusable_id      UUID;
    v_now              TIMESTAMPTZ := clock_timestamp();
    v_can_spawn_heal   BOOLEAN := false;
BEGIN
    SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found.' USING ERRCODE = 'P0002';
    END IF;

    -- Count active coins by type
    SELECT COUNT(*) INTO v_active_c1 FROM coins WHERE room_id = p_room_id AND active = true AND coin_type = 'coin_1';
    SELECT COUNT(*) INTO v_active_c2 FROM coins WHERE room_id = p_room_id AND active = true AND coin_type = 'coin_2';
    SELECT COUNT(*) INTO v_active_c3 FROM coins WHERE room_id = p_room_id AND active = true AND coin_type = 'coin_3';
    SELECT COUNT(*) INTO v_active_heals FROM coins WHERE room_id = p_room_id AND active = true AND coin_type = 'heal';

    -- Fixed target quotas: 30 Type 1 (+1), 20 Type 2 (+2), 10 Type 3 (+3) = 60 total coins
    v_needed_c1 := GREATEST(0, 30 - v_active_c1);
    v_needed_c2 := GREATEST(0, 20 - v_active_c2);
    v_needed_c3 := GREATEST(0, 10 - v_active_c3);

    -- Spawn missing Type 1 (+1)
    IF v_needed_c1 > 0 THEN
        FOR v_i IN 1..v_needed_c1 LOOP
            v_rand_x := round((60 + random() * 1880)::numeric, 1);
            v_rand_y := round((60 + random() * 1080)::numeric, 1);
            SELECT c.id INTO v_reusable_id FROM coins c WHERE c.room_id = p_room_id AND c.active = false LIMIT 1;
            IF v_reusable_id IS NOT NULL THEN
                UPDATE coins SET x = v_rand_x, y = v_rand_y, coin_type = 'coin_1', active = true WHERE id = v_reusable_id;
            ELSE
                INSERT INTO coins (room_id, x, y, coin_type, active) VALUES (p_room_id, v_rand_x, v_rand_y, 'coin_1', true);
            END IF;
        END LOOP;
    END IF;

    -- Spawn missing Type 2 (+2)
    IF v_needed_c2 > 0 THEN
        FOR v_i IN 1..v_needed_c2 LOOP
            v_rand_x := round((60 + random() * 1880)::numeric, 1);
            v_rand_y := round((60 + random() * 1080)::numeric, 1);
            SELECT c.id INTO v_reusable_id FROM coins c WHERE c.room_id = p_room_id AND c.active = false LIMIT 1;
            IF v_reusable_id IS NOT NULL THEN
                UPDATE coins SET x = v_rand_x, y = v_rand_y, coin_type = 'coin_2', active = true WHERE id = v_reusable_id;
            ELSE
                INSERT INTO coins (room_id, x, y, coin_type, active) VALUES (p_room_id, v_rand_x, v_rand_y, 'coin_2', true);
            END IF;
        END LOOP;
    END IF;

    -- Spawn missing Type 3 (+3)
    IF v_needed_c3 > 0 THEN
        FOR v_i IN 1..v_needed_c3 LOOP
            v_rand_x := round((60 + random() * 1880)::numeric, 1);
            v_rand_y := round((60 + random() * 1080)::numeric, 1);
            SELECT c.id INTO v_reusable_id FROM coins c WHERE c.room_id = p_room_id AND c.active = false LIMIT 1;
            IF v_reusable_id IS NOT NULL THEN
                UPDATE coins SET x = v_rand_x, y = v_rand_y, coin_type = 'coin_3', active = true WHERE id = v_reusable_id;
            ELSE
                INSERT INTO coins (room_id, x, y, coin_type, active) VALUES (p_room_id, v_rand_x, v_rand_y, 'coin_3', true);
            END IF;
        END LOOP;
    END IF;

    -- Heal Item Spawning (max 1 active, 15s cooldown)
    IF v_active_heals = 0 AND (v_room.last_heal_spawned_at IS NULL OR v_now >= (v_room.last_heal_spawned_at + interval '15 seconds')) THEN
        v_can_spawn_heal := true;
    END IF;

    IF v_can_spawn_heal THEN
        v_rand_x := round((100 + random() * 1800)::numeric, 1);
        v_rand_y := round((100 + random() * 1000)::numeric, 1);

        SELECT c.id INTO v_reusable_id FROM coins c WHERE c.room_id = p_room_id AND c.active = false LIMIT 1;
        IF v_reusable_id IS NOT NULL THEN
            UPDATE coins SET x = v_rand_x, y = v_rand_y, coin_type = 'heal', active = true WHERE id = v_reusable_id;
        ELSE
            INSERT INTO coins (room_id, x, y, coin_type, active) VALUES (p_room_id, v_rand_x, v_rand_y, 'heal', true);
        END IF;

        UPDATE rooms SET last_heal_spawned_at = v_now WHERE id = p_room_id;
    END IF;

    RETURN QUERY
    SELECT * FROM coins
    WHERE room_id = p_room_id AND active = true;
END;
$$;

-- 3. Update start_match_safe to use ensure_room_coins(p_room_id, 60)
CREATE OR REPLACE FUNCTION public.start_match_safe(
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
    SELECT * INTO v_room FROM rooms r WHERE r.id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Room not found.'::TEXT;
        RETURN;
    END IF;

    IF v_room.status <> 'waiting' THEN
        RETURN QUERY SELECT false, p_room_id, v_room.started_at, 'Match has already started or finished.'::TEXT;
        RETURN;
    END IF;

    IF v_room.host_id IS NULL OR v_room.host_id <> p_player_id THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Only the room host can start the match.'::TEXT;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_count FROM players p WHERE p.room_id = p_room_id;
    IF v_count < 1 THEN
        RETURN QUERY SELECT false, p_room_id, NULL::TIMESTAMPTZ, 'Not enough players to start match.'::TEXT;
        RETURN;
    END IF;

    -- Ensure 60 coins (30 c1, 20 c2, 10 c3) and 1 heal item exist for the room
    PERFORM ensure_room_coins(p_room_id, 60);

    v_started_at := now();
    UPDATE rooms r
    SET status = 'playing', started_at = v_started_at
    WHERE r.id = p_room_id;

    RETURN QUERY SELECT true, p_room_id, v_started_at, 'Match started successfully.'::TEXT;
    RETURN;
END;
$$;

-- 4. Authoritative collect_coin_safe with 30:20:10 distribution reroll
CREATE OR REPLACE FUNCTION public.collect_coin_safe(
    p_coin_id   UUID,
    p_player_id UUID DEFAULT NULL
)
RETURNS TABLE (
    success           BOOLEAN,
    coin_id           UUID,
    player_id         UUID,
    room_id           UUID,
    collectible_type  TEXT,
    coin_type         TEXT,
    score_delta       INTEGER,
    new_score         INTEGER,
    heal_delta        INTEGER,
    new_hp            INTEGER,
    message           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_coin          coins%ROWTYPE;
    v_player        players%ROWTYPE;
    v_room          rooms%ROWTYPE;
    v_score_delta   INTEGER := 0;
    v_heal_delta    INTEGER := 0;
    v_new_score     INTEGER := 0;
    v_new_hp        INTEGER := 0;
    v_dist_sq       NUMERIC;
    v_max_rad       NUMERIC := 59.0;
    v_new_x         NUMERIC;
    v_new_y         NUMERIC;
    v_roll          NUMERIC;
    v_new_type      TEXT;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_coin FROM coins c WHERE c.id = p_coin_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, NULL::UUID, 'none'::TEXT, 'none'::TEXT, 0, 0, 0, 0, 'Collectible not found.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_coin.active THEN
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, 0, 0, 0, 'Collectible already collected.'::TEXT;
        RETURN;
    END IF;

    IF v_user_id IS NOT NULL THEN
        SELECT * INTO v_player FROM players p WHERE p.room_id = v_coin.room_id AND p.user_id = v_user_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, 0, 0, 0, 'Unauthorized: Player not in room.'::TEXT;
            RETURN;
        END IF;
    ELSIF p_player_id IS NOT NULL THEN
        SELECT * INTO v_player FROM players p WHERE p.id = p_player_id FOR UPDATE;
        IF NOT FOUND OR v_player.room_id <> v_coin.room_id THEN
            RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, 0, 0, 0, 'Unauthorized: Player not in room.'::TEXT;
            RETURN;
        END IF;
    ELSE
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, 0, 0, 0, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_player.alive THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, v_player.score, 0, v_player.hp, 'Dead players cannot collect items.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms r WHERE r.id = v_coin.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, v_player.score, 0, v_player.hp, 'Game is not in playing state.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND now() < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, v_player.score, 0, v_player.hp, 'Cannot collect items during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND now() > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, v_player.score, 0, v_player.hp, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    v_dist_sq := (v_player.x - v_coin.x)^2 + (v_player.y - v_coin.y)^2;
    IF v_dist_sq > (v_max_rad * v_max_rad) THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, 'none'::TEXT, v_coin.coin_type, 0, v_player.score, 0, v_player.hp, 'Too far from item to collect.'::TEXT;
        RETURN;
    END IF;

    IF v_coin.coin_type = 'heal' THEN
        IF v_player.hp >= 100 THEN
            RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, 'heal'::TEXT, 'heal'::TEXT, 0, v_player.score, 0, v_player.hp, 'HP is already full!'::TEXT;
            RETURN;
        END IF;

        v_heal_delta := LEAST(25, 100 - v_player.hp);
        v_new_hp := v_player.hp + v_heal_delta;
        v_new_score := v_player.score;

        UPDATE coins SET active = false WHERE id = p_coin_id;
        UPDATE players SET hp = v_new_hp WHERE id = v_player.id;

        RETURN QUERY SELECT true, p_coin_id, v_player.id, v_coin.room_id, 'heal'::TEXT, 'heal'::TEXT, 0, v_new_score, v_heal_delta, v_new_hp, 'Heal collected! (+25 HP)'::TEXT;
        RETURN;
    ELSE
        IF v_coin.coin_type = 'coin_2' THEN
            v_score_delta := 2;
        ELSIF v_coin.coin_type = 'coin_3' THEN
            v_score_delta := 3;
        ELSE
            v_score_delta := 1;
        END IF;

        v_new_hp := v_player.hp;
        v_new_x := round((60 + random() * 1880)::numeric, 1);
        v_new_y := round((60 + random() * 1080)::numeric, 1);

        -- Reroll type to maintain 30:20:10 (50% c1, 33.3% c2, 16.7% c3)
        v_roll := random();
        IF v_roll < 0.50 THEN
            v_new_type := 'coin_1';
        ELSIF v_roll < 0.8333 THEN
            v_new_type := 'coin_2';
        ELSE
            v_new_type := 'coin_3';
        END IF;

        UPDATE coins c SET x = v_new_x, y = v_new_y, coin_type = v_new_type, active = true WHERE c.id = p_coin_id;
        UPDATE players p SET score = score + v_score_delta WHERE p.id = v_player.id RETURNING score INTO v_new_score;

        RETURN QUERY SELECT true, p_coin_id, v_player.id, v_coin.room_id, 'coin'::TEXT, v_coin.coin_type, v_score_delta, v_new_score, 0, v_new_hp, ('Collected ' || v_coin.coin_type || ' (+' || v_score_delta || ' pts)')::TEXT;
        RETURN;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_room_coins(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_match_safe(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_coin_safe(UUID, UUID) TO anon, authenticated;
