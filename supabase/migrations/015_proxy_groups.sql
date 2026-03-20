-- Migration: 015_proxy_groups.sql
-- Refactor proxy model from 1:1 to 1:3 (1 proxy = 3 accounts: TikTok + Instagram + YouTube)
-- Uses a junction table instead of assigned_account_id on proxy_pool.

-- ====================
-- JUNCTION TABLE
-- ====================
CREATE TABLE IF NOT EXISTS proxy_account_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proxy_id UUID NOT NULL REFERENCES proxy_pool(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (proxy_id, platform),   -- max 1 account per platform per proxy
    UNIQUE (account_id)            -- each account has exactly 1 proxy
);

CREATE INDEX idx_proxy_assignments_proxy ON proxy_account_assignments(proxy_id);
CREATE INDEX idx_proxy_assignments_account ON proxy_account_assignments(account_id);

-- ====================
-- MIGRATE EXISTING DATA
-- ====================
INSERT INTO proxy_account_assignments (proxy_id, account_id, platform)
SELECT pp.id, pp.assigned_account_id, a.platform
FROM proxy_pool pp
JOIN accounts a ON a.id = pp.assigned_account_id
WHERE pp.assigned_account_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ====================
-- UPDATE is_available LOGIC
-- A proxy is available if it has fewer than 3 assignments
-- ====================
CREATE OR REPLACE FUNCTION update_proxy_availability()
RETURNS TRIGGER AS $$
DECLARE
    target_proxy_id UUID;
    assignment_count INTEGER;
BEGIN
    target_proxy_id := COALESCE(NEW.proxy_id, OLD.proxy_id);

    SELECT COUNT(*) INTO assignment_count
    FROM proxy_account_assignments
    WHERE proxy_id = target_proxy_id;

    UPDATE proxy_pool SET is_available = (assignment_count < 3)
    WHERE id = target_proxy_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proxy_assignment_changed
    AFTER INSERT OR DELETE ON proxy_account_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_proxy_availability();

-- ====================
-- NEW RPC: Assign proxy for a specific platform
-- Finds a proxy with an available slot for the given platform
-- ====================
CREATE OR REPLACE FUNCTION assign_proxy_for_platform(p_account_id UUID, p_platform TEXT)
RETURNS TABLE(
    proxy_id UUID,
    proxy_host TEXT,
    proxy_port INTEGER,
    proxy_username TEXT,
    proxy_password TEXT,
    proxy_protocol TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    found_id UUID;
BEGIN
    -- Find a healthy proxy that doesn't already have an assignment for this platform
    SELECT pp.id INTO found_id
    FROM proxy_pool pp
    WHERE pp.is_healthy = true
      AND NOT EXISTS (
          SELECT 1 FROM proxy_account_assignments paa
          WHERE paa.proxy_id = pp.id AND paa.platform = p_platform
      )
      AND (SELECT COUNT(*) FROM proxy_account_assignments paa WHERE paa.proxy_id = pp.id) < 3
    ORDER BY
        -- Prefer proxies that already have assignments on other platforms (group together)
        (SELECT COUNT(*) FROM proxy_account_assignments paa WHERE paa.proxy_id = pp.id) DESC,
        pp.id
    LIMIT 1
    FOR UPDATE OF pp SKIP LOCKED;

    IF found_id IS NULL THEN
        RAISE EXCEPTION 'No available proxy with free % slot', p_platform;
    END IF;

    -- Create assignment
    INSERT INTO proxy_account_assignments (proxy_id, account_id, platform)
    VALUES (found_id, p_account_id, p_platform);

    -- Also update the account's proxy fields for backwards compatibility
    UPDATE accounts SET
        proxy_url = pp.protocol || '://' || pp.host || ':' || pp.port,
        proxy_username = pp.username,
        proxy_password = pp.password
    FROM proxy_pool pp
    WHERE pp.id = found_id AND accounts.id = p_account_id;

    RETURN QUERY
    SELECT pp.id, pp.host, pp.port, pp.username, pp.password, pp.protocol
    FROM proxy_pool pp
    WHERE pp.id = found_id;
END;
$$;

-- ====================
-- UPDATE release_proxy to use junction table
-- ====================
CREATE OR REPLACE FUNCTION release_proxy(p_account_id UUID)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM proxy_account_assignments
    WHERE account_id = p_account_id;

    -- Clear account proxy fields
    UPDATE accounts SET
        proxy_url = NULL,
        proxy_username = NULL,
        proxy_password = NULL
    WHERE id = p_account_id;
END;
$$;

-- ====================
-- VIEW: Proxy groups showing all assignments
-- ====================
CREATE OR REPLACE VIEW proxy_groups AS
SELECT
    pp.id AS proxy_id,
    pp.host,
    pp.port,
    pp.country_code,
    pp.is_healthy,
    pp.is_available,
    COALESCE(
        json_agg(
            json_build_object(
                'account_id', paa.account_id,
                'platform', paa.platform,
                'username', a.username
            )
        ) FILTER (WHERE paa.id IS NOT NULL),
        '[]'::json
    ) AS assignments,
    COUNT(paa.id) AS assignment_count
FROM proxy_pool pp
LEFT JOIN proxy_account_assignments paa ON paa.proxy_id = pp.id
LEFT JOIN accounts a ON a.id = paa.account_id
GROUP BY pp.id, pp.host, pp.port, pp.country_code, pp.is_healthy, pp.is_available;

-- Note: The old assigned_account_id column on proxy_pool is kept for now
-- for backwards compatibility. It can be dropped after verifying the junction
-- table works correctly:
-- ALTER TABLE proxy_pool DROP COLUMN assigned_account_id;
