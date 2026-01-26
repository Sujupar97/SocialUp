-- Migration: 005_add_oauth_fields.sql
-- Add OAuth fields to accounts table

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS open_id TEXT,
ADD COLUMN IF NOT EXISTS expires_in INTEGER,
ADD COLUMN IF NOT EXISTS token_type TEXT,
ADD COLUMN IF NOT EXISTS scope TEXT;

-- Index for open_id lookups
CREATE INDEX IF NOT EXISTS idx_accounts_open_id ON accounts(open_id);
