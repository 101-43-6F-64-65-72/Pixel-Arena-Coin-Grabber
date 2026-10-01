-- ============================================================
-- Migration: Hotfix — Authoritative Movement, Skills & Real Cooldown System
-- Project:   Pixel Arena: Coin Grabber / RoyalWar
-- Purpose:
--   1. Enforce strict match state & countdown checks on all skills
--   2. Enforce 6s cooldown for Shockwave (Burst), 4s for Dash, 8s for Shield
--   3. Ensure skill RPCs return authoritative cooldown_until timestamps
-- ============================================================

-- 1. Authoritative Dash RPC (use_dash_safe)
CREATE OR REPLACE FUNCTION public.use_dash_safe(
    p_dx NUMERIC,
    p_dy NUMERIC
)
RETURNS TABLE (
    success         BOOLEAN,
    new_x           NUMERIC,
    new_y           NUMERIC,
    cooldown_until  TIMESTAMPTZ,
    message         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_len       NUMERIC;
    v_ndx       NUMERIC := 0;
    v_ndy       NUMERIC := 0;
    v_dist      NUMERIC := 190.0;
    v_dest_x    NUMERIC;
    v_dest_y    NUMERIC;
    v_now       TIMESTAMPTZ := clock_timestamp();
    v_cd_until  TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, NULL::TIMESTAMPTZ, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_player
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, NULL::TIMESTAMPTZ, 'Player not found.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_player.alive THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, v_player.dash_cooldown_until, 'Dead players cannot dash.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_player.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, v_player.dash_cooldown_until, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, v_player.dash_cooldown_until, 'Cannot dash during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, v_player.dash_cooldown_until, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    IF v_player.dash_cooldown_until IS NOT NULL AND v_now < v_player.dash_cooldown_until THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, v_player.dash_cooldown_until, 'Dash is on cooldown.'::TEXT;
        RETURN;
    END IF;

    -- Normalize direction vector
    v_len := sqrt(p_dx * p_dx + p_dy * p_dy);
    IF v_len > 0.001 THEN
        v_ndx := p_dx / v_len;
        v_ndy := p_dy / v_len;
    ELSE
        v_ndx := 1;
        v_ndy := 0;
    END IF;

    -- Calculate and clamp world destination (2000x1200 world, ARENA_PADDING=24)
    v_dest_x := round(GREATEST(40.0, LEAST(1960.0, v_player.x + v_ndx * v_dist)), 1);
    v_dest_y := round(GREATEST(40.0, LEAST(1160.0, v_player.y + v_ndy * v_dist)), 1);
    v_cd_until := v_now + interval '4 seconds';

    UPDATE players pl
    SET x = v_dest_x,
        y = v_dest_y,
        position_updated_at = v_now,
        dash_cooldown_until = v_cd_until
    WHERE pl.id = v_player.id;

    RETURN QUERY
    SELECT true, v_dest_x, v_dest_y, v_cd_until, 'Dash executed.'::TEXT;
    RETURN;
END;
$$;

-- 2. Authoritative Shield RPC (use_shield_safe)
CREATE OR REPLACE FUNCTION public.use_shield_safe()
RETURNS TABLE (
    success         BOOLEAN,
    shield_until    TIMESTAMPTZ,
    cooldown_until  TIMESTAMPTZ,
    message         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_now       TIMESTAMPTZ := clock_timestamp();
    v_s_until   TIMESTAMPTZ;
    v_cd_until  TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_player
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR NOT v_player.alive THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, v_player.shield_cooldown_until, 'Player not found or dead.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_player.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, v_player.shield_cooldown_until, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, v_player.shield_cooldown_until, 'Cannot shield during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, v_player.shield_cooldown_until, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    IF v_player.shield_cooldown_until IS NOT NULL AND v_now < v_player.shield_cooldown_until THEN
        RETURN QUERY SELECT false, v_player.shield_until, v_player.shield_cooldown_until, 'Shield is on cooldown.'::TEXT;
        RETURN;
    END IF;

    v_s_until  := v_now + interval '2 seconds';
    v_cd_until := v_now + interval '8 seconds';

    UPDATE players pl
    SET shield_until = v_s_until,
        shield_cooldown_until = v_cd_until
    WHERE pl.id = v_player.id;

    RETURN QUERY
    SELECT true, v_s_until, v_cd_until, 'Shield activated.'::TEXT;
    RETURN;
END;
$$;

-- 3. Authoritative Shockwave / Burst RPC (use_shockwave_safe)
CREATE OR REPLACE FUNCTION public.use_shockwave_safe()
RETURNS TABLE (
    success          BOOLEAN,
    hits_count       INTEGER,
    cooldown_until   TIMESTAMPTZ,
    message          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_caster        players%ROWTYPE;
    v_room          rooms%ROWTYPE;
    v_enemy         players%ROWTYPE;
    v_now           TIMESTAMPTZ := clock_timestamp();
    v_radius        NUMERIC := 170.0;
    v_rad_sq        NUMERIC := 170.0 * 170.0;
    v_dist_sq       NUMERIC;
    v_hits          INTEGER := 0;
    v_damage        INTEGER := 25;
    v_new_hp        INTEGER;
    v_kills         INTEGER := 0;
    v_cd_until      TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0, NULL::TIMESTAMPTZ, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_caster
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR NOT v_caster.alive THEN
        RETURN QUERY SELECT false, 0, v_caster.shockwave_cooldown_until, 'Player not found or dead.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_caster.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, 0, v_caster.shockwave_cooldown_until, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, 0, v_caster.shockwave_cooldown_until, 'Cannot use skills during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, 0, v_caster.shockwave_cooldown_until, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    IF v_caster.shockwave_cooldown_until IS NOT NULL AND v_now < v_caster.shockwave_cooldown_until THEN
        RETURN QUERY SELECT false, 0, v_caster.shockwave_cooldown_until, 'Burst is on cooldown.'::TEXT;
        RETURN;
    END IF;

    -- Process enemies in room within radius
    FOR v_enemy IN
        SELECT * FROM players pl
        WHERE pl.room_id = v_caster.room_id
          AND pl.id <> v_caster.id
          AND pl.alive = true
        FOR UPDATE
    LOOP
        v_dist_sq := (v_enemy.x - v_caster.x)^2 + (v_enemy.y - v_caster.y)^2;
        IF v_dist_sq <= v_rad_sq THEN
            v_hits := v_hits + 1;

            -- Check if enemy is shielded
            IF v_enemy.shield_until IS NULL OR v_now >= v_enemy.shield_until THEN
                v_new_hp := GREATEST(0, v_enemy.hp - v_damage);
                IF v_new_hp = 0 THEN
                    v_kills := v_kills + 1;
                    UPDATE players pl
                    SET hp = 0,
                        alive = false,
                        deaths = pl.deaths + 1,
                        respawn_at = v_now + interval '3 seconds'
                    WHERE pl.id = v_enemy.id;
                ELSE
                    UPDATE players pl
                    SET hp = v_new_hp
                    WHERE pl.id = v_enemy.id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    v_cd_until := v_now + interval '6 seconds';

    UPDATE players pl
    SET kills = pl.kills + v_kills,
        shockwave_cooldown_until = v_cd_until
    WHERE pl.id = v_caster.id;

    RETURN QUERY
    SELECT true, v_hits, v_cd_until, ('Burst hit ' || v_hits || ' enemies.')::TEXT;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_dash_safe(NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_shield_safe() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_shockwave_safe() TO anon, authenticated;
