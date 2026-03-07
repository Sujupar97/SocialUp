/**
 * App Configuration Service
 * Loads settings from Supabase app_settings table via get-config Edge Function.
 * Caches in memory to avoid repeated calls.
 */

import { supabase } from './supabase';

let configCache: Record<string, string> | null = null;
let configLoading: Promise<Record<string, string>> | null = null;
const emptyConfig: Record<string, string> = {};

const CONFIG_KEYS = [
    'n8n_webhook_base',
    'n8n_generate_descriptions',
    'n8n_update_status',
    'n8n_save_comment',
    'n8n_publish_tiktok',
    'n8n_publish_instagram',
    'n8n_post_comment',
    'n8n_fetch_analytics',
    'automation_server_url',
    'browser_server_ws',
    'max_concurrent_publishes',
    'warmup_sessions_per_day',
];

/**
 * Load all app settings from Supabase. Caches result in memory.
 */
export async function loadAppConfig(): Promise<Record<string, string>> {
    if (configCache) return configCache;

    // Deduplicate concurrent calls
    if (configLoading) return configLoading;

    const promise = (async (): Promise<Record<string, string>> => {
        try {
            const { data, error } = await supabase.functions.invoke('get-config', {
                body: { keys: CONFIG_KEYS }
            });

            if (error) {
                console.error('Failed to load app config:', error.message);
                return emptyConfig;
            }

            configCache = (data?.settings as Record<string, string>) || emptyConfig;
            return configCache;
        } catch (err) {
            console.error('Error loading app config:', err);
            return emptyConfig;
        } finally {
            configLoading = null;
        }
    })();

    configLoading = promise;
    return promise;
}

/**
 * Get a single config value. Loads config if not cached.
 */
export async function getConfigValue(key: string): Promise<string> {
    const config = await loadAppConfig();
    return config[key] || '';
}

/**
 * Build full N8N webhook URL from base + path.
 */
export async function getN8NWebhookUrl(pathKey: string): Promise<string> {
    const config = await loadAppConfig();
    const base = config['n8n_webhook_base'] || '';
    const path = config[pathKey] || '';
    if (!base) return '';
    return `${base}${path}`;
}

/**
 * Clear cached config (force reload on next call).
 */
export function clearConfigCache(): void {
    configCache = null;
}
