-- Migration: 017_instagram_fields.sql
-- Add Instagram-specific columns to accounts table
-- Platform 'instagram' already exists in CHECK constraint (016)

-- instagram_user_id: The IG Business Account ID from Graph API (needed for publishing)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;

-- facebook_page_id: The linked Facebook Page ID (needed to discover IG account)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;

-- Index for IG user ID lookups
CREATE INDEX IF NOT EXISTS idx_accounts_instagram_user_id ON accounts(instagram_user_id) WHERE instagram_user_id IS NOT NULL;

-- App settings for Instagram
INSERT INTO app_settings (key, value, description) VALUES
    ('instagram_max_caption_length', '2200', 'Maximum caption length for Instagram Reels'),
    ('instagram_max_hashtags', '30', 'Maximum hashtags per Instagram post'),
    ('instagram_daily_publish_limit', '25', 'Instagram API limit: 25 posts per 24h per account'),
    ('instagram_graph_api_version', 'v22.0', 'Instagram Graph API version')
ON CONFLICT (key) DO NOTHING;
