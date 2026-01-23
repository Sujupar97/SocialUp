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

// N8N Webhook URLs (Configurados y Activos)
export const N8N_WEBHOOKS = {
    BASE: 'http://localhost:5679/webhook',
    GENERATE_DESCRIPTIONS: 'http://localhost:5679/webhook/contenthub-generate-descriptions',
    UPDATE_STATUS: 'http://localhost:5679/webhook/contenthub-update-status',
    SAVE_COMMENT: 'http://localhost:5679/webhook/contenthub-save-comment',
    PUBLISH_TIKTOK: 'http://localhost:5679/webhook/contenthub-publish-tiktok',
    PUBLISH_INSTAGRAM: 'http://localhost:5679/webhook/contenthub-publish-instagram',
    POST_COMMENT: 'http://localhost:5679/webhook/contenthub-post-comment',
    FETCH_ANALYTICS: 'http://localhost:5679/webhook/contenthub-fetch-analytics',
};

// Limits
export const MAX_ACCOUNTS = 15;
export const MIN_ACCOUNTS = 10;
