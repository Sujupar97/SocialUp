-- ContentHub Database Schema
-- Migration: 001_initial_schema.sql

-- ====================
-- ACCOUNTS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram')),
    username TEXT NOT NULL,
    display_name TEXT,
    profile_photo_url TEXT,
    bio TEXT,
    access_token TEXT,
    refresh_token TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active);

-- ====================
-- VIDEOS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    description_template TEXT,
    call_to_action_type TEXT CHECK (call_to_action_type IN ('first_comment', 'keyword_response')),
    call_to_action_text TEXT,
    keyword_trigger TEXT,
    auto_response_text TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ====================
-- VIDEO COPIES TABLE
-- ====================
CREATE TABLE IF NOT EXISTS video_copies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    copy_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    generated_description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
    published_at TIMESTAMPTZ,
    external_post_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for video_copies
CREATE INDEX IF NOT EXISTS idx_video_copies_video_id ON video_copies(video_id);
CREATE INDEX IF NOT EXISTS idx_video_copies_account_id ON video_copies(account_id);
CREATE INDEX IF NOT EXISTS idx_video_copies_status ON video_copies(status);

-- ====================
-- ANALYTICS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_copy_id UUID REFERENCES video_copies(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_video_copy_id ON analytics(video_copy_id);

-- ====================
-- AUTO COMMENTS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS auto_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_copy_id UUID REFERENCES video_copies(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    posted_at TIMESTAMPTZ DEFAULT now()
);

-- ====================
-- KEYWORD RESPONSES TABLE
-- ====================
CREATE TABLE IF NOT EXISTS keyword_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_copy_id UUID REFERENCES video_copies(id) ON DELETE CASCADE,
    trigger_comment_text TEXT,
    response_text TEXT NOT NULL,
    responded_at TIMESTAMPTZ DEFAULT now()
);

-- ====================
-- UPDATED_AT TRIGGER
-- ====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at 
    BEFORE UPDATE ON accounts 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- ====================
-- VIEWS FOR DASHBOARD
-- ====================

-- Aggregated account stats view
CREATE OR REPLACE VIEW account_stats AS
SELECT 
    a.id,
    a.username,
    a.platform,
    a.profile_photo_url,
    COUNT(DISTINCT vc.id) as total_posts,
    COALESCE(SUM(an.views), 0) as total_views,
    COALESCE(SUM(an.likes), 0) as total_likes,
    COALESCE(SUM(an.comments), 0) as total_comments,
    COALESCE(SUM(an.shares), 0) as total_shares
FROM accounts a
LEFT JOIN video_copies vc ON vc.account_id = a.id AND vc.status = 'published'
LEFT JOIN analytics an ON an.video_copy_id = vc.id
WHERE a.is_active = true
GROUP BY a.id, a.username, a.platform, a.profile_photo_url;

-- Dashboard totals view
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT 
    (SELECT COUNT(*) FROM accounts) as total_accounts,
    (SELECT COUNT(*) FROM accounts WHERE is_active = true) as active_accounts,
    (SELECT COUNT(*) FROM videos) as total_videos,
    (SELECT COUNT(*) FROM video_copies) as total_distributions,
    (SELECT COALESCE(SUM(views), 0) FROM analytics) as total_views,
    (SELECT COALESCE(SUM(likes), 0) FROM analytics) as total_likes,
    (SELECT COALESCE(SUM(comments), 0) FROM analytics) as total_comments,
    (SELECT COALESCE(SUM(shares), 0) FROM analytics) as total_shares;
