/**
 * ContentHub - Account Creator
 * Automated creation of social media accounts using Playwright.
 *
 * Creates accounts on TikTok, Instagram, and YouTube with:
 * - Unique email per account (catch-all domain)
 * - Proxy assignment (1 proxy = 3 platform accounts)
 * - Email verification code resolution
 * - Profile setup (username, bio, avatar)
 *
 * Usage:
 *   npx tsx account-creator.ts --platform tiktok --count 5
 *   npx tsx account-creator.ts --platform instagram --count 10 --start-index 5
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import PQueue from 'p-queue';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG, PATHS, loadConfig } from './config';
import { generateFingerprint, STEALTH_BROWSER_ARGS } from './warmup/anti-detection';
import { createEmailVerifier } from './email-verifier';
import { solveCaptcha } from './warmup/captcha-solver';
import { createSmsVerifier } from './sms-verifier';
import 'dotenv/config';

chromium.use(StealthPlugin());

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

interface AccountCreationConfig {
    platform: 'tiktok' | 'instagram' | 'youtube';
    emailDomain: string;
    count: number;
    startIndex: number;
    usernamePrefix: string;
    password: string;
    maxConcurrent: number;
    headless: boolean;
}

interface CreationResult {
    success: boolean;
    email: string;
    username?: string;
    accountId?: string;
    error?: string;
}

// ========================================
// Username generators per platform
// ========================================

function generateUsername(prefix: string, index: number): string {
    const suffixes = ['_', '.', ''];
    const suffix = suffixes[index % suffixes.length];
    const number = Math.floor(Math.random() * 900) + 100;
    return `${prefix}${suffix}${index}${number}`;
}

function generateEmail(domain: string, platform: string, index: number): string {
    const id = `${platform}${index}_${Date.now().toString(36)}`;
    return `${id}@${domain}`;
}

function generateBio(): string {
    const bios = [
        '✨ Contenido diario',
        '🎬 Videos & más',
        '📱 Sígueme para más',
        '🌟 Creador de contenido',
        '💫 Compartiendo momentos',
        '🎵 Música y entretenimiento',
        '📸 Fotos y videos',
        '🔥 Nuevo contenido cada día',
    ];
    return bios[Math.floor(Math.random() * bios.length)];
}

// ========================================
// Platform-specific account creation
// ========================================

async function createTikTokAccount(
    page: Page,
    email: string,
    password: string,
    username: string
): Promise<CreationResult> {
    try {
        console.log(`[Creator] TikTok: Creating account ${email}...`);

        await page.goto('https://www.tiktok.com/signup/phone-or-email/email', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 4000));

        // Set birthday (must be 18+)
        // TikTok signup usually starts with birthday selection
        const monthSelect = await page.$('select[placeholder*="Month"], select:first-of-type').catch(() => null);
        if (monthSelect) {
            await monthSelect.selectOption({ index: Math.floor(Math.random() * 12) + 1 });
            await sleep(humanDelay(300, 600));

            const daySelect = await page.$('select[placeholder*="Day"], select:nth-of-type(2)').catch(() => null);
            if (daySelect) {
                await daySelect.selectOption({ index: Math.floor(Math.random() * 28) + 1 });
                await sleep(humanDelay(300, 600));
            }

            const yearSelect = await page.$('select[placeholder*="Year"], select:last-of-type').catch(() => null);
            if (yearSelect) {
                // Select a year that makes them 20-30 years old
                const year = 1994 + Math.floor(Math.random() * 6);
                await yearSelect.selectOption(String(year));
                await sleep(humanDelay(500, 1000));
            }
        }

        // Fill email
        const emailInput = await page.$(
            'input[name="email"], input[placeholder*="Email"], input[type="email"]'
        );
        if (emailInput) {
            await emailInput.click();
            await page.keyboard.type(email, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));
        }

        // Fill password
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) {
            await passwordInput.click();
            await page.keyboard.type(password, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));
        }

        // Click "Send code" to verify email
        const sendCodeBtn = await page.$(
            'button:has-text("Send code"), button:has-text("Enviar código"), ' +
            'a:has-text("Send code")'
        ).catch(() => null);

        if (sendCodeBtn) {
            await sendCodeBtn.click();
            await sleep(humanDelay(2000, 3000));

            // Wait for verification code
            const verifier = createEmailVerifier('supabase');
            const code = await verifier.getVerificationCode(email, 'tiktok', 120000);

            if (code) {
                const codeInput = await page.$(
                    'input[placeholder*="code"], input[placeholder*="código"]'
                ).catch(() => null);
                if (codeInput) {
                    await codeInput.click();
                    await page.keyboard.type(code, { delay: humanDelay(80, 120) });
                    await sleep(humanDelay(1000, 2000));
                }
            } else {
                return { success: false, email, error: 'Verification code not received' };
            }
        }

        // Submit signup
        const signupBtn = await page.$(
            'button[type="submit"], button:has-text("Sign up"), button:has-text("Regístrate"), ' +
            'button:has-text("Next"), button:has-text("Siguiente")'
        ).catch(() => null);
        if (signupBtn) {
            await signupBtn.click();
        }
        await sleep(humanDelay(5000, 8000));

        // Check for CAPTCHA and auto-solve
        const captcha = await page.$('#captcha-verify, iframe[src*="captcha"], .captcha_verify_container, [id*="captcha"], [class*="captcha"]').catch(() => null);
        if (captcha) {
            console.log('[Creator] TikTok: CAPTCHA detected — attempting auto-solve via CapSolver...');
            const captchaResult = await solveCaptcha(page, 'tiktok');
            if (captchaResult.success) {
                console.log(`[Creator] TikTok: CAPTCHA solved via ${captchaResult.method} ✓`);
                await sleep(humanDelay(3000, 5000));
            } else {
                console.log(`[Creator] TikTok: CAPTCHA auto-solve failed: ${captchaResult.error}`);
                return { success: false, email, error: `CAPTCHA failed: ${captchaResult.error}` };
            }
        }

        // Check for phone verification requirement
        const phoneInput = await page.$('input[placeholder*="phone"], input[type="tel"], input[name="phone"]').catch(() => null);
        const phonePrompt = await page.locator('text=phone number').first().isVisible().catch(() => false);
        if (phoneInput || phonePrompt) {
            console.log('[Creator] TikTok: Phone verification required — renting SMS number...');
            const smsVerifier = createSmsVerifier();
            const rental = await smsVerifier.rentNumber('tiktok');
            if (!rental) {
                return { success: false, email, error: 'Failed to rent SMS number (no numbers available or no balance)' };
            }

            // Enter phone number
            const phoneField = phoneInput || await page.$('input[type="tel"]').catch(() => null);
            if (phoneField) {
                await phoneField.click();
                await sleep(humanDelay(300, 500));
                await page.keyboard.type(rental.phoneNumber, { delay: humanDelay(50, 100) });
                await sleep(humanDelay(500, 1000));

                // Click send code
                const sendSmsBtn = await page.$(
                    'button:has-text("Send"), button:has-text("Enviar"), button:has-text("Send code")'
                ).catch(() => null);
                if (sendSmsBtn) {
                    await sendSmsBtn.click();
                    await sleep(humanDelay(2000, 3000));
                }

                // Wait for SMS code
                const smsCode = await smsVerifier.waitForCode(rental.id, 120000);
                if (!smsCode) {
                    await smsVerifier.cancelNumber(rental.id);
                    return { success: false, email, error: 'SMS code not received within timeout' };
                }

                // Enter SMS code
                const smsInput = await page.$('input[placeholder*="code"], input[placeholder*="código"], input[type="tel"][maxlength="6"]').catch(() => null);
                if (smsInput) {
                    await smsInput.click();
                    await sleep(humanDelay(300, 500));
                    await page.keyboard.type(smsCode, { delay: humanDelay(80, 120) });
                    await sleep(humanDelay(1000, 2000));
                }

                // Submit verification
                const verifyBtn = await page.$('button[type="submit"], button:has-text("Verify"), button:has-text("Verificar")').catch(() => null);
                if (verifyBtn) await verifyBtn.click();
                await sleep(humanDelay(3000, 5000));

                await smsVerifier.confirmCodeReceived(rental.id);
                console.log('[Creator] TikTok: Phone verification completed ✓');
            }
        }

        // Try to set username
        await sleep(humanDelay(3000, 5000));
        const usernameInput = await page.$(
            'input[placeholder*="Username"], input[placeholder*="usuario"]'
        ).catch(() => null);
        if (usernameInput) {
            await usernameInput.fill('');
            await page.keyboard.type(username, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(1000, 2000));

            const saveBtn = await page.$(
                'button:has-text("Save"), button:has-text("Guardar"), button[type="submit"]'
            ).catch(() => null);
            if (saveBtn) await saveBtn.click();
            await sleep(humanDelay(2000, 3000));
        }

        console.log(`[Creator] TikTok: Account created ✓ (${username})`);
        return { success: true, email, username };
    } catch (err: any) {
        return { success: false, email, error: `TikTok creation error: ${err.message}` };
    }
}

async function createInstagramAccount(
    page: Page,
    email: string,
    password: string,
    username: string
): Promise<CreationResult> {
    try {
        console.log(`[Creator] Instagram: Creating account ${email}...`);

        await page.goto('https://www.instagram.com/accounts/emailsignup/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 4000));

        // Cookie consent
        const cookieBtn = await page.$(
            'button:has-text("Allow"), button:has-text("Permitir")'
        ).catch(() => null);
        if (cookieBtn) {
            await cookieBtn.click();
            await sleep(humanDelay(1000, 2000));
        }

        // Fill email
        const emailInput = await page.$('input[name="emailOrPhone"]');
        if (emailInput) {
            await emailInput.click();
            await page.keyboard.type(email, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));
        }

        // Fill full name
        const nameInput = await page.$('input[name="fullName"]');
        if (nameInput) {
            await nameInput.click();
            const name = username.replace(/[_\.]/g, ' ').replace(/\d+/g, '').trim() || 'User';
            await page.keyboard.type(name, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));
        }

        // Fill username
        const usernameInput = await page.$('input[name="username"]');
        if (usernameInput) {
            await usernameInput.click();
            await usernameInput.fill('');
            await page.keyboard.type(username, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));
        }

        // Fill password
        const passwordInput = await page.$('input[name="password"]');
        if (passwordInput) {
            await passwordInput.click();
            await page.keyboard.type(password, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));
        }

        // Click Sign Up
        const signupBtn = await page.$(
            'button[type="submit"], button:has-text("Sign up"), button:has-text("Registrarte")'
        );
        if (signupBtn) {
            await signupBtn.click();
        }
        await sleep(humanDelay(5000, 8000));

        // Handle birthday dialog
        const birthdayInput = await page.$('select[title*="Month"], select[title*="Mes"]').catch(() => null);
        if (birthdayInput) {
            // Fill birthday (18+ years old)
            const monthSelect = await page.$('select[title*="Month"], select[title*="Mes"]');
            if (monthSelect) await monthSelect.selectOption({ index: Math.floor(Math.random() * 12) + 1 });

            const daySelect = await page.$('select[title*="Day"], select[title*="Día"]');
            if (daySelect) await daySelect.selectOption({ index: Math.floor(Math.random() * 28) + 1 });

            const yearSelect = await page.$('select[title*="Year"], select[title*="Año"]');
            if (yearSelect) {
                const year = 1994 + Math.floor(Math.random() * 6);
                await yearSelect.selectOption(String(year));
            }

            await sleep(humanDelay(1000, 2000));
            const nextBtn = await page.$(
                'button:has-text("Next"), button:has-text("Siguiente"), button[type="button"]'
            ).catch(() => null);
            if (nextBtn) await nextBtn.click();
            await sleep(humanDelay(3000, 5000));
        }

        // Handle email verification code
        const confirmationInput = await page.$(
            'input[name="email_confirmation_code"], input[placeholder*="code"], input[placeholder*="código"]'
        ).catch(() => null);

        if (confirmationInput) {
            console.log('[Creator] Instagram: Waiting for email verification code...');
            const verifier = createEmailVerifier('supabase');
            const code = await verifier.getVerificationCode(email, 'instagram', 120000);

            if (code) {
                await confirmationInput.click();
                await page.keyboard.type(code, { delay: humanDelay(80, 120) });
                await sleep(humanDelay(1000, 2000));

                const confirmBtn = await page.$(
                    'button:has-text("Confirm"), button:has-text("Confirmar"), button[type="button"]'
                ).catch(() => null);
                if (confirmBtn) await confirmBtn.click();
                await sleep(humanDelay(3000, 5000));
            } else {
                return { success: false, email, error: 'Instagram verification code not received' };
            }
        }

        console.log(`[Creator] Instagram: Account created ✓ (${username})`);
        return { success: true, email, username };
    } catch (err: any) {
        return { success: false, email, error: `Instagram creation error: ${err.message}` };
    }
}

async function createYouTubeAccount(
    page: Page,
    email: string,
    password: string,
    username: string
): Promise<CreationResult> {
    try {
        console.log(`[Creator] YouTube/Google: Creating account ${email}...`);

        // Google account creation
        await page.goto('https://accounts.google.com/signup/v2/webcreateaccount?service=youtube&flowName=GlifWebSignIn', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 4000));

        // First name
        const firstNameInput = await page.$('input[name="firstName"]');
        if (firstNameInput) {
            const firstName = username.split(/[_\.]/)[0] || 'User';
            await firstNameInput.click();
            await page.keyboard.type(firstName, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(300, 600));
        }

        // Last name
        const lastNameInput = await page.$('input[name="lastName"]');
        if (lastNameInput) {
            await lastNameInput.click();
            await page.keyboard.type('Creator', { delay: humanDelay(50, 100) });
            await sleep(humanDelay(300, 600));
        }

        // Click Next
        let nextBtn = await page.$(
            'button:has-text("Next"), button:has-text("Siguiente"), #accountDetailsNext button'
        );
        if (nextBtn) await nextBtn.click();
        await sleep(humanDelay(3000, 5000));

        // Birthday and gender
        const monthInput = await page.$('#month');
        if (monthInput) {
            await monthInput.selectOption(String(Math.floor(Math.random() * 12) + 1));
            const dayInput = await page.$('#day');
            if (dayInput) {
                await dayInput.click();
                await page.keyboard.type(String(Math.floor(Math.random() * 28) + 1));
            }
            const yearInput = await page.$('#year');
            if (yearInput) {
                await yearInput.click();
                const year = 1994 + Math.floor(Math.random() * 6);
                await yearInput.fill(String(year));
            }
            const genderSelect = await page.$('#gender');
            if (genderSelect) {
                await genderSelect.selectOption(String(Math.floor(Math.random() * 2) + 1));
            }
            await sleep(humanDelay(1000, 2000));

            nextBtn = await page.$(
                'button:has-text("Next"), button:has-text("Siguiente"), #birthdayNext button'
            );
            if (nextBtn) await nextBtn.click();
            await sleep(humanDelay(3000, 5000));
        }

        // Choose "Use your existing email" or create Gmail
        // We want to use our catch-all email
        const useExistingEmail = await page.$(
            'div:has-text("Use your existing email"), div:has-text("Usa tu dirección de correo"), ' +
            'button:has-text("Use your existing email")'
        ).catch(() => null);

        if (useExistingEmail) {
            await useExistingEmail.click();
            await sleep(humanDelay(2000, 3000));
        }

        // Enter email
        const emailInput = await page.$(
            'input[name="Email"], input[name="email"], input[type="email"]'
        );
        if (emailInput) {
            await emailInput.click();
            await page.keyboard.type(email, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));

            nextBtn = await page.$(
                'button:has-text("Next"), button:has-text("Siguiente")'
            );
            if (nextBtn) await nextBtn.click();
            await sleep(humanDelay(3000, 5000));
        }

        // Email verification code
        const verifyInput = await page.$(
            'input[name="code"], input[type="tel"][maxlength="6"], input[aria-label*="code"]'
        ).catch(() => null);

        if (verifyInput) {
            console.log('[Creator] YouTube: Waiting for email verification code...');
            const verifier = createEmailVerifier('supabase');
            const code = await verifier.getVerificationCode(email, 'youtube', 120000);

            if (code) {
                await verifyInput.click();
                await page.keyboard.type(code, { delay: humanDelay(80, 120) });
                await sleep(humanDelay(1000, 2000));

                nextBtn = await page.$(
                    'button:has-text("Next"), button:has-text("Siguiente"), button:has-text("Verify")'
                );
                if (nextBtn) await nextBtn.click();
                await sleep(humanDelay(3000, 5000));
            } else {
                return { success: false, email, error: 'Google verification code not received' };
            }
        }

        // Set password
        const passwordInput = await page.$('input[name="Passwd"], input[type="password"]');
        if (passwordInput) {
            await passwordInput.click();
            await page.keyboard.type(password, { delay: humanDelay(50, 100) });

            const confirmPassword = await page.$('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
            if (confirmPassword) {
                await confirmPassword.click();
                await page.keyboard.type(password, { delay: humanDelay(50, 100) });
            }
            await sleep(humanDelay(1000, 2000));

            nextBtn = await page.$(
                'button:has-text("Next"), button:has-text("Siguiente"), #createpasswordNext button'
            );
            if (nextBtn) await nextBtn.click();
            await sleep(humanDelay(3000, 5000));
        }

        // Skip phone number if asked
        const skipPhone = await page.$(
            'button:has-text("Skip"), button:has-text("Omitir"), a:has-text("Skip")'
        ).catch(() => null);
        if (skipPhone) {
            await skipPhone.click();
            await sleep(humanDelay(2000, 3000));
        }

        // Accept terms
        const agreeBtn = await page.$(
            'button:has-text("I agree"), button:has-text("Acepto"), #termsofserviceNext button'
        ).catch(() => null);
        if (agreeBtn) {
            await agreeBtn.click();
            await sleep(humanDelay(3000, 5000));
        }

        console.log(`[Creator] YouTube: Account created ✓ (${email})`);
        return { success: true, email, username };
    } catch (err: any) {
        return { success: false, email, error: `YouTube creation error: ${err.message}` };
    }
}

// ========================================
// Main creation orchestrator
// ========================================

export async function createAccount(
    config: AccountCreationConfig,
    index: number
): Promise<CreationResult> {
    const email = generateEmail(config.emailDomain, config.platform, config.startIndex + index);
    const username = generateUsername(config.usernamePrefix, config.startIndex + index);
    const fingerprint = generateFingerprint(username);

    const sessionDir = path.join(PATHS.sessions, `${config.platform}-${username}`);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Create pending account record FIRST so we can assign a proxy
    const { data: pendingAccount, error: insertError } = await supabase
        .from('accounts')
        .insert({
            platform: config.platform,
            username,
            email_address: email,
            login_password: config.password,
            is_active: false, // Will activate on success
            creation_method: 'automated',
            verification_status: 'ok',
        })
        .select('id')
        .single();

    if (insertError || !pendingAccount) {
        return { success: false, email, error: `DB insert failed: ${insertError?.message}` };
    }

    // Log creation job
    const { data: job } = await supabase.from('account_creation_jobs').insert({
        platform: config.platform,
        email_address: email,
        username,
        status: 'creating',
        account_id: pendingAccount.id,
    }).select('id').single();

    // Assign proxy BEFORE launching browser
    let proxyConfig: { server?: string; username?: string; password?: string } | undefined;
    const { data: proxyResult } = await supabase.rpc('assign_proxy_for_platform', {
        p_account_id: pendingAccount.id,
        p_platform: config.platform,
    }).catch(() => ({ data: null }));

    if (proxyResult) {
        console.log(`[Creator] Proxy assigned for ${username}`);
    } else {
        console.log(`[Creator] No proxy available for ${username} — proceeding without proxy`);
    }

    // Get proxy details from the account (RPC updates the account)
    const { data: accountWithProxy } = await supabase
        .from('accounts')
        .select('proxy_url, proxy_username, proxy_password')
        .eq('id', pendingAccount.id)
        .single();

    if (accountWithProxy?.proxy_url) {
        proxyConfig = {
            server: accountWithProxy.proxy_url,
            username: accountWithProxy.proxy_username || undefined,
            password: accountWithProxy.proxy_password || undefined,
        };
        console.log(`[Creator] Using proxy: ${proxyConfig.server}`);
    }

    const launchOptions: any = {
        headless: config.headless,
        args: [...STEALTH_BROWSER_ARGS],
        viewport: fingerprint.viewport,
        userAgent: fingerprint.userAgent,
        locale: fingerprint.locale,
        timezoneId: fingerprint.timezoneId,
    };

    if (proxyConfig?.server) {
        launchOptions.proxy = proxyConfig;
    }

    const context = await chromium.launchPersistentContext(sessionDir, launchOptions);

    try {
        const page = context.pages()[0] || await context.newPage();
        let result: CreationResult;

        switch (config.platform) {
            case 'tiktok':
                result = await createTikTokAccount(page, email, config.password, username);
                break;
            case 'instagram':
                result = await createInstagramAccount(page, email, config.password, username);
                break;
            case 'youtube':
                result = await createYouTubeAccount(page, email, config.password, username);
                break;
            default:
                result = { success: false, email, error: `Unknown platform: ${config.platform}` };
        }

        if (result.success) {
            // Activate the account
            await supabase.from('accounts').update({
                is_active: true,
                username: result.username || username,
                last_login_at: new Date().toISOString(),
            }).eq('id', pendingAccount.id);

            result.accountId = pendingAccount.id;

            // Update job status
            if (job) {
                await supabase.from('account_creation_jobs').update({
                    status: 'completed',
                    username: result.username || username,
                    completed_at: new Date().toISOString(),
                }).eq('id', job.id);
            }

            console.log(`[Creator] ✅ Account saved: ${result.username} (${email})`);
        } else {
            // Delete the pending account on failure
            await supabase.from('accounts').delete().eq('id', pendingAccount.id);

            // Update job status
            if (job) {
                await supabase.from('account_creation_jobs').update({
                    status: 'failed',
                    error_message: result.error,
                    completed_at: new Date().toISOString(),
                }).eq('id', job.id);
            }
        }

        return result;
    } finally {
        await context.close();
    }
}

// ========================================
// CLI entry point
// ========================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
    const args = process.argv.slice(2);
    const flags: Record<string, string> = {};

    for (let i = 0; i < args.length; i += 2) {
        if (args[i].startsWith('--')) {
            flags[args[i].replace('--', '')] = args[i + 1] || '';
        }
    }

    const platform = (flags.platform || 'tiktok') as 'tiktok' | 'instagram' | 'youtube';
    const count = parseInt(flags.count || '1', 10);
    const startIndex = parseInt(flags['start-index'] || '1', 10);
    const maxConcurrent = parseInt(flags.concurrent || '1', 10);
    const headless = flags.headless !== 'false';

    // Load config from Supabase
    await loadConfig();

    // Get email domain from app_settings
    const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'email_domain')
        .single();

    const emailDomain = settings?.value || flags.domain || '';
    if (!emailDomain) {
        console.error('Error: No email domain configured. Set email_domain in app_settings or use --domain flag.');
        process.exit(1);
    }

    // Generate a strong password for all accounts in this batch
    const password = flags.password || `SUp${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;

    const config: AccountCreationConfig = {
        platform,
        emailDomain,
        count,
        startIndex,
        usernamePrefix: flags.prefix || 'socialup',
        password,
        maxConcurrent,
        headless,
    };

    console.log(`
ContentHub - Account Creator
Platform: ${platform}
Count: ${count} (starting at index ${startIndex})
Email domain: ${emailDomain}
Concurrent: ${maxConcurrent}
Headless: ${headless}
Password: ${password.slice(0, 4)}****
    `);

    const queue = new PQueue({ concurrency: maxConcurrent });
    const results: CreationResult[] = [];

    for (let i = 0; i < count; i++) {
        queue.add(async () => {
            console.log(`\n--- Creating account ${i + 1}/${count} ---`);
            const result = await createAccount(config, i);
            results.push(result);

            if (result.success) {
                console.log(`✅ ${result.username} (${result.email})`);
            } else {
                console.log(`❌ ${result.email}: ${result.error}`);
            }

            // Random delay between account creations (30-90 seconds)
            if (i < count - 1) {
                const delay = humanDelay(30000, 90000);
                console.log(`Waiting ${Math.round(delay / 1000)}s before next account...`);
                await sleep(delay);
            }
        });
    }

    await queue.onIdle();

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n========================================`);
    console.log(`Account creation complete: ${successful}/${count} successful, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        console.log('Failed accounts:');
        results.filter(r => !r.success).forEach(r => {
            console.log(`  ${r.email}: ${r.error}`);
        });
    }

    process.exit(failed > 0 ? 1 : 0);
}

// Only run CLI when executed directly
if (require.main === module) {
    main().catch(err => {
        console.error('[Creator] Fatal error:', err);
        process.exit(1);
    });
}

// Export for use by server.ts
export { AccountCreationConfig, CreationResult };
