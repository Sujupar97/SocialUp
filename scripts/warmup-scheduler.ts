/**
 * ContentHub - Warmup Scheduler
 * Runs on VPS via PM2. Schedules and executes warmup sessions
 * for all active accounts throughout the day.
 *
 * Uses p-queue for concurrency control (max 3 browser instances).
 * Sessions are distributed across 4 time windows per day to appear organic.
 * Accounts with verification issues are automatically skipped.
 *
 * Usage: npx tsx warmup-scheduler.ts
 */

import PQueue from 'p-queue';
import { createClient } from '@supabase/supabase-js';
import { WarmupAgent, WarmupConfig } from './warmup-agent';
import { SUPABASE_CONFIG, loadConfig } from './config';
import 'dotenv/config';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Configurable via app_settings
let SESSIONS_PER_DAY = 4;
let MIN_DURATION_SEC = 300;
let MAX_DURATION_SEC = 900;
let MAX_CONCURRENT = 3;
let WARMUP_ENABLED = true;
let MAX_LIKES = 15;
let MAX_FOLLOWS = 5;
let MAX_COMMENTS = 3;

// Check interval: every 15 minutes
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Time windows for session distribution (Colombia timezone UTC-5)
// Each window is a 2-hour range during which a session should run
const SESSION_WINDOWS = [
    { start: 8, end: 10 },   // Morning
    { start: 12, end: 14 },  // Midday
    { start: 17, end: 19 },  // Afternoon
    { start: 21, end: 23 },  // Evening
];

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
            'warmup_max_likes',
            'warmup_max_follows',
            'warmup_max_comments',
        ]);

    const settings: Record<string, string> = {};
    for (const row of data || []) {
        settings[row.key] = row.value;
    }

    SESSIONS_PER_DAY = parseInt(settings['warmup_sessions_per_day'] || '4', 10);
    MIN_DURATION_SEC = parseInt(settings['warmup_min_duration_sec'] || '300', 10);
    MAX_DURATION_SEC = parseInt(settings['warmup_max_duration_sec'] || '900', 10);
    MAX_CONCURRENT = parseInt(settings['warmup_max_concurrent'] || '3', 10);
    WARMUP_ENABLED = settings['warmup_enabled'] !== 'false';
    MAX_LIKES = parseInt(settings['warmup_max_likes'] || '15', 10);
    MAX_FOLLOWS = parseInt(settings['warmup_max_follows'] || '5', 10);
    MAX_COMMENTS = parseInt(settings['warmup_max_comments'] || '3', 10);
}

/**
 * Get current time window index (0-3) based on Colombia time.
 * Returns -1 if outside all windows.
 */
function getCurrentWindowIndex(): number {
    const now = new Date();
    // Colombia is UTC-5
    const colombiaHour = (now.getUTCHours() - 5 + 24) % 24;

    for (let i = 0; i < SESSION_WINDOWS.length; i++) {
        if (colombiaHour >= SESSION_WINDOWS[i].start && colombiaHour < SESSION_WINDOWS[i].end) {
            return i;
        }
    }
    return -1;
}

