/**
 * ContentHub - Warmup Agent
 * Automated interaction bot that simulates organic user behavior
 * to keep accounts healthy and avoid spam detection.
 *
 * Uses Playwright with stealth plugin, routed through each account's
 * assigned proxy. Performs randomized actions: scroll, watch, like,
 * comment, save, follow.
 *
 * Each session runs 5-15 minutes with 10-30 actions.
 * Includes login detection, verification challenge handling, and
 * per-action limits to avoid platform bans.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SUPABASE_CONFIG, GEMINI_CONFIG, PATHS } from './config';
import { generateFingerprint, STEALTH_BROWSER_ARGS } from './warmup/anti-detection';
import { autoLogin, LoginCredentials } from './warmup/auto-login';
import { createEmailVerifier, EmailVerifier } from './email-verifier';
import { solveCaptcha } from './warmup/captcha-solver';
import 'dotenv/config';

// Initialize stealth plugin
chromium.use(StealthPlugin());

// Platform URLs
const PLATFORM_URLS: Record<string, { home: string; feed: string }> = {
    tiktok: { home: 'https://www.tiktok.com', feed: 'https://www.tiktok.com/foryou' },
    instagram: { home: 'https://www.instagram.com', feed: 'https://www.instagram.com/reels/' },
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

// Default per-session action limits (configurable via app_settings)
const DEFAULT_ACTION_LIMITS: Record<string, Record<string, number>> = {
    tiktok: { like: 15, follow: 5, comment: 3, save: 10 },
    instagram: { like: 15, follow: 5, comment: 2, save: 10 },
    youtube: { like: 20, follow: 5, comment: 0, save: 0 },
};

export interface WarmupConfig {
    accountId: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    username: string;
    proxyUrl?: string;
    proxyUsername?: string;
    proxyPassword?: string;
    countryCode?: string;
    minDurationSec: number;
    maxDurationSec: number;
    headless: boolean;
    actionLimits?: Record<string, number>;
}

export interface WarmupSessionResult {
    success: boolean;
    sessionId: string;
    actionsPerformed: number;
    durationSec: number;
    error?: string;
    notLoggedIn?: boolean;
    verificationNeeded?: string;
}

interface ActionResult {
    type: string;
    targetUrl?: string;
    durationMs?: number;
    success: boolean;
    metadata?: Record<string, unknown>;
}

export interface VerificationChallenge {
    type: 'email_code' | 'sms_code' | 'captcha' | 'unknown';
    platform: string;
    inputSelector?: string;
    submitSelector?: string;
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
    private actionCounts: Record<string, number> = {};
    private actionLimits: Record<string, number>;

    constructor(config: WarmupConfig) {
        this.config = config;
        this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        this.actionLimits = config.actionLimits || DEFAULT_ACTION_LIMITS[config.platform] || {};
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
            const page = context.pages()[0] || await context.newPage();

            // Navigate to platform feed
            const urls = PLATFORM_URLS[this.config.platform];
            await page.goto(urls.feed, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(humanDelay(3000, 5000));

            // Check if logged in
            let loggedIn = await this.isLoggedIn(page);
            if (!loggedIn) {
                console.log(`[Warmup] @${this.config.username}: NOT logged in — attempting auto-login...`);

                // Fetch credentials from DB
                const credentials = await this.getLoginCredentials();
                if (credentials) {
                    const loginResult = await autoLogin(page, credentials);

                    if (loginResult.success) {
                        console.log(`[Warmup] @${this.config.username}: Auto-login successful ✓`);
                        // Update last_login_at and reset failures
                        await this.supabase.from('accounts').update({
                            last_login_at: new Date().toISOString(),
                            login_failures: 0,
                            verification_status: 'ok',
                        }).eq('id', this.config.accountId);

                        // Navigate back to feed after login
                        await page.goto(urls.feed, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await sleep(humanDelay(3000, 5000));
                        loggedIn = true;
                    } else if (loginResult.needsVerification) {
                        console.log(`[Warmup] @${this.config.username}: Login needs ${loginResult.verificationType}`);

                        // Try to auto-solve CAPTCHA
                        if (loginResult.verificationType === 'captcha') {
                            console.log(`[Warmup] @${this.config.username}: Attempting CAPTCHA auto-solve...`);
                            const captchaResult = await solveCaptcha(page, this.config.platform);
                            if (captchaResult.success) {
                                console.log(`[Warmup] @${this.config.username}: CAPTCHA solved via ${captchaResult.method} ✓`);
                                await sleep(humanDelay(3000, 5000));
                                // Re-check login after CAPTCHA
                                loggedIn = await this.isLoggedIn(page);
                                if (loggedIn) {
                                    await this.supabase.from('accounts').update({
                                        last_login_at: new Date().toISOString(),
                                        login_failures: 0,
                                        verification_status: 'ok',
                                    }).eq('id', this.config.accountId);
                                }
                            } else {
                                console.log(`[Warmup] @${this.config.username}: CAPTCHA auto-solve failed: ${captchaResult.error}`);
                            }
                        }

                        if (!loggedIn) {
                            const status = loginResult.verificationType === 'email_code' ? 'needs_email'
                                : loginResult.verificationType === 'sms_code' ? 'needs_sms'
                                : 'needs_captcha';

                            await this.supabase.from('accounts').update({
                                verification_status: status,
                            }).eq('id', this.config.accountId);
                        }
                    } else {
                        console.log(`[Warmup] @${this.config.username}: Auto-login failed: ${loginResult.error}`);
                        // Increment login failures via direct SQL
                        try {
                            await this.supabase.from('accounts').update({
                                login_failures: 1,
                            }).eq('id', this.config.accountId);
                        } catch { /* ignore */ }
                    }
                } else {
                    console.log(`[Warmup] @${this.config.username}: No credentials stored — cannot auto-login`);
                }

                if (!loggedIn) {
                    await this.supabase.from('warmup_sessions').update({
                        status: 'failed',
                        ended_at: new Date().toISOString(),
                        session_duration_sec: Math.round((Date.now() - this.startTime) / 1000),
                        error_message: 'not_logged_in',
                    }).eq('id', this.sessionId);

                    return {
                        success: false,
                        sessionId: this.sessionId,
                        actionsPerformed: 0,
                        durationSec: Math.round((Date.now() - this.startTime) / 1000),
                        error: 'not_logged_in',
                        notLoggedIn: true,
                    };
                }
            }

            console.log(`[Warmup] @${this.config.username}: Logged in ✓ — performing actions`);

            // Perform actions until time runs out
            while (Date.now() - this.startTime < targetDuration) {
                const action = this.pickAllowedAction();
                try {
                    const result = await this.performAction(page, action);
                    this.actions.push(result);

                    // Track action counts for limits
                    if (result.success) {
                        this.actionCounts[action] = (this.actionCounts[action] || 0) + 1;
                    }

                    // Log action to DB
                    await this.supabase.from('warmup_actions').insert({
                        session_id: this.sessionId,
                        action_type: result.type,
                        target_url: result.targetUrl || null,
                        duration_ms: result.durationMs || null,
                        success: result.success,
                        metadata: result.metadata || {},
                    });

                    // Check for verification challenges after each action
                    const challenge = await this.detectVerification(page);
                    if (challenge) {
                        console.log(`[Warmup] @${this.config.username}: Verification challenge detected (${challenge.type})`);
                        const handled = await this.handleVerification(page, challenge);
                        if (!handled) {
                            // Mark and abort session
                            const status = challenge.type === 'email_code' ? 'needs_email'
                                : challenge.type === 'sms_code' ? 'needs_sms'
                                : challenge.type === 'captcha' ? 'needs_captcha'
                                : 'needs_email';

                            await this.supabase.from('accounts').update({
                                verification_status: status,
                            }).eq('id', this.config.accountId);

                            throw new Error(`verification_needed:${challenge.type}`);
                        }
                    }

                    // Human-like pause between actions (2-8s)
                    await sleep(humanDelay(2000, 8000));
                } catch (err: any) {
                    if (err.message?.startsWith('verification_needed:')) {
                        throw err; // Re-throw verification errors
                    }
                    console.log(`[Warmup] Action ${action} failed: ${err.message}`);
                    // Continue with next action
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
            console.log(`[Warmup] Actions: ${JSON.stringify(this.actionCounts)}`);

            return {
                success: true,
                sessionId: this.sessionId,
                actionsPerformed: this.actions.length,
                durationSec,
            };
        } catch (err: any) {
            const durationSec = Math.round((Date.now() - this.startTime) / 1000);
            const verificationNeeded = err.message?.startsWith('verification_needed:')
                ? err.message.split(':')[1]
                : undefined;

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
                verificationNeeded,
            };
        } finally {
            if (context) {
                await context.close();
            }
        }
    }

    // ========================================
    // Browser launch with stealth + fingerprint
    // ========================================

    private async launchBrowser(): Promise<BrowserContext> {
        const sessionDir = path.join(
            PATHS.sessions,
            `${this.config.platform}-${this.config.username}`
        );

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Generate consistent fingerprint for this account
        const fingerprint = generateFingerprint(this.config.username, this.config.countryCode);

        const launchOptions: any = {
            headless: this.config.headless,
            args: [...STEALTH_BROWSER_ARGS],
            viewport: fingerprint.viewport,
            userAgent: fingerprint.userAgent,
            locale: fingerprint.locale,
            timezoneId: fingerprint.timezoneId,
        };

        // Add proxy if configured
        if (this.config.proxyUrl) {
            launchOptions.args.push(`--proxy-server=${this.config.proxyUrl}`);
        }

        const context = await chromium.launchPersistentContext(sessionDir, launchOptions);

        // Authenticate proxy if needed
        if (this.config.proxyUsername && this.config.proxyPassword) {
            await context.route('**/*', async (route) => {
                await route.continue();
            });
            // Set HTTP credentials for proxy auth
            await context.setHTTPCredentials({
                username: this.config.proxyUsername,
                password: this.config.proxyPassword,
            });
        }

        return context;
    }

    // ========================================
    // Login detection per platform
    // ========================================

    private async isLoggedIn(page: Page): Promise<boolean> {
        try {
            if (this.config.platform === 'tiktok') {
                // FIRST: check for login modal overlay (strongest signal of NOT logged in)
                const loginModal = await page.locator('[class*="DivModalContainer"], [class*="ModalContainer"], div[class*="modal"] [class*="login"]').count();
                if (loginModal > 0) {
                    console.log('[Warmup] TikTok: Login modal detected — NOT logged in');
                    return false;
                }

                // Check for login page URL
                if (page.url().includes('/login')) return false;

                // Look for POSITIVE indicators of being logged in
                const profileLink = await page.locator('a[data-e2e="nav-profile"], [data-e2e="profile-icon"]').count();
                const uploadBtn = await page.locator('a[data-e2e="upload-icon"], a[href="/upload"]').count();
                const inboxIcon = await page.locator('[data-e2e="inbox-icon"]').count();

                if (profileLink > 0 || uploadBtn > 0 || inboxIcon > 0) return true;

                // Check for login button as negative indicator
                const loginBtn = await page.locator('[data-e2e="top-login-button"]').count();
                const loginLink = await page.locator('button:has-text("Log in"), button:has-text("Iniciar sesión")').count();
                if (loginBtn > 0 || loginLink > 0) return false;

                // If no positive or negative indicators found, assume NOT logged in
                return false;
            } else if (this.config.platform === 'instagram') {
                // If username input visible, we're on login page
                const loginInput = await page.locator('input[name="username"]').count();
                if (loginInput > 0) return false;
                // Check for POSITIVE navigation elements that only show when logged in
                const navProfile = await page.locator('a[href*="/direct/"], svg[aria-label="Home"], svg[aria-label="Inicio"]').count();
                const avatar = await page.locator('img[data-testid="user-avatar"], span[role="link"] img[alt]').count();
                return navProfile > 0 || avatar > 0;
            } else if (this.config.platform === 'youtube') {
                // Avatar button means logged in
                const avatar = await page.locator('button#avatar-btn, img#img[alt="Avatar"]').count();
                if (avatar > 0) return true;
                // "Sign in" means definitely NOT logged in
                const signIn = await page.locator('a[aria-label="Sign in"], a[href*="accounts.google.com"], tp-yt-paper-button#sign-in-button').count();
                if (signIn > 0) return false;
                // No indicators = not logged in
                return false;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ========================================
    // Verification detection per platform
    // ========================================

    private async detectVerification(page: Page): Promise<VerificationChallenge | null> {
        try {
            if (this.config.platform === 'tiktok') {
                // TikTok verification dialog
                const codeInput = await page.locator(
                    'input[placeholder*="code"], input[placeholder*="código"], ' +
                    'input[placeholder*="Code"], input[type="tel"][maxlength="6"]'
                ).count();
                const verifyText = await page.locator(
                    'div:has-text("verification code"), div:has-text("código de verificación"), ' +
                    'div:has-text("Verify your identity"), div:has-text("Verificar")'
                ).first().isVisible().catch(() => false);

                if (codeInput > 0 || verifyText) {
                    return {
                        type: 'email_code',
                        platform: 'tiktok',
                        inputSelector: 'input[placeholder*="code"], input[placeholder*="código"], input[type="tel"][maxlength="6"]',
                        submitSelector: 'button[type="submit"], button:has-text("Verify"), button:has-text("Verificar")',
                    };
                }

                // CAPTCHA detection
                const captcha = await page.locator(
                    'iframe[src*="captcha"], div[id*="captcha"], #captcha-verify'
                ).count();
                if (captcha > 0) {
                    return { type: 'captcha', platform: 'tiktok' };
                }
            } else if (this.config.platform === 'instagram') {
                // Instagram security checkpoint
                const checkpoint = page.url().includes('challenge') || page.url().includes('checkpoint');
                const confirmText = await page.locator(
                    'div:has-text("Confirm your identity"), div:has-text("Confirma tu identidad"), ' +
                    'div:has-text("suspicious activity"), div:has-text("actividad sospechosa")'
                ).first().isVisible().catch(() => false);

                if (checkpoint || confirmText) {
                    const hasCodeInput = await page.locator('input[name="security_code"], input[placeholder*="code"]').count();
                    if (hasCodeInput > 0) {
                        return {
                            type: 'email_code',
                            platform: 'instagram',
                            inputSelector: 'input[name="security_code"], input[placeholder*="code"]',
                            submitSelector: 'button[type="submit"], button:has-text("Confirm"), button:has-text("Confirmar")',
                        };
                    }
                    return { type: 'unknown', platform: 'instagram' };
                }
            } else if (this.config.platform === 'youtube') {
                // Google verification challenge
                const challengeFrame = await page.locator(
                    'iframe[src*="accounts.google.com/v3/signin/challenge"]'
                ).count();
                const verifyUrl = page.url().includes('accounts.google.com') && page.url().includes('challenge');

                if (challengeFrame > 0 || verifyUrl) {
                    return { type: 'email_code', platform: 'youtube' };
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    // ========================================
    // Verification handling
    // ========================================

    private async handleVerification(page: Page, challenge: VerificationChallenge): Promise<boolean> {
        console.log(`[Warmup] Verification challenge: ${challenge.type} on ${challenge.platform}`);

        // Log the verification event
        await this.supabase.from('warmup_actions').insert({
            session_id: this.sessionId,
            action_type: 'verification_detected',
            success: false,
            metadata: { challenge_type: challenge.type, platform: challenge.platform },
        });

        // Try to solve CAPTCHAs automatically via CapSolver
        if (challenge.type === 'captcha') {
            console.log(`[Warmup] Attempting CAPTCHA auto-solve via CapSolver...`);
            const captchaResult = await solveCaptcha(page, challenge.platform);
            if (captchaResult.success) {
                console.log(`[Warmup] CAPTCHA solved via ${captchaResult.method} ✓`);
                await this.supabase.from('warmup_actions').insert({
                    session_id: this.sessionId,
                    action_type: 'captcha_solved',
                    success: true,
                    metadata: { method: captchaResult.method },
                });
                return true;
            } else {
                console.log(`[Warmup] CAPTCHA auto-solve failed: ${captchaResult.error}`);
                return false;
            }
        }

        // Only email codes can be handled automatically beyond captcha
        if (challenge.type !== 'email_code') {
            console.log(`[Warmup] Cannot auto-resolve ${challenge.type} — needs manual intervention`);
            return false;
        }

        // Get account email
        const { data: account } = await this.supabase
            .from('accounts')
            .select('email_address')
            .eq('id', this.config.accountId)
            .single();

        if (!account?.email_address) {
            console.log('[Warmup] No email configured for this account — cannot verify');
            return false;
        }

        // Click "Send code" button if visible
        const sendCodeBtn = await page.$(
            'button:has-text("Send"), button:has-text("Enviar"), ' +
            'button:has-text("Send code"), button:has-text("Enviar código"), ' +
            'a:has-text("Send"), a:has-text("Enviar")'
        ).catch(() => null);

        if (sendCodeBtn) {
            await sendCodeBtn.click();
            console.log('[Warmup] Clicked "Send code" button');
            await sleep(humanDelay(3000, 5000));
        }

        // Wait for verification code via email
        const verifier = createEmailVerifier('supabase');
        const code = await verifier.getVerificationCode(
            account.email_address,
            this.config.platform,
            120000 // 2 minute timeout
        );

        if (!code) {
            console.log('[Warmup] Verification code not received within timeout');
            return false;
        }

        console.log(`[Warmup] Got verification code: ${code}`);

        // Type the code
        if (challenge.inputSelector) {
            const input = await page.$(challenge.inputSelector).catch(() => null);
            if (input) {
                await input.click();
                await sleep(humanDelay(300, 600));
                await page.keyboard.type(code, { delay: humanDelay(80, 150) });
                await sleep(humanDelay(1000, 2000));
            }
        }

        // Submit
        if (challenge.submitSelector) {
            const submitBtn = await page.$(challenge.submitSelector).catch(() => null);
            if (submitBtn) {
                await submitBtn.click();
            } else {
                await page.keyboard.press('Enter');
            }
        } else {
            await page.keyboard.press('Enter');
        }

        await sleep(humanDelay(3000, 5000));

        // Log success
        await this.supabase.from('warmup_actions').insert({
            session_id: this.sessionId,
            action_type: 'verification_resolved',
            success: true,
            metadata: { challenge_type: challenge.type },
        });

        // Reset verification status
        await this.supabase.from('accounts').update({
            verification_status: 'ok',
        }).eq('id', this.config.accountId);

        console.log('[Warmup] Verification code submitted successfully ✓');
        return true;
    }

    // ========================================
    // Credential fetching for auto-login
    // ========================================

    private async getLoginCredentials(): Promise<LoginCredentials | null> {
        const { data } = await this.supabase
            .from('accounts')
            .select('email_address, login_password, username')
            .eq('id', this.config.accountId)
            .single();

        if (!data?.email_address || !data?.login_password) {
            return null;
        }

        return {
            email: data.email_address,
            password: data.login_password,
            platform: this.config.platform,
            username: data.username,
        };
    }

    // ========================================
    // Action selection with limits
    // ========================================

    private pickAllowedAction(): string {
        // Try up to 10 times to find an action within limits
        for (let i = 0; i < 10; i++) {
            const action = pickWeightedAction();
            const limit = this.actionLimits[action];
            const count = this.actionCounts[action] || 0;

            // No limit defined or not yet reached
            if (limit === undefined || count < limit) {
                return action;
            }
        }
        // Fallback to scroll (always allowed, no limit)
        return 'scroll';
    }

    // ========================================
    // Action dispatcher
    // ========================================

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
            await sleep(watchDuration);
        } else if (this.config.platform === 'youtube') {
            // YouTube Shorts: scroll to next short and watch
            await page.mouse.wheel(0, 500);
            await sleep(watchDuration);
        } else {
            // Instagram Reels: scroll to next reel and watch
            await page.mouse.wheel(0, 500);
            await sleep(watchDuration);
        }

        return { type: 'watch', success: true, durationMs: watchDuration, targetUrl: page.url() };
    }

    private async likeVideo(page: Page): Promise<ActionResult> {
        let liked = false;

        if (this.config.platform === 'tiktok') {
            const heartBtn = await page.$('[data-e2e="like-icon"], [data-e2e="browse-like-icon"]').catch(() => null);
            if (heartBtn) {
                await heartBtn.click();
                liked = true;
            }
        } else if (this.config.platform === 'instagram') {
            const likeBtn = await page.$(
                'svg[aria-label="Me gusta"], svg[aria-label="Like"], ' +
                'span[class*="like"] svg, div[role="button"] svg[aria-label="Me gusta"]'
            ).catch(() => null);
            if (likeBtn) {
                await likeBtn.click();
                liked = true;
            }
        } else if (this.config.platform === 'youtube') {
            const likeBtn = await page.$(
                '#like-button button, like-button-view-model button, ' +
                'button[aria-label*="like"], button[aria-label*="gusta"]'
            ).catch(() => null);
            if (likeBtn) {
                await likeBtn.click();
                liked = true;
            }
        }

        await sleep(humanDelay(500, 1500));
        return { type: 'like', success: liked, targetUrl: page.url() };
    }

    private async postComment(page: Page): Promise<ActionResult> {
        // YouTube comments are complex, skip entirely
        if (this.config.platform === 'youtube') {
            return { type: 'comment', success: false, metadata: { reason: 'youtube_comments_skipped' } };
        }

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
                const postBtn = await page.$('[data-e2e="comment-post"], [data-e2e="browse-comment-post"]').catch(() => null);
                if (postBtn) {
                    await postBtn.click();
                    commented = true;
                }
            }
        } else if (this.config.platform === 'instagram') {
            const commentArea = await page.$(
                'textarea[aria-label="Añade un comentario..."], textarea[aria-label="Add a comment…"], ' +
                'textarea[placeholder*="comentario"], textarea[placeholder*="comment"]'
            ).catch(() => null);
            if (commentArea) {
                await commentArea.click();
                await sleep(humanDelay(500, 1000));
                await page.keyboard.type(comment, { delay: humanDelay(50, 120) });
                await sleep(humanDelay(800, 1500));
                const postBtn = await page.$('button:has-text("Publicar"), button:has-text("Post"), div[role="button"]:has-text("Publicar")').catch(() => null);
                if (postBtn) {
                    await postBtn.click();
                    commented = true;
                }
            }
        }

        await sleep(humanDelay(1000, 2000));
        return { type: 'comment', success: commented, metadata: { comment }, targetUrl: page.url() };
    }

    private async saveVideo(page: Page): Promise<ActionResult> {
        let saved = false;

        if (this.config.platform === 'tiktok') {
            const saveBtn = await page.$('[data-e2e="browse-save-icon"], [data-e2e="video-save"]').catch(() => null);
            if (saveBtn) {
                await saveBtn.click();
                saved = true;
            }
        } else if (this.config.platform === 'instagram') {
            const saveBtn = await page.$(
                'svg[aria-label="Guardar"], svg[aria-label="Save"], ' +
                'div[role="button"] svg[aria-label="Guardar"]'
            ).catch(() => null);
            if (saveBtn) {
                await saveBtn.click();
                saved = true;
            }
        }
        // YouTube Shorts doesn't have a save/bookmark

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
            const followBtn = await page.$('button:has-text("Seguir"):not(:has-text("Siguiendo")), button:has-text("Follow"):not(:has-text("Following"))').catch(() => null);
            if (followBtn) {
                await followBtn.click();
                followed = true;
            }
        } else if (this.config.platform === 'youtube') {
            const subscribeBtn = await page.$('button:has-text("Suscribirse"):not(:has-text("Suscrito")), button:has-text("Subscribe"):not(:has-text("Subscribed"))').catch(() => null);
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
            const usernameLink = await page.$('article a[role="link"] span, header a[role="link"]').catch(() => null);
            if (usernameLink) {
                await usernameLink.click();
                await sleep(humanDelay(3000, 8000));
                visited = true;
                await page.goBack();
            }
        } else if (this.config.platform === 'youtube') {
            // Click on channel name in Shorts
            const channelLink = await page.$('ytd-channel-name a, .ytd-reel-player-overlay-renderer a').catch(() => null);
            if (channelLink) {
                await channelLink.click();
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
        headless: false,
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
