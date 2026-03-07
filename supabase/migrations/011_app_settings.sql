-- App Settings: key-value store for application configuration
-- Non-secret config lives here. Secrets go in Supabase Vault.

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update timestamp on change
CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_settings_updated
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_app_settings_timestamp();

-- N8N webhook configuration
INSERT INTO app_settings (key, value, description) VALUES
    ('n8n_webhook_base', 'https://n8n.srv991927.hstgr.cloud/webhook', 'Base URL for N8N webhooks'),
    ('n8n_generate_descriptions', '/contenthub-generate-descriptions', 'N8N path: generate descriptions'),
    ('n8n_update_status', '/contenthub-update-status', 'N8N path: update status'),
    ('n8n_save_comment', '/contenthub-save-comment', 'N8N path: save comment'),
    ('n8n_publish_tiktok', '/contenthub-publish-tiktok', 'N8N path: publish to TikTok'),
    ('n8n_publish_instagram', '/contenthub-publish-instagram', 'N8N path: publish to Instagram'),
    ('n8n_post_comment', '/contenthub-post-comment', 'N8N path: post comment'),
    ('n8n_fetch_analytics', '/contenthub-fetch-analytics', 'N8N path: fetch analytics'),
    ('automation_server_url', '', 'URL of the automation server (Express backend on VPS)'),
    ('browser_server_ws', '', 'WebSocket URL for browser server'),
    ('max_concurrent_publishes', '5', 'Max parallel publish jobs'),
    ('warmup_sessions_per_day', '3', 'Warmup sessions per account per day')
ON CONFLICT (key) DO NOTHING;

-- Helper function for Edge Functions to read Vault secrets
CREATE OR REPLACE FUNCTION get_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    secret_value TEXT;
BEGIN
    SELECT decrypted_secret INTO secret_value
    FROM vault.decrypted_secrets
    WHERE name = secret_name
    LIMIT 1;
    RETURN secret_value;
END;
$$;

-- INSTRUCTIONS: Store secrets in Supabase Vault via SQL Editor:
--
-- SELECT vault.create_secret('tiktok_client_key', '<YOUR_CLIENT_KEY>');
-- SELECT vault.create_secret('tiktok_client_secret', '<YOUR_CLIENT_SECRET>');
-- SELECT vault.create_secret('gemini_api_key', '<YOUR_GEMINI_KEY>');
--
-- To read secrets (from Edge Functions with service role):
-- SELECT get_secret('tiktok_client_key');
