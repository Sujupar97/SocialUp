/**
 * ContentHub - Warmup Agent
 * Automated interaction bot that simulates organic user behavior
 * to keep accounts healthy and avoid spam detection.
 *
 * Uses Playwright with stealth techniques, routed through each account's
 * assigned proxy. Performs randomized actions: scroll, watch, like,
 * comment, save, follow.
 *
 * Each session runs 5-15 minutes with 10-30 actions.
 */

import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SUPABASE_CONFIG, GEMINI_CONFIG, PATHS } from './config';
import 'dotenv/config';

// Anti-detection browser args (from tiktok-publisher.ts)
const BROWSER_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-setuid-sandbox',
];

// Platform URLs
const PLATFORM_URLS: Record<string, { home: string; feed: string }> = {
    tiktok: { home: 'https://www.tiktok.com', feed: 'https://www.tiktok.com/foryou' },
    instagram: { home: 'https://www.instagram.com', feed: 'https://www.instagram.com' },
    youtube: { home: 'https://www.youtube.com', feed: 'https://www.youtube.com/shorts' },
};

// Action weights (probability distribution)
const ACTION_WEIGHTS: Record<string, number> = {
    scroll: 30,
    watch: 25,
    like: 20,
    comment: 5,
    save: 10,
    follow: 5,
    visit_profile: 5,
};

export interface WarmupConfig {
    accountId: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    username: string;
    proxyUrl?: string;
    proxyUsername?: string;
    proxyPassword?: string;
    minDurationSec: number;
    maxDurationSec: number;
    headless: boolean;
}

export interface WarmupSessionResult {
    success: boolean;
    sessionId: string;
    actionsPerformed: number;
    durationSec: number;
    error?: string;
}

interface ActionResult {
    type: string;
    targetUrl?: string;
    durationMs?: number;
    success: boolean;
    metadata?: Record<string, unknown>;
}

// Humanized helpers
function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function pickWeightedAction(): string {
    const total = Object.values(ACTION_WEIGHTS).reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (const [action, weight] of Object.entries(ACTION_WEIGHTS)) {
        rand -= weight;
        if (rand <= 0) return action;
    }
    return 'scroll';
}

export class WarmupAgent {
    private config: WarmupConfig;
    private supabase: SupabaseClient;
    private sessionId: string = '';
    private actions: ActionResult[] = [];
    private startTime: number = 0;

    constructor(config: WarmupConfig) {
        this.config = config;
        this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }

