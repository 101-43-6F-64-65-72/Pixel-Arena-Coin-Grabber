-- ============================================================
-- Migration: Hotfix V2 — Authoritative Movement Validation Fix
-- Project:   Pixel Arena: Coin Grabber
-- Purpose:
--   The previous update_player_position_safe() validated movement
--   displacement using raw elapsed time since the last authoritative
--   update. Because the client sync interval is irregular under
--   network latency (syncInFlightRef was blocking the next sync
--   until the previous RPC completed), the server could see an
--   elapsed time of 300–500ms between syncs even though the client
--   was moving normally at ~210 px/s.
--
--   Fix strategy (server-side):
--   1. Cap effective elapsed time at MAX_VALIDATION_WINDOW (0.7s)
--   2. Increase bounded jitter tolerance from 60 to 80 px.
--   3. Keep hard speed guard at 210 px/s.
--   4. Keep all security guards intact.
--   5. Return structured rejection with authoritative position.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_player_position_safe(
    p_x NUMERIC,
    p_y NUMERIC
)
RETURNS TABLE (
    success BOOLEAN,
    x       NUMERIC,
    y       NUMERIC,
    reason  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id           UUID;
    v_player            players%ROWTYPE;
    v_now               TIMESTAMPTZ;
    v_delta_t           NUMERIC;
    v_effective_delta_t NUMERIC;
    v_delta_dist_sq     NUMERIC;
    v_max_dist          NUMERIC;
    v_clamped_x         NUMERIC;
    v_clamped_y         NUMERIC;

    -- Movement parameters: must match client PLAYER_SPEED in arena.js
    v_player_speed      NUMERIC := 210.0;
    v_speed_mult        NUMERIC := 1.0;

    -- Cap: max elapsed time window for one movement validation.
    -- Prevents long pauses from accumulating a huge teleport allowance.
    -- 0.7s = allows ~147px base + 80px jitter = 227px max per sync.
    v_max_elapsed_cap   NUMERIC := 0.7;

    -- Network jitter tolerance: bounded constant, does NOT scale with time.
    -- Covers ~80px of drift from irregular sync intervals / latency.
    v_jitter_tolerance  NUMERIC := 80.0;
BEGIN
    -- Auth guard
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 'unauthenticated'::TEXT;
        RETURN;
    END IF;

    -- Find and lock the player row
    SELECT * INTO v_player
    FROM players p
    WHERE p.user_id = v_user_id
    ORDER BY p.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 'player_not_found'::TEXT;
        RETURN;
    END IF;

    -- Dead players cannot move
    IF NOT v_player.alive THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, 'player_dead'::TEXT;
        RETURN;
    END IF;

    -- Clamp incoming coordinates to world bounds (2000x1200, ARENA_PADDING=24)
    v_clamped_x := round(GREATEST(24.0, LEAST(1976.0, p_x)), 1);
    v_clamped_y := round(GREATEST(24.0, LEAST(1176.0, p_y)), 1);

    v_now := clock_timestamp();

    -- Speed validation
    v_delta_t := EXTRACT(EPOCH FROM (v_now - v_player.position_updated_at));

    -- Only validate when we have a meaningful elapsed time window.
    -- Skip when: delta_t < 0.02s (floating point noise)
    -- Skip when: delta_t >= 10.0s (initial spawn / long idle — allow repositioning)
    IF v_delta_t >= 0.02 AND v_delta_t < 10.0 THEN

        -- Dash speed multiplier
        IF v_player.dash_cooldown_until IS NOT NULL
           AND v_now < (v_player.dash_cooldown_until - interval '2 seconds') THEN
            v_speed_mult := 2.5;
        END IF;

        -- Cap elapsed time to prevent teleport accumulation.
        -- A 5-second pause does NOT grant a 1050px movement allowance.
        v_effective_delta_t := LEAST(v_delta_t, v_max_elapsed_cap);

        -- Max allowed displacement for this sync window:
        --   base_speed * capped_time + bounded_jitter_tolerance
        v_max_dist := (v_player_speed * v_speed_mult * v_effective_delta_t) + v_jitter_tolerance;

        v_delta_dist_sq := (v_clamped_x - v_player.x)^2 + (v_clamped_y - v_player.y)^2;

        IF v_delta_dist_sq > (v_max_dist * v_max_dist) THEN
            -- Reject: return authoritative position and structured reason
            RETURN QUERY SELECT false, v_player.x, v_player.y, 'movement_exceeded'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Accept: update authoritative position atomically
    UPDATE players p
    SET x                   = v_clamped_x,
        y                   = v_clamped_y,
        position_updated_at = v_now
    WHERE p.id = v_player.id;

    RETURN QUERY SELECT true, v_clamped_x, v_clamped_y, 'ok'::TEXT;
    RETURN;
END;
$$;

-- Grants preserved
GRANT EXECUTE ON FUNCTION public.update_player_position_safe(NUMERIC, NUMERIC) TO anon, authenticated;