async function getActiveAccounts(): Promise<AccountForWarmup[]> {
    const query = supabase
        .from('accounts')
        .select('id, platform, username, proxy_url, proxy_username, proxy_password')
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .order('created_at', { ascending: true });

    // Filter out accounts with verification issues
    // Only run warmup on accounts with 'ok' status or no status set
    const { data, error } = await query;

    if (error) {
        console.error('[Scheduler] Error loading accounts:', error.message);
        return [];
    }

    // Filter in code since verification_status might not exist yet in all accounts
    return (data || []).filter(a => {
        const status = (a as any).verification_status;
        return !status || status === 'ok';
    });
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

/**
 * Get sessions completed in the current time window for an account.
 * Each window should have at most 1 session.
 */
async function getSessionsInCurrentWindow(accountId: string, windowIndex: number): Promise<number> {
    if (windowIndex < 0) return 999; // Outside windows, don't schedule

    const window = SESSION_WINDOWS[windowIndex];
    const now = new Date();

    // Calculate window start time in UTC
    const windowStartUTC = new Date(now);
    windowStartUTC.setUTCHours(window.start + 5, 0, 0, 0); // +5 to convert Colombia to UTC

    const { count, error } = await supabase
        .from('warmup_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['completed', 'running'])
        .gte('created_at', windowStartUTC.toISOString());

    if (error) return 999;
    return count || 0;
}

function getActionLimits(platform: string): Record<string, number> {
    const limits: Record<string, number> = {
        like: MAX_LIKES,
        follow: MAX_FOLLOWS,
        comment: MAX_COMMENTS,
    };

    // YouTube: no comments, no saves
    if (platform === 'youtube') {
        limits.comment = 0;
        limits.save = 0;
    }

    // Instagram: slightly lower comment limit
    if (platform === 'instagram') {
        limits.comment = Math.min(MAX_COMMENTS, 2);
    }

    return limits;
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
        actionLimits: getActionLimits(account.platform),
    };

    const agent = new WarmupAgent(config);
    const result = await agent.runSession();

    if (result.success) {
        console.log(`[Scheduler] @${account.username} (${account.platform}): ${result.actionsPerformed} actions in ${result.durationSec}s`);
    } else if (result.notLoggedIn) {
        console.warn(`[Scheduler] @${account.username} (${account.platform}): NOT LOGGED IN — skipping future sessions until resolved`);
    } else if (result.verificationNeeded) {
        console.warn(`[Scheduler] @${account.username} (${account.platform}): Verification needed (${result.verificationNeeded}) — pausing`);
    } else {
        console.error(`[Scheduler] @${account.username} (${account.platform}): Failed - ${result.error}`);
    }
}

async function scheduleRound(): Promise<void> {
    if (!WARMUP_ENABLED) {
        console.log('[Scheduler] Warmup disabled, skipping round.');
        return;
    }

    // Reload config each round
    await loadWarmupConfig();

    // Check if we're in a valid time window
    const windowIndex = getCurrentWindowIndex();
    if (windowIndex < 0) {
        const now = new Date();
        const colombiaHour = (now.getUTCHours() - 5 + 24) % 24;
        console.log(`[Scheduler] Outside session windows (Colombia hour: ${colombiaHour}). Next window: ${SESSION_WINDOWS.find(w => w.start > colombiaHour)?.start || SESSION_WINDOWS[0].start}:00`);
        return;
    }

    const accounts = await getActiveAccounts();
    if (accounts.length === 0) {
        console.log('[Scheduler] No active accounts with ok verification status.');
        return;
    }

    console.log(`[Scheduler] Window ${windowIndex + 1}/4 — Checking ${accounts.length} accounts (${SESSIONS_PER_DAY} sessions/day, max ${MAX_CONCURRENT} concurrent)...`);

    // Update queue concurrency
    queue.concurrency = MAX_CONCURRENT;

    let scheduled = 0;

    for (const account of accounts) {
        // Check daily limit
        const sessionsToday = await getSessionsToday(account.id);
        if (sessionsToday >= SESSIONS_PER_DAY) {
            continue;
        }

        // Check if already ran in this window
        const sessionsInWindow = await getSessionsInCurrentWindow(account.id, windowIndex);
        if (sessionsInWindow > 0) {
            continue;
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
        console.log(`[Scheduler] Queued ${scheduled} warmup sessions for window ${windowIndex + 1}.`);
    } else {
        console.log(`[Scheduler] All accounts done for window ${windowIndex + 1}.`);
    }
}

async function main(): Promise<void> {
    console.log('[Scheduler] Starting Warmup Scheduler...');

    // Load config from Supabase
    await loadConfig();
    await loadWarmupConfig();

    queue = new PQueue({ concurrency: MAX_CONCURRENT });

    console.log(`[Scheduler] Config: ${SESSIONS_PER_DAY} sessions/day, ${MIN_DURATION_SEC}-${MAX_DURATION_SEC}s, max ${MAX_CONCURRENT} concurrent`);
    console.log(`[Scheduler] Action limits: ${MAX_LIKES} likes, ${MAX_FOLLOWS} follows, ${MAX_COMMENTS} comments`);
    console.log(`[Scheduler] Time windows (Colombia): ${SESSION_WINDOWS.map(w => `${w.start}:00-${w.end}:00`).join(', ')}`);
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
