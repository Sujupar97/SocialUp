-- Migration 018: Email verification system
-- Adds email_address and verification_status to accounts,
-- creates email_verifications table for storing received codes,
-- and adds warmup action limit settings.

-- Email address for each account (used for login + verification)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_address TEXT;

-- Verification status tracking
-- ok: normal operation
-- needs_email: platform requested email verification
-- needs_sms: platform requested SMS verification
-- needs_captcha: platform showed CAPTCHA
-- blocked: account is blocked/suspended
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'ok';

-- Verification codes received via email (Cloudflare Worker → Supabase)
CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_address TEXT NOT NULL,
    platform TEXT,
    verification_code TEXT NOT NULL,
    subject TEXT,
    sender TEXT,
    is_consumed BOOLEAN DEFAULT false,
    received_at TIMESTAMPTZ DEFAULT now(),
    consumed_at TIMESTAMPTZ,
    consumed_by_session_id UUID REFERENCES warmup_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup
    ON email_verifications(email_address, is_consumed)
    WHERE is_consumed = false;

CREATE INDEX IF NOT EXISTS idx_email_verifications_received
    ON email_verifications(received_at DESC);

-- App settings for email and warmup limits
INSERT INTO app_settings (key, value, description) VALUES
    ('email_domain', '', 'Catch-all domain for account emails (e.g., socialupmail.com)'),
    ('email_provider', 'supabase', 'Email verification backend: supabase (polling DB) or imap'),
    ('email_verification_timeout_sec', '120', 'Timeout in seconds waiting for verification code'),
    ('warmup_sessions_per_day', '4', 'Number of warmup sessions per account per day'),
    ('warmup_max_likes', '15', 'Max likes per warmup session'),
    ('warmup_max_follows', '5', 'Max follows per warmup session'),
    ('warmup_max_comments', '3', 'Max comments per warmup session')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description;
