-- ContentHub - Warmup System
-- Migration: 013_warmup_system.sql
-- Tables for automated account warmup (interaction sessions)

-- ====================
-- WARMUP SESSIONS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS warmup_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    session_duration_sec INTEGER,
    actions_count INTEGER DEFAULT 0,
    actions_summary JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warmup_sessions_account ON warmup_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_sessions_status ON warmup_sessions(status);
CREATE INDEX IF NOT EXISTS idx_warmup_sessions_created ON warmup_sessions(created_at);

-- ====================
-- WARMUP ACTIONS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS warmup_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES warmup_sessions(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('scroll', 'watch', 'like', 'comment', 'save', 'follow', 'visit_profile', 'search')),
    target_url TEXT,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warmup_actions_session ON warmup_actions(session_id);

-- ====================
-- WARMUP CONFIG IN APP_SETTINGS
-- ====================
INSERT INTO app_settings (key, value, description) VALUES
    ('warmup_sessions_per_day', '3', 'Number of warmup sessions per account per day'),
    ('warmup_min_duration_sec', '300', 'Minimum warmup session duration in seconds (5 min)'),
    ('warmup_max_duration_sec', '900', 'Maximum warmup session duration in seconds (15 min)'),
    ('warmup_max_concurrent', '3', 'Maximum concurrent browser instances for warmup'),
    ('warmup_enabled', 'true', 'Whether warmup scheduler is active')
ON CONFLICT (key) DO NOTHING;

-- ====================
-- VIEW: Today's warmup stats per account
-- ====================
CREATE OR REPLACE VIEW warmup_daily_stats AS
SELECT
    a.id AS account_id,
    a.username,
    a.platform,
    COUNT(ws.id) FILTER (WHERE ws.created_at >= CURRENT_DATE AND ws.status = 'completed') AS sessions_today,
    COUNT(ws.id) FILTER (WHERE ws.created_at >= CURRENT_DATE AND ws.status = 'running') AS sessions_running,
    MAX(ws.ended_at) FILTER (WHERE ws.status = 'completed') AS last_session_at,
    COALESCE(SUM(ws.actions_count) FILTER (WHERE ws.created_at >= CURRENT_DATE AND ws.status = 'completed'), 0) AS actions_today
FROM accounts a
LEFT JOIN warmup_sessions ws ON ws.account_id = a.id
WHERE a.is_active = true
GROUP BY a.id, a.username, a.platform;
