/**
 * ContentHub - Warmup Scheduler
 * Runs on VPS via PM2. Schedules and executes warmup sessions
 * for all active accounts throughout the day.
 *
 * Uses p-queue for concurrency control (max 3 browser instances).
 * Sessions are staggered with randomized delays to appear organic.
 *
 * Usage: npx tsx warmup-scheduler.ts
 */

import PQueue from 'p-queue';
import { createClient } from '@supabase/supabase-js';
import { WarmupAgent, WarmupConfig } from './warmup-agent';
import { SUPABASE_CONFIG, SERVER_CONFIG, loadConfig } from './config';
import 'dotenv/config';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Configurable via app_settings
let SESSIONS_PER_DAY = 3;
let MIN_DURATION_SEC = 300;
let MAX_DURATION_SEC = 900;
let MAX_CONCURRENT = 3;
let WARMUP_ENABLED = true;

// Check interval: every 15 minutes
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Queue for limiting concurrent browser instances
let queue: PQueue;

interface AccountForWarmup {
    id: string;
    platform: string;
    username: string;
    proxy_url: string | null;
    proxy_username: string | null;
    proxy_password: string | null;
}

async function loadWarmupConfig(): Promise<void> {
    const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
            'warmup_sessions_per_day',
            'warmup_min_duration_sec',
            'warmup_max_duration_sec',
            'warmup_max_concurrent',
            'warmup_enabled',
        ]);

    const settings: Record<string, string> = {};
    for (const row of data || []) {
        settings[row.key] = row.value;
    }

    SESSIONS_PER_DAY = parseInt(settings['warmup_sessions_per_day'] || '3', 10);
    MIN_DURATION_SEC = parseInt(settings['warmup_min_duration_sec'] || '300', 10);
    MAX_DURATION_SEC = parseInt(settings['warmup_max_duration_sec'] || '900', 10);
    MAX_CONCURRENT = parseInt(settings['warmup_max_concurrent'] || '3', 10);
    WARMUP_ENABLED = settings['warmup_enabled'] !== 'false';
}

async function getActiveAccounts(): Promise<AccountForWarmup[]> {
    const { data, error } = await supabase
        .from('accounts')
        .select('id, platform, username, proxy_url, proxy_username, proxy_password')
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[Scheduler] Error loading accounts:', error.message);
        return [];
    }

    return data || [];
}

async function getSessionsToday(accountId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
        .from('warmup_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['completed', 'running'])
        .gte('created_at', today.toISOString());

    if (error) return 999; // Assume maxed out on error
    return count || 0;
}

async function runWarmupForAccount(account: AccountForWarmup): Promise<void> {
    const config: WarmupConfig = {
        accountId: account.id,
        platform: account.platform as 'tiktok' | 'instagram' | 'youtube',
        username: account.username,
        proxyUrl: account.proxy_url || undefined,
        proxyUsername: account.proxy_username || undefined,
        proxyPassword: account.proxy_password || undefined,
        minDurationSec: MIN_DURATION_SEC,
        maxDurationSec: MAX_DURATION_SEC,
        headless: true,
    };

    const agent = new WarmupAgent(config);
    const result = await agent.runSession();

    if (result.success) {
        console.log(`[Scheduler] @${account.username}: ${result.actionsPerformed} actions in ${result.durationSec}s`);
    } else {
        console.error(`[Scheduler] @${account.username}: Failed - ${result.error}`);
    }
}

async function scheduleRound(): Promise<void> {
    if (!WARMUP_ENABLED) {
        console.log('[Scheduler] Warmup disabled, skipping round.');
        return;
    }

    // Reload config each round
    await loadWarmupConfig();

    const accounts = await getActiveAccounts();
    if (accounts.length === 0) {
        console.log('[Scheduler] No active accounts.');
        return;
    }

    console.log(`[Scheduler] Checking ${accounts.length} accounts (${SESSIONS_PER_DAY} sessions/day, max ${MAX_CONCURRENT} concurrent)...`);

    // Update queue concurrency
    queue.concurrency = MAX_CONCURRENT;

    let scheduled = 0;

    for (const account of accounts) {
        const sessionsToday = await getSessionsToday(account.id);

        if (sessionsToday >= SESSIONS_PER_DAY) {
            continue; // Already done for today
        }

        // Add random delay before starting (0-5 min stagger)
        const staggerMs = Math.floor(Math.random() * 5 * 60 * 1000);

        queue.add(async () => {
            await new Promise(resolve => setTimeout(resolve, staggerMs));
            await runWarmupForAccount(account);
        });

        scheduled++;
    }

    if (scheduled > 0) {
        console.log(`[Scheduler] Queued ${scheduled} warmup sessions.`);
    } else {
        console.log('[Scheduler] All accounts have completed their sessions for today.');
    }
}

async function main(): Promise<void> {
    console.log('[Scheduler] Starting Warmup Scheduler...');

    // Load config from Supabase
    await loadConfig();
    await loadWarmupConfig();

    queue = new PQueue({ concurrency: MAX_CONCURRENT });

    console.log(`[Scheduler] Config: ${SESSIONS_PER_DAY} sessions/day, ${MIN_DURATION_SEC}-${MAX_DURATION_SEC}s, max ${MAX_CONCURRENT} concurrent`);
    console.log(`[Scheduler] Checking every ${CHECK_INTERVAL_MS / 60000} minutes.`);

    // Run immediately on start
    await scheduleRound();

    // Then check periodically
    setInterval(async () => {
        try {
            await scheduleRound();
        } catch (err: any) {
            console.error('[Scheduler] Round error:', err.message);
        }
    }, CHECK_INTERVAL_MS);
}

main().catch(err => {
    console.error('[Scheduler] Fatal error:', err);
    process.exit(1);
});
