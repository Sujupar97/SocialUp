/**
 * ContentHub - Configuration
 * Credentials loaded from environment variables with Supabase fallback.
 * Call loadConfig() at server startup to load from app_settings + Vault.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Supabase config (always from env — needed to bootstrap)
export const SUPABASE_CONFIG = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
};

// Gemini AI config
export const GEMINI_CONFIG = {
    apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '',
    model: 'gemini-2.5-flash'
};

// TikTok API config
export const TIKTOK_CONFIG = {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    apiBaseUrl: 'https://open.tiktokapis.com',
};

// YouTube API config
export const YOUTUBE_CONFIG = {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
};

// Instagram/Facebook API config
export const INSTAGRAM_CONFIG = {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
};

// Working directories
export const PATHS = {
    sessions: './sessions',
    processed: './processed',
    uploads: './uploads'
};

// Server config (mutable — updated by loadConfig())
export const SERVER_CONFIG = {
    port: parseInt(process.env.AUTOMATION_SERVER_PORT || '3001', 10),
    n8nWebhookBase: process.env.N8N_WEBHOOK_BASE || process.env.VITE_N8N_WEBHOOK_BASE || '',
    maxConcurrentPublishes: 5,
    warmupSessionsPerDay: 3,
};

/**
 * Load configuration from Supabase app_settings table.
 * Updates GEMINI_CONFIG, TIKTOK_CONFIG, and SERVER_CONFIG in-place.
 * Falls back to env vars if Supabase is unreachable.
 */
export async function loadConfig(): Promise<void> {
    if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
        console.warn('Supabase not configured, using env vars only.');
        return;
    }

    try {
        const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

        // Load app_settings
        const { data, error } = await supabase
            .from('app_settings')
            .select('key, value');

        if (error) {
            console.warn('Failed to load app_settings:', error.message);
            return;
        }

        const settings: Record<string, string> = {};
        for (const row of data || []) {
            settings[row.key] = row.value;
        }

        // Update SERVER_CONFIG
        if (settings['n8n_webhook_base']) {
            SERVER_CONFIG.n8nWebhookBase = settings['n8n_webhook_base'];
        }
        if (settings['max_concurrent_publishes']) {
            SERVER_CONFIG.maxConcurrentPublishes = parseInt(settings['max_concurrent_publishes'], 10);
        }
        if (settings['warmup_sessions_per_day']) {
            SERVER_CONFIG.warmupSessionsPerDay = parseInt(settings['warmup_sessions_per_day'], 10);
        }

        // Try loading secrets from Vault via get-config Edge Function
        const { data: secretsData, error: secretsError } = await supabase.functions.invoke('get-config', {
            body: {
                keys: [
                    'secret:tiktok_client_key',
                    'secret:tiktok_client_secret',
                    'secret:gemini_api_key',
                    'secret:youtube_client_id',
                    'secret:youtube_client_secret',
                    'secret:facebook_app_id',
                    'secret:facebook_app_secret',
                ]
            }
        });

        if (!secretsError && secretsData?.settings) {
            const secrets = secretsData.settings;
            if (secrets['secret:tiktok_client_key']) TIKTOK_CONFIG.clientKey = secrets['secret:tiktok_client_key'];
            if (secrets['secret:tiktok_client_secret']) TIKTOK_CONFIG.clientSecret = secrets['secret:tiktok_client_secret'];
            if (secrets['secret:gemini_api_key']) GEMINI_CONFIG.apiKey = secrets['secret:gemini_api_key'];
            if (secrets['secret:youtube_client_id']) YOUTUBE_CONFIG.clientId = secrets['secret:youtube_client_id'];
            if (secrets['secret:youtube_client_secret']) YOUTUBE_CONFIG.clientSecret = secrets['secret:youtube_client_secret'];
            if (secrets['secret:facebook_app_id']) INSTAGRAM_CONFIG.appId = secrets['secret:facebook_app_id'];
            if (secrets['secret:facebook_app_secret']) INSTAGRAM_CONFIG.appSecret = secrets['secret:facebook_app_secret'];
        }

        console.log('Config loaded from Supabase. N8N base:', SERVER_CONFIG.n8nWebhookBase);
    } catch (err) {
        console.warn('Error loading config from Supabase, using env vars:', err);
    }
}
