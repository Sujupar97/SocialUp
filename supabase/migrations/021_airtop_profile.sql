-- Migration 021: Add airtop_profile_name to accounts
-- Stores the Airtop profile name for browser session reuse.
-- This allows warmup sessions to reuse the same browser fingerprint
-- and cookies that were used during account creation.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS airtop_profile_name TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_airtop_profile
    ON accounts(airtop_profile_name)
    WHERE airtop_profile_name IS NOT NULL;
