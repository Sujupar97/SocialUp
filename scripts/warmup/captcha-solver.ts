/**
 * CAPTCHA Solver using CapSolver API
 * Handles TikTok puzzle/slider CAPTCHAs, FunCaptcha, and reCAPTCHA.
 *
 * Flow:
 * 1. Detect CAPTCHA type from the page
 * 2. Take screenshot or extract params
 * 3. Send to CapSolver API
 * 4. Apply solution via Playwright
 */

import { Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../config';

const CAPSOLVER_API = 'https://api.capsolver.com';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

let cachedApiKey: string | null = null;

async function getCapSolverKey(): Promise<string> {
    if (cachedApiKey) return cachedApiKey;

    const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'capsolver_api_key')
        .single();

    if (!data?.value) {
        throw new Error('CapSolver API key not found in app_settings');
    }

    cachedApiKey = data.value;
    return data.value;
}

interface CapSolverTask {
    type: string;
    [key: string]: unknown;
}

interface CapSolverResponse {
    errorId: number;
    errorCode?: string;
    errorDescription?: string;
    taskId?: string;
    status?: string;
    solution?: Record<string, unknown>;
}

async function createTask(task: CapSolverTask): Promise<CapSolverResponse> {
    const apiKey = await getCapSolverKey();

    const response = await fetch(`${CAPSOLVER_API}/createTask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, task }),
    });

    return response.json() as Promise<CapSolverResponse>;
}

async function getTaskResult(taskId: string, maxWaitMs = 120000): Promise<CapSolverResponse> {
    const apiKey = await getCapSolverKey();
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${CAPSOLVER_API}/getTaskResult`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientKey: apiKey, taskId }),
        });

        const result = await response.json() as CapSolverResponse;

        if (result.errorId > 0) {
            throw new Error(`CapSolver error: ${result.errorCode} — ${result.errorDescription}`);
        }

        if (result.status === 'ready') {
            return result;
        }

        // Poll every 3 seconds
        await sleep(3000);
    }

    throw new Error('CapSolver: timeout waiting for solution');
}

export interface CaptchaSolveResult {
    success: boolean;
    error?: string;
    method?: string;
}

/**
 * Detect and solve CAPTCHA on the current page.
 * Supports TikTok puzzle/slider and FunCaptcha.
 */
