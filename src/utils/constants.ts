// Constants
export const APP_NAME = 'SocialUp';

export const PLATFORMS = {
    TIKTOK: 'tiktok',
    INSTAGRAM: 'instagram',
} as const;

export const DISTRIBUTION_STATUS = {
    PENDING: 'pending',
    PUBLISHING: 'publishing',
    PUBLISHED: 'published',
    FAILED: 'failed',
} as const;

export const CTA_TYPES = {
    FIRST_COMMENT: 'first_comment',
    KEYWORD_RESPONSE: 'keyword_response',
} as const;

// N8N Webhook URLs — populated from Supabase via initializeConfig(), env vars as fallback
const n8nBase = import.meta.env.VITE_N8N_WEBHOOK_BASE || '';

export const N8N_WEBHOOKS: Record<string, string> = {
    BASE: n8nBase,
    GENERATE_DESCRIPTIONS: import.meta.env.VITE_N8N_GENERATE_DESCRIPTIONS || `${n8nBase}/contenthub-generate-descriptions`,
    UPDATE_STATUS: import.meta.env.VITE_N8N_UPDATE_STATUS || `${n8nBase}/contenthub-update-status`,
    SAVE_COMMENT: import.meta.env.VITE_N8N_SAVE_COMMENT || `${n8nBase}/contenthub-save-comment`,
    PUBLISH_TIKTOK: import.meta.env.VITE_N8N_PUBLISH_TIKTOK || `${n8nBase}/contenthub-publish-tiktok`,
    PUBLISH_INSTAGRAM: import.meta.env.VITE_N8N_PUBLISH_INSTAGRAM || `${n8nBase}/contenthub-publish-instagram`,
    POST_COMMENT: import.meta.env.VITE_N8N_POST_COMMENT || `${n8nBase}/contenthub-post-comment`,
    FETCH_ANALYTICS: import.meta.env.VITE_N8N_FETCH_ANALYTICS || `${n8nBase}/contenthub-fetch-analytics`,
};

// Automation server URLs — populated from Supabase via initializeConfig(), env vars as fallback
export let AUTOMATION_SERVER = import.meta.env.VITE_AUTOMATION_SERVER || '';
export let BROWSER_SERVER_WS = import.meta.env.VITE_BROWSER_SERVER_WS || '';

/**
 * Load config from Supabase app_settings and update the exported values.
 * Call once at app startup (e.g., in main.tsx or App.tsx).
 */
export async function initializeConfig(): Promise<void> {
    try {
        const { loadAppConfig } = await import('../services/appConfig');
        const config = await loadAppConfig();

        if (!config || Object.keys(config).length === 0) return;

        const base = config['n8n_webhook_base'] || N8N_WEBHOOKS.BASE;

        N8N_WEBHOOKS.BASE = base;
        N8N_WEBHOOKS.GENERATE_DESCRIPTIONS = `${base}${config['n8n_generate_descriptions'] || '/contenthub-generate-descriptions'}`;
        N8N_WEBHOOKS.UPDATE_STATUS = `${base}${config['n8n_update_status'] || '/contenthub-update-status'}`;
        N8N_WEBHOOKS.SAVE_COMMENT = `${base}${config['n8n_save_comment'] || '/contenthub-save-comment'}`;
        N8N_WEBHOOKS.PUBLISH_TIKTOK = `${base}${config['n8n_publish_tiktok'] || '/contenthub-publish-tiktok'}`;
        N8N_WEBHOOKS.PUBLISH_INSTAGRAM = `${base}${config['n8n_publish_instagram'] || '/contenthub-publish-instagram'}`;
        N8N_WEBHOOKS.POST_COMMENT = `${base}${config['n8n_post_comment'] || '/contenthub-post-comment'}`;
        N8N_WEBHOOKS.FETCH_ANALYTICS = `${base}${config['n8n_fetch_analytics'] || '/contenthub-fetch-analytics'}`;

        if (config['automation_server_url']) AUTOMATION_SERVER = config['automation_server_url'];
        if (config['browser_server_ws']) BROWSER_SERVER_WS = config['browser_server_ws'];

        console.log('Config loaded from Supabase. N8N base:', base);
    } catch (err) {
        console.warn('Failed to load config from Supabase, using env vars:', err);
    }
}

// Limits
export const MAX_ACCOUNTS = 50;
export const MIN_ACCOUNTS = 10;
