import { N8N_WEBHOOKS } from '../utils/constants';

interface N8NResponse {
    success: boolean;
    message?: string;
    data?: unknown;
}

/**
 * Llamar a un webhook de N8N
 */
async function callN8NWebhook(webhookUrl: string, payload: unknown): Promise<N8NResponse> {
    if (!webhookUrl) {
        console.warn('N8N webhook URL not configured');
        return { success: false, message: 'Webhook URL not configured' };
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error('Error calling N8N webhook:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Disparar publicación en TikTok via N8N
 */
export async function triggerTikTokPublish(payload: {
    video_copy_id: string;
    video_url: string;
    account_username: string;
    description: string;
    first_comment?: string;
}): Promise<N8NResponse> {
    return callN8NWebhook(N8N_WEBHOOKS.PUBLISH_TIKTOK, payload);
}

/**
 * Disparar publicación en Instagram via N8N
 */
export async function triggerInstagramPublish(payload: {
    video_copy_id: string;
    video_url: string;
    account_username: string;
    description: string;
}): Promise<N8NResponse> {
    return callN8NWebhook(N8N_WEBHOOKS.PUBLISH_INSTAGRAM, payload);
}

/**
 * Disparar publicación de primer comentario via N8N
 */
export async function triggerPostComment(payload: {
    video_copy_id: string;
    external_post_id: string;
    account_username: string;
    comment_text: string;
}): Promise<N8NResponse> {
    return callN8NWebhook(N8N_WEBHOOKS.POST_COMMENT, payload);
}

/**
 * Disparar obtención de analytics via N8N
 */
export async function triggerFetchAnalytics(payload: {
    video_copy_id: string;
    external_post_id: string;
    account_username: string;
}): Promise<N8NResponse> {
    return callN8NWebhook(N8N_WEBHOOKS.FETCH_ANALYTICS, payload);
}