    async runSession(): Promise<WarmupSessionResult> {
        const targetDuration = humanDelay(
            this.config.minDurationSec * 1000,
            this.config.maxDurationSec * 1000
        );

        // Create session record
        const { data: session, error: sessionError } = await this.supabase
            .from('warmup_sessions')
            .insert({
                account_id: this.config.accountId,
                platform: this.config.platform,
                status: 'running',
                started_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (sessionError || !session) {
            return { success: false, sessionId: '', actionsPerformed: 0, durationSec: 0, error: `Failed to create session: ${sessionError?.message}` };
        }

        this.sessionId = session.id;
        this.startTime = Date.now();
        let context: BrowserContext | null = null;

        try {
            console.log(`[Warmup] Starting session for @${this.config.username} (${this.config.platform}) — target ${Math.round(targetDuration / 1000)}s`);

            context = await this.launchBrowser();
            const page = await context.newPage();

            // Navigate to platform feed
            const urls = PLATFORM_URLS[this.config.platform];
            await page.goto(urls.feed, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(humanDelay(3000, 5000));

            // Perform actions until time runs out
            while (Date.now() - this.startTime < targetDuration) {
                const action = pickWeightedAction();
                try {
                    const result = await this.performAction(page, action);
                    this.actions.push(result);

                    // Log action to DB
                    await this.supabase.from('warmup_actions').insert({
                        session_id: this.sessionId,
                        action_type: result.type,
                        target_url: result.targetUrl || null,
                        duration_ms: result.durationMs || null,
                        success: result.success,
                        metadata: result.metadata || {},
                    });

                    // Human-like pause between actions
                    await sleep(humanDelay(2000, 8000));
                } catch (err: any) {
                    console.log(`[Warmup] Action ${action} failed: ${err.message}`);
                    // Continue with next action — don't break the session
                }
            }

            const durationSec = Math.round((Date.now() - this.startTime) / 1000);
            const successCount = this.actions.filter(a => a.success).length;

            // Build action summary
            const summary: Record<string, number> = {};
            for (const a of this.actions) {
                summary[a.type] = (summary[a.type] || 0) + 1;
            }

            // Finalize session
            await this.supabase.from('warmup_sessions').update({
                status: 'completed',
                ended_at: new Date().toISOString(),
                session_duration_sec: durationSec,
                actions_count: this.actions.length,
                actions_summary: summary,
            }).eq('id', this.sessionId);

            console.log(`[Warmup] Session complete: ${this.actions.length} actions in ${durationSec}s (${successCount} successful)`);

            return {
                success: true,
                sessionId: this.sessionId,
                actionsPerformed: this.actions.length,
                durationSec,
            };
        } catch (err: any) {
            const durationSec = Math.round((Date.now() - this.startTime) / 1000);

            await this.supabase.from('warmup_sessions').update({
                status: 'failed',
                ended_at: new Date().toISOString(),
                session_duration_sec: durationSec,
                actions_count: this.actions.length,
                error_message: err.message,
            }).eq('id', this.sessionId);

            console.error(`[Warmup] Session failed: ${err.message}`);
            return {
                success: false,
                sessionId: this.sessionId,
                actionsPerformed: this.actions.length,
                durationSec,
                error: err.message,
            };
        } finally {
            if (context) {
                await context.close();
            }
        }
    }

    private async launchBrowser(): Promise<BrowserContext> {
        const sessionDir = path.join(
            PATHS.sessions,
            `${this.config.platform}-${this.config.username}`
        );

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const launchOptions: any = {
            headless: this.config.headless,
            args: [...BROWSER_ARGS],
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            locale: 'es-CO',
            timezoneId: 'America/Bogota',
        };

        // Add proxy if configured
        if (this.config.proxyUrl) {
            launchOptions.args.push(`--proxy-server=${this.config.proxyUrl}`);
        }

        const context = await chromium.launchPersistentContext(sessionDir, launchOptions);

        // Authenticate proxy if needed
        if (this.config.proxyUsername && this.config.proxyPassword) {
            const page = context.pages()[0] || await context.newPage();
            await page.route('**/*', async route => route.continue());
        }

        return context;
    }

    private async performAction(page: Page, action: string): Promise<ActionResult> {
        switch (action) {
            case 'scroll': return this.scrollFeed(page);
            case 'watch': return this.watchVideo(page);
            case 'like': return this.likeVideo(page);
            case 'comment': return this.postComment(page);
            case 'save': return this.saveVideo(page);
            case 'follow': return this.followUser(page);
            case 'visit_profile': return this.visitProfile(page);
            default: return this.scrollFeed(page);
        }
    }

    // ========================================
    // Platform-specific action implementations
    // ========================================

    private async scrollFeed(page: Page): Promise<ActionResult> {
        const scrollCount = humanDelay(2, 6);
        for (let i = 0; i < scrollCount; i++) {
            await page.mouse.wheel(0, humanDelay(300, 800));
            await sleep(humanDelay(500, 2000));
        }
        return { type: 'scroll', success: true, metadata: { scrollCount } };
    }

    private async watchVideo(page: Page): Promise<ActionResult> {
        const watchDuration = humanDelay(5000, 30000);

        if (this.config.platform === 'tiktok') {
            // TikTok: videos are full-screen, just wait
            await sleep(watchDuration);
        } else if (this.config.platform === 'youtube') {
            // YouTube Shorts: scroll to next short and watch
            await page.mouse.wheel(0, 500);
            await sleep(watchDuration);
        } else {
            // Instagram: click on a post in feed if visible
            const post = await page.$('article video, article img').catch(() => null);
            if (post) await post.click().catch(() => {});
            await sleep(watchDuration);
            // Press escape to close post modal
            await page.keyboard.press('Escape').catch(() => {});
        }

        return { type: 'watch', success: true, durationMs: watchDuration, targetUrl: page.url() };
    }

    private async likeVideo(page: Page): Promise<ActionResult> {
        let liked = false;

        if (this.config.platform === 'tiktok') {
            // TikTok: double-tap or click heart icon
            const heartBtn = await page.$('[data-e2e="like-icon"], [data-e2e="browse-like-icon"]').catch(() => null);
            if (heartBtn) {
                await heartBtn.click();
                liked = true;
            }
        } else if (this.config.platform === 'instagram') {
            // Instagram: double-tap or click heart
            const likeBtn = await page.$('svg[aria-label="Me gusta"], svg[aria-label="Like"]').catch(() => null);
            if (likeBtn) {
                await likeBtn.click();
                liked = true;
            }
        } else if (this.config.platform === 'youtube') {
            // YouTube: click like button
            const likeBtn = await page.$('#like-button button, like-button-view-model button').catch(() => null);
            if (likeBtn) {
                await likeBtn.click();
                liked = true;
            }
        }

        await sleep(humanDelay(500, 1500));
        return { type: 'like', success: liked, targetUrl: page.url() };
    }

    private async postComment(page: Page): Promise<ActionResult> {
        // Generate a short, organic comment with Gemini
        const comment = await this.generateComment();
        if (!comment) return { type: 'comment', success: false, metadata: { reason: 'no_comment_generated' } };

        let commented = false;

        if (this.config.platform === 'tiktok') {
            const commentInput = await page.$('[data-e2e="comment-input"], [data-e2e="browse-comment-input"]').catch(() => null);
            if (commentInput) {
                await commentInput.click();
                await sleep(humanDelay(500, 1000));
                await page.keyboard.type(comment, { delay: humanDelay(50, 120) });
                await sleep(humanDelay(500, 1000));
                // Post comment
                const postBtn = await page.$('[data-e2e="comment-post"], [data-e2e="browse-comment-post"]').catch(() => null);
                if (postBtn) {
                    await postBtn.click();
                    commented = true;
                }
            }
        } else if (this.config.platform === 'instagram') {
            const commentArea = await page.$('textarea[aria-label="Añade un comentario..."], textarea[aria-label="Add a comment…"]').catch(() => null);
            if (commentArea) {
                await commentArea.click();
                await sleep(humanDelay(500, 1000));
                await page.keyboard.type(comment, { delay: humanDelay(50, 120) });
                await sleep(humanDelay(500, 1000));
                const postBtn = await page.$('button:has-text("Publicar"), button:has-text("Post")').catch(() => null);
                if (postBtn) {
                    await postBtn.click();
                    commented = true;
                }
            }
        } else if (this.config.platform === 'youtube') {
            // YouTube comments require more interaction, skip for now
            return { type: 'comment', success: false, metadata: { reason: 'youtube_comments_complex' } };
        }

        await sleep(humanDelay(1000, 2000));
        return { type: 'comment', success: commented, metadata: { comment }, targetUrl: page.url() };
    }

    private async saveVideo(page: Page): Promise<ActionResult> {
        let saved = false;

        if (this.config.platform === 'tiktok') {
            const saveBtn = await page.$('[data-e2e="undefined-icon"], [data-e2e="browse-save-icon"]').catch(() => null);
            if (saveBtn) {
                await saveBtn.click();
                saved = true;
            }
        } else if (this.config.platform === 'instagram') {
            const saveBtn = await page.$('svg[aria-label="Guardar"], svg[aria-label="Save"]').catch(() => null);
            if (saveBtn) {
                await saveBtn.click();
                saved = true;
            }
        }
        // YouTube doesn't have a save equivalent in Shorts

        await sleep(humanDelay(500, 1500));
        return { type: 'save', success: saved, targetUrl: page.url() };
    }

    private async followUser(page: Page): Promise<ActionResult> {
        let followed = false;

        if (this.config.platform === 'tiktok') {
            const followBtn = await page.$('[data-e2e="browse-follow"], button:has-text("Seguir"):not([data-e2e*="unfollow"])').catch(() => null);
            if (followBtn) {
                await followBtn.click();
                followed = true;
            }
        } else if (this.config.platform === 'instagram') {
            const followBtn = await page.$('button:has-text("Seguir"):not(:has-text("Siguiendo"))').catch(() => null);
            if (followBtn) {
                await followBtn.click();
                followed = true;
            }
        } else if (this.config.platform === 'youtube') {
            const subscribeBtn = await page.$('button:has-text("Suscribirse"):not(:has-text("Suscrito"))').catch(() => null);
            if (subscribeBtn) {
                await subscribeBtn.click();
                followed = true;
            }
        }

        await sleep(humanDelay(1000, 2000));
        return { type: 'follow', success: followed, targetUrl: page.url() };
    }

    private async visitProfile(page: Page): Promise<ActionResult> {
        let visited = false;

        if (this.config.platform === 'tiktok') {
            const avatar = await page.$('[data-e2e="browse-user-avatar"], [data-e2e="video-author-avatar"]').catch(() => null);
            if (avatar) {
                await avatar.click();
                await sleep(humanDelay(3000, 8000));
                visited = true;
                await page.goBack();
            }
        } else if (this.config.platform === 'instagram') {
            const usernameLink = await page.$('article a[role="link"] span').catch(() => null);
            if (usernameLink) {
                await usernameLink.click();
                await sleep(humanDelay(3000, 8000));
                visited = true;
                await page.goBack();
            }
        }

        await sleep(humanDelay(1000, 2000));
        return { type: 'visit_profile', success: visited, targetUrl: page.url() };
    }

    private async generateComment(): Promise<string | null> {
        const apiKey = GEMINI_CONFIG.apiKey;
        if (!apiKey) return null;

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const result = await model.generateContent(
                `Genera UN solo comentario corto y natural en español para un video de ${this.config.platform}. ` +
                `El comentario debe sonar como un usuario real, no un bot. Máximo 50 caracteres. ` +
                `Puede ser: un cumplido, una reacción, un emoji, o una pregunta corta. ` +
                `NO uses hashtags. Responde SOLO con el texto del comentario, nada más.`
            );

            const text = result.response.text().trim().replace(/^["']|["']$/g, '');
            return text.length > 0 && text.length <= 100 ? text : null;
        } catch {
            return null;
        }
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
ContentHub - Warmup Agent
Usage: npx tsx warmup-agent.ts <account_id> <platform> <username> [proxy_url]
`);
        process.exit(1);
    }

    const [accountId, platform, username, proxyUrl] = args;

    const agent = new WarmupAgent({
        accountId,
        platform: platform as 'tiktok' | 'instagram' | 'youtube',
        username,
        proxyUrl,
        minDurationSec: 300,
        maxDurationSec: 900,
        headless: true,
    });

    agent.runSession().then(result => {
        if (result.success) {
            console.log(`\nWarmup complete: ${result.actionsPerformed} actions in ${result.durationSec}s`);
        } else {
            console.error(`\nWarmup failed: ${result.error}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}