export async function solveCaptcha(page: Page, platform: string): Promise<CaptchaSolveResult> {
    console.log(`[CaptchaSolver] Detecting CAPTCHA type on ${platform}...`);

    try {
        if (platform === 'tiktok') {
            return await solveTikTokCaptcha(page);
        } else if (platform === 'instagram') {
            return await solveGenericCaptcha(page, platform);
        } else if (platform === 'youtube') {
            return await solveGenericCaptcha(page, platform);
        }

        return { success: false, error: `Unsupported platform: ${platform}` };
    } catch (err: any) {
        console.error(`[CaptchaSolver] Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// ========================================
// TikTok CAPTCHA Solver
// ========================================

async function solveTikTokCaptcha(page: Page): Promise<CaptchaSolveResult> {
    // Wait for CAPTCHA to fully load
    await sleep(2000);

    // Check for puzzle/slider CAPTCHA (most common on TikTok)
    const puzzleFrame = await page.$('#captcha-verify-image, [data-testid="captcha"], .captcha_verify_container, #tiktok-verify-ele').catch(() => null);
    const captchaIframe = await page.$('iframe[src*="captcha"], iframe[src*="verify"]').catch(() => null);

    // Try CapSolver's built-in TikTok handler via AntiTurnstileTaskProxyLess or generic
    // First, try the screenshot-based approach which works for all TikTok CAPTCHA types

    // Take a screenshot of the CAPTCHA area
    const pageUrl = page.url();
    const websiteKey = extractWebsiteKey(page);

    // Method 1: Try AntiTurnstileTaskProxyLess (for Cloudflare-wrapped CAPTCHAs)
    if (await page.$('iframe[src*="challenges.cloudflare.com"]').catch(() => null)) {
        console.log('[CaptchaSolver] Detected Cloudflare Turnstile CAPTCHA');
        return await solveTurnstile(page, pageUrl);
    }

    // Method 2: Try FunCaptcha detection
    if (await page.$('iframe[src*="funcaptcha"], iframe[src*="arkoselabs"]').catch(() => null)) {
        console.log('[CaptchaSolver] Detected FunCaptcha/Arkose');
        return await solveFunCaptcha(page, pageUrl);
    }

    // Method 3: Generic TikTok puzzle — use screenshot-based recognition
    console.log('[CaptchaSolver] Attempting TikTok puzzle solve via screenshot...');

    // Find the puzzle image and background image
    const puzzleImg = await page.$('img[id*="captcha-verify-image"], .captcha_verify_img_slide img, img.captcha-verify-image').catch(() => null);
    const bgImg = await page.$('img[id*="captcha-verify-image"]:first-of-type, .captcha_verify_img--wrapper img:first-child').catch(() => null);

    // If we can't find specific puzzle elements, try full-page screenshot approach
    console.log('[CaptchaSolver] Sending page to CapSolver for analysis...');

    // Use CapSolver's ReCaptchaV2TaskProxyLess as a general image recognition
    // Actually, for TikTok puzzles, the best approach is to screenshot and use coordinates

    // Take screenshot of the entire captcha area
    const screenshotBuffer = await page.screenshot({ type: 'png' });
    const screenshotBase64 = screenshotBuffer.toString('base64');

    // Use CapSolver's image-to-coordinates task
    const createResult = await createTask({
        type: 'AntiTurnstileTaskProxyLess',
        websiteURL: pageUrl,
        websiteKey: await websiteKey || 'tiktok',
        metadata: { type: 'turnstile' },
    });

    if (createResult.errorId > 0) {
        // Fallback: try generic recognition
        console.log(`[CaptchaSolver] AntiTurnstile failed: ${createResult.errorDescription}`);
        return await solveTikTokPuzzleViaScreenshot(page);
    }

    if (createResult.taskId) {
        const result = await getTaskResult(createResult.taskId);
        if (result.solution) {
            const token = result.solution.token as string;
            // Inject the token
            await page.evaluate((t) => {
                const input = document.querySelector('input[name="captcha_token"], input[name="cf-turnstile-response"]') as HTMLInputElement;
                if (input) input.value = t;
            }, token);

            await sleep(2000);
            return { success: true, method: 'turnstile' };
        }
    }

    return await solveTikTokPuzzleViaScreenshot(page);
}

// Solve TikTok puzzle slider via screenshot recognition
async function solveTikTokPuzzleViaScreenshot(page: Page): Promise<CaptchaSolveResult> {
    console.log('[CaptchaSolver] Trying TikTok puzzle via image recognition...');

    // Find puzzle images
    // TikTok uses either inline images or background-image CSS
    const images = await page.evaluate(() => {
        const results: { bg?: string; puzzle?: string; slideBar?: DOMRect | null } = {};

        // Look for captcha images
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
            const src = img.src || '';
            if (src.includes('captcha') || img.closest('[class*="captcha"]')) {
                if (!results.bg) results.bg = src;
                else if (!results.puzzle) results.puzzle = src;
            }
        }

        // Look for background-image based captchas
        const divs = document.querySelectorAll('[class*="captcha"] div, [id*="captcha"] div');
        for (const div of divs) {
            const style = window.getComputedStyle(div);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
                const url = bgImage.replace(/url\(["']?/, '').replace(/["']?\)/, '');
                if (!results.bg) results.bg = url;
                else if (!results.puzzle) results.puzzle = url;
            }
        }

        // Find the slide bar for dragging
        const slider = document.querySelector('[class*="slide"] button, [class*="slider"] button, .secsdk-captcha-drag-icon, [class*="captcha_verify_slide"]');
        if (slider) {
            results.slideBar = slider.getBoundingClientRect();
        }

        return results;
    });

    if (!images.bg) {
        console.log('[CaptchaSolver] Could not find CAPTCHA images on page');

        // Last resort: try CapSolver's built-in TikTok solver
        const pageUrl = page.url();
        const createResult = await createTask({
            type: 'AntiTurnstileTaskProxyLess',
            websiteURL: pageUrl,
            websiteKey: 'login',
        });

        if (createResult.errorId === 0 && createResult.taskId) {
            const result = await getTaskResult(createResult.taskId, 60000);
            if (result.solution) {
                console.log('[CaptchaSolver] Got solution via AntiTurnstile fallback');
                return { success: true, method: 'turnstile_fallback' };
            }
        }

        return { success: false, error: 'Could not extract CAPTCHA images' };
    }

    console.log(`[CaptchaSolver] Found images: bg=${images.bg ? 'yes' : 'no'}, puzzle=${images.puzzle ? 'yes' : 'no'}`);

    // Fetch images and convert to base64
    let bgBase64: string | undefined;
    let puzzleBase64: string | undefined;

    if (images.bg) {
        try {
            const resp = await fetch(images.bg);
            const buffer = await resp.arrayBuffer();
            bgBase64 = Buffer.from(buffer).toString('base64');
        } catch (e) {
            console.log('[CaptchaSolver] Failed to fetch bg image');
        }
    }

    if (images.puzzle) {
        try {
            const resp = await fetch(images.puzzle);
            const buffer = await resp.arrayBuffer();
            puzzleBase64 = Buffer.from(buffer).toString('base64');
        } catch (e) {
            console.log('[CaptchaSolver] Failed to fetch puzzle image');
        }
    }

    if (bgBase64 && puzzleBase64) {
        // Use CapSolver's ReCaptchaV2Classification or similar image task
        const createResult = await createTask({
            type: 'AntiSliderTaskByImage',
            image: bgBase64,
            slideImage: puzzleBase64,
        });

        if (createResult.errorId === 0 && createResult.taskId) {
            const result = await getTaskResult(createResult.taskId, 30000);

            if (result.solution) {
                const distance = (result.solution.distance || result.solution.x) as number;
                console.log(`[CaptchaSolver] Puzzle solution: slide ${distance}px`);

                // Perform the slide action
                if (images.slideBar) {
                    await performSlide(page, images.slideBar, distance);
                    await sleep(3000);

                    // Check if CAPTCHA disappeared
                    const stillVisible = await page.$('#captcha-verify-image, .captcha_verify_container, #tiktok-verify-ele').catch(() => null);
                    if (!stillVisible) {
                        console.log('[CaptchaSolver] Puzzle CAPTCHA solved ✓');
                        return { success: true, method: 'slider' };
                    }
                }
            }
        } else if (createResult.errorDescription) {
            console.log(`[CaptchaSolver] Slider task error: ${createResult.errorDescription}`);
        }
    }

    // If slider approach didn't work, try simple screenshot with full page
    console.log('[CaptchaSolver] Slider approach failed, trying full-page screenshot...');
    const screenshot = await page.screenshot({ type: 'png' });
    const fullBase64 = screenshot.toString('base64');

    const createResult = await createTask({
        type: 'AntiSliderTaskByImage',
        image: fullBase64,
    });

    if (createResult.errorId === 0 && createResult.taskId) {
        const result = await getTaskResult(createResult.taskId, 30000);
        if (result.solution) {
            const x = (result.solution.x || result.solution.distance) as number;
            const y = (result.solution.y || 0) as number;
            console.log(`[CaptchaSolver] Got coordinates: x=${x}, y=${y}`);

            if (x > 0) {
                await page.mouse.click(x, y || 300);
                await sleep(3000);
                return { success: true, method: 'coordinates' };
            }
        }
    }

    return { success: false, error: 'All CAPTCHA solving methods exhausted' };
}

// Perform a human-like slide drag
async function performSlide(page: Page, sliderRect: DOMRect, distance: number): Promise<void> {
    const startX = sliderRect.x + sliderRect.width / 2;
    const startY = sliderRect.y + sliderRect.height / 2;
    const endX = startX + distance;

    // Move to slider button
    await page.mouse.move(startX, startY);
    await sleep(humanDelay(200, 400));

    // Press and hold
    await page.mouse.down();
    await sleep(humanDelay(100, 200));

    // Slide with human-like movement (not perfectly linear)
    const steps = humanDelay(15, 25);
    for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        // Ease-out curve for natural deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentX = startX + distance * eased;
        // Add slight vertical wobble
        const wobble = Math.sin(progress * Math.PI * 3) * humanDelay(0, 2);

        await page.mouse.move(currentX, startY + wobble);
        await sleep(humanDelay(8, 25));
    }

    // Small overshoot and correction (humans do this)
    await page.mouse.move(endX + humanDelay(2, 5), startY);
    await sleep(humanDelay(50, 100));
    await page.mouse.move(endX, startY);
    await sleep(humanDelay(100, 200));

    // Release
    await page.mouse.up();
}

// Helper: extract website key from page
async function extractWebsiteKey(page: Page): Promise<string | null> {
    try {
        const key = await page.evaluate(() => {
            // Cloudflare Turnstile
            const turnstile = document.querySelector('[data-sitekey]');
            if (turnstile) return turnstile.getAttribute('data-sitekey');

            // reCAPTCHA
            const recaptcha = document.querySelector('.g-recaptcha[data-sitekey]');
            if (recaptcha) return recaptcha.getAttribute('data-sitekey');

            // FunCaptcha
            const funCaptcha = document.querySelector('[data-pkey]');
            if (funCaptcha) return funCaptcha.getAttribute('data-pkey');

            return null;
        });
        return key;
    } catch {
        return null;
    }
}

// ========================================
// Cloudflare Turnstile Solver
// ========================================

async function solveTurnstile(page: Page, pageUrl: string): Promise<CaptchaSolveResult> {
    const websiteKey = await extractWebsiteKey(page);
    if (!websiteKey) {
        return { success: false, error: 'Turnstile: could not find sitekey' };
    }

    console.log(`[CaptchaSolver] Solving Turnstile with sitekey: ${websiteKey}`);

    const createResult = await createTask({
        type: 'AntiTurnstileTaskProxyLess',
        websiteURL: pageUrl,
        websiteKey,
    });

    if (createResult.errorId > 0) {
        return { success: false, error: `Turnstile error: ${createResult.errorDescription}` };
    }

    if (!createResult.taskId) {
        return { success: false, error: 'Turnstile: no task ID returned' };
    }

    const result = await getTaskResult(createResult.taskId);
    if (!result.solution?.token) {
        return { success: false, error: 'Turnstile: no token in solution' };
    }

    const token = result.solution.token as string;

    // Inject the token
    await page.evaluate((t) => {
        const inputs = document.querySelectorAll('input[name="cf-turnstile-response"], input[name="captcha_token"]');
        inputs.forEach(i => (i as HTMLInputElement).value = t);

        // Also try setting via Turnstile callback
        const w = window as any;
        if (w.turnstile?.execute) w.turnstile.execute();
    }, token);

    await sleep(3000);
    console.log('[CaptchaSolver] Turnstile token injected ✓');
    return { success: true, method: 'turnstile' };
}

// ========================================
// FunCaptcha / Arkose Labs Solver
// ========================================

async function solveFunCaptcha(page: Page, pageUrl: string): Promise<CaptchaSolveResult> {
    const publicKey = await page.evaluate(() => {
        const el = document.querySelector('[data-pkey]');
        return el?.getAttribute('data-pkey') || null;
    });

    if (!publicKey) {
        return { success: false, error: 'FunCaptcha: public key not found' };
    }

    console.log(`[CaptchaSolver] Solving FunCaptcha with key: ${publicKey}`);

    const createResult = await createTask({
        type: 'FunCaptchaTaskProxyLess',
        websiteURL: pageUrl,
        websitePublicKey: publicKey,
    });

    if (createResult.errorId > 0) {
        return { success: false, error: `FunCaptcha error: ${createResult.errorDescription}` };
    }

    if (!createResult.taskId) {
        return { success: false, error: 'FunCaptcha: no task ID returned' };
    }

    const result = await getTaskResult(createResult.taskId, 120000);
    if (!result.solution?.token) {
        return { success: false, error: 'FunCaptcha: no token in solution' };
    }

    const token = result.solution.token as string;

    // Inject FunCaptcha token
    await page.evaluate((t) => {
        const input = document.querySelector('#fc-token, input[name="fc-token"]') as HTMLInputElement;
        if (input) input.value = t;

        // Trigger callback if available
        const w = window as any;
        if (w.ArkoseEnforcement?.setConfig) {
            w.ArkoseEnforcement.setConfig({ data: { token: t } });
        }
    }, token);

    await sleep(3000);
    console.log('[CaptchaSolver] FunCaptcha token injected ✓');
    return { success: true, method: 'funcaptcha' };
}

// ========================================
// Generic CAPTCHA handler (reCAPTCHA, etc.)
// ========================================

async function solveGenericCaptcha(page: Page, platform: string): Promise<CaptchaSolveResult> {
    // Check for reCAPTCHA
    const recaptchaKey = await page.evaluate(() => {
        const el = document.querySelector('.g-recaptcha[data-sitekey], iframe[src*="recaptcha"]');
        if (el) {
            return el.getAttribute('data-sitekey') ||
                new URL((el as HTMLIFrameElement).src).searchParams.get('k') || null;
        }
        return null;
    });

    if (recaptchaKey) {
        console.log(`[CaptchaSolver] Solving reCAPTCHA for ${platform}...`);

        const createResult = await createTask({
            type: 'ReCaptchaV2TaskProxyLess',
            websiteURL: page.url(),
            websiteKey: recaptchaKey,
        });

        if (createResult.errorId > 0) {
            return { success: false, error: `reCAPTCHA error: ${createResult.errorDescription}` };
        }

        if (createResult.taskId) {
            const result = await getTaskResult(createResult.taskId, 120000);
            if (result.solution?.gRecaptchaResponse) {
                await page.evaluate((token) => {
                    const textarea = document.querySelector('#g-recaptcha-response, textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement;
                    if (textarea) {
                        textarea.value = token;
                        textarea.style.display = 'block';
                    }
                    // Trigger callback
                    const w = window as any;
                    if (w.___grecaptcha_cfg?.clients) {
                        Object.values(w.___grecaptcha_cfg.clients).forEach((client: any) => {
                            Object.values(client).forEach((v: any) => {
                                if (v?.callback) v.callback(token);
                            });
                        });
                    }
                }, result.solution.gRecaptchaResponse as string);

                await sleep(2000);
                console.log('[CaptchaSolver] reCAPTCHA solved ✓');
                return { success: true, method: 'recaptcha' };
            }
        }
    }

    // Check for hCaptcha
    const hcaptchaKey = await page.evaluate(() => {
        const el = document.querySelector('.h-captcha[data-sitekey], iframe[src*="hcaptcha"]');
        return el?.getAttribute('data-sitekey') || null;
    });

    if (hcaptchaKey) {
        console.log(`[CaptchaSolver] Solving hCaptcha for ${platform}...`);

        const createResult = await createTask({
            type: 'HCaptchaTaskProxyLess',
            websiteURL: page.url(),
            websiteKey: hcaptchaKey,
        });

        if (createResult.errorId > 0) {
            return { success: false, error: `hCaptcha error: ${createResult.errorDescription}` };
        }

        if (createResult.taskId) {
            const result = await getTaskResult(createResult.taskId, 120000);
            if (result.solution?.gRecaptchaResponse) {
                await page.evaluate((token) => {
                    const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement;
                    if (textarea) textarea.value = token;
                }, result.solution.gRecaptchaResponse as string);

                await sleep(2000);
                console.log('[CaptchaSolver] hCaptcha solved ✓');
                return { success: true, method: 'hcaptcha' };
            }
        }
    }

    return { success: false, error: `No recognized CAPTCHA type found on ${platform}` };
}
