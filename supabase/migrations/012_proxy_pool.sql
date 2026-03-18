-- Migration: 012_proxy_pool.sql
-- Proxy pool for automatic proxy assignment to accounts

CREATE TABLE IF NOT EXISTS proxy_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'manual',  -- 'webshare', 'iproyal', 'manual'
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT,
    password TEXT,
    protocol TEXT NOT NULL DEFAULT 'http',     -- 'http', 'https', 'socks5'
    country_code TEXT,                         -- 'US', 'MX', etc.
    is_available BOOLEAN NOT NULL DEFAULT true,
    assigned_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    is_healthy BOOLEAN NOT NULL DEFAULT true,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (host, port, username)
);

CREATE INDEX idx_proxy_pool_available ON proxy_pool (is_available, is_healthy) WHERE is_available = true AND is_healthy = true;
CREATE INDEX idx_proxy_pool_account ON proxy_pool (assigned_account_id) WHERE assigned_account_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_proxy_pool_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proxy_pool_updated
    BEFORE UPDATE ON proxy_pool
    FOR EACH ROW
    EXECUTE FUNCTION update_proxy_pool_timestamp();

-- When assigned_account_id becomes NULL (account deleted), mark proxy as available
CREATE OR REPLACE FUNCTION release_proxy_on_unassign()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.assigned_account_id IS NOT NULL AND NEW.assigned_account_id IS NULL THEN
        NEW.is_available = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proxy_pool_release
    BEFORE UPDATE ON proxy_pool
    FOR EACH ROW
    EXECUTE FUNCTION release_proxy_on_unassign();

-- Atomic proxy assignment RPC (prevents race conditions)
CREATE OR REPLACE FUNCTION assign_next_proxy(p_account_id UUID)
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
    SELECT pp.id INTO found_id
    FROM proxy_pool pp
    WHERE pp.is_available = true AND pp.is_healthy = true
    ORDER BY pp.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF found_id IS NULL THEN
        RAISE EXCEPTION 'No available proxies in pool';
    END IF;

    UPDATE proxy_pool SET
        is_available = false,
        assigned_account_id = p_account_id
    WHERE proxy_pool.id = found_id;

    RETURN QUERY
    SELECT pp.id, pp.host, pp.port, pp.username, pp.password, pp.protocol
    FROM proxy_pool pp
    WHERE pp.id = found_id;
END;
$$;

-- Release proxy RPC
CREATE OR REPLACE FUNCTION release_proxy(p_account_id UUID)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE proxy_pool SET
        is_available = true,
        assigned_account_id = NULL
    WHERE assigned_account_id = p_account_id;
END;
$$;

-- App settings for proxy management
INSERT INTO app_settings (key, value, description) VALUES
    ('proxy_provider', 'webshare', 'Active proxy provider: webshare, iproyal, manual, none'),
    ('proxy_auto_assign', 'true', 'Auto-assign proxies from pool when connecting accounts')
ON CONFLICT (key) DO NOTHING;

-- INSTRUCTIONS: Store proxy provider API keys in Supabase Vault:
--
-- SELECT vault.create_secret('webshare_api_key', '<YOUR_WEBSHARE_API_KEY>');
-- SELECT vault.create_secret('iproyal_api_key', '<YOUR_IPROYAL_API_KEY>');
