-- Migration 019: Account credentials for automated login
-- Stores login credentials so the warmup agent can auto-login when sessions expire.
-- Passwords are stored per-account. In production, consider encrypting with pgcrypto.

-- Login password for each account
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS login_password TEXT;

-- Account creation tracking
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS creation_method TEXT DEFAULT 'manual'
    CHECK (creation_method IN ('manual', 'oauth', 'automated'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS login_failures INT DEFAULT 0;

-- Account creation jobs table
CREATE TABLE IF NOT EXISTS account_creation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    email_address TEXT NOT NULL,
    username TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'creating', 'verifying_email', 'completed', 'failed')),
    account_id UUID REFERENCES accounts(id),
    proxy_id UUID,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creation_jobs_status ON account_creation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_creation_jobs_platform ON account_creation_jobs(platform);
