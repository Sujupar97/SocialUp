-- Migration: 016_youtube_platform.sql
-- Add YouTube as a supported platform + channel_id column for YouTube accounts

-- ====================
-- UPDATE PLATFORM CHECK CONSTRAINT
-- ====================
-- Drop old constraint and add new one with 'youtube'
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_platform_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_platform_check
    CHECK (platform IN ('tiktok', 'instagram', 'youtube'));

-- ====================
-- ADD YOUTUBE-SPECIFIC COLUMNS
-- ====================
-- channel_id: YouTube channel ID (e.g., UCxxxxxx)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS channel_id TEXT;

-- scope already exists (migration 005)
-- expires_at already exists (migration 006)

-- Index for looking up accounts by channel_id
CREATE INDEX IF NOT EXISTS idx_accounts_channel_id ON accounts(channel_id) WHERE channel_id IS NOT NULL;

-- ====================
-- APP SETTINGS FOR YOUTUBE
-- ====================
INSERT INTO app_settings (key, value, description) VALUES
    ('youtube_max_title_length', '100', 'Maximum title length for YouTube Shorts'),
    ('youtube_max_description_length', '5000', 'Maximum description length for YouTube'),
    ('youtube_default_category_id', '22', 'Default YouTube category: People & Blogs'),
    ('youtube_default_privacy', 'public', 'Default privacy status for YouTube uploads')
ON CONFLICT (key) DO NOTHING;
