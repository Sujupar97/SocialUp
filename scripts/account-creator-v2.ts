/**
 * Account Creator V2 — Self-Optimizing AI Agent (Airtop)
 *
 * This version uses Airtop's high-level capabilities:
 * - fillForm: AI-powered form filling (replaces fragile click sequences)
 * - monitor: Wait for actual page conditions with visual analysis
 * - solveCaptcha: Built-in CAPTCHA solving
 * - record: Session recording for debugging
 * - withSelfOptimization: Retry wrapper with adaptive recovery
 *
 * Usage:
 *   npx tsx scripts/account-creator-v2.ts --platform tiktok
 *   npx tsx scripts/account-creator-v2.ts --platform tiktok --no-proxy true
 */

import { AirtopClient } from '@airtop/sdk';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG, loadConfig } from './config';
import { createEmailVerifier } from './email-verifier';
import { createSmsVerifier } from './sms-verifier';
import 'dotenv/config';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const SIGNUP_URLS: Record<string, string> = {
    tiktok: 'https://www.tiktok.com/signup/phone-or-email/email',
    instagram: 'https://www.instagram.com/accounts/emailsignup/',
    youtube: 'https://accounts.google.com/signup',
};

export interface CreateAccountOptions {
    platform: 'tiktok' | 'instagram' | 'youtube';
    noProxy?: boolean;
    proxyOverride?: { url: string; username: string; password: string };
}

export interface CreateAccountResult {
    success: boolean;
    email?: string;
    username?: string;
    accountId?: string;
    error?: string;
    liveViewUrl?: string;
    sessionId?: string;
}

// ========================================
// Identity generators
// ========================================

function generateEmail(domain: string, platform: string): string {
    return `${platform}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@${domain}`;
}

function generatePassword(): string {
    return `SUp${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;
}

function generateBirthday(): { month: string; day: number; year: number } {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return {
        month: months[Math.floor(Math.random() * 12)],
        day: Math.floor(Math.random() * 28) + 1,
        year: 1994 + Math.floor(Math.random() * 6),
    };
}

async function getProxyForAccount(accountId: string, platform: string): Promise<{ url: string; username: string; password: string } | null> {
    try {
        const { error } = await supabase.rpc('assign_proxy_for_platform', {
            p_account_id: accountId,
            p_platform: platform,
        });
        if (error) return null;

        const { data } = await supabase
            .from('accounts')
            .select('proxy_url, proxy_username, proxy_password')
            .eq('id', accountId)
            .single();

        if (data?.proxy_url) {
            return { url: data.proxy_url, username: data.proxy_username || '', password: data.proxy_password || '' };
        }
    } catch { /* ignore */ }
    return null;
}

// ========================================
// New helpers (Airtop high-level capabilities)
// ========================================

/**
 * Get live view URL with explicit configuration to ensure visibility.
 * Logs all relevant info for debugging.
 */
async function getLiveView(client: AirtopClient, sessionId: string, windowId: string): Promise<{ liveViewUrl?: string }> {
    try {
        const info = await (client.windows as any).getWindowInfo(sessionId, windowId, {
            screenResolution: '1280x720',
            includeNavigationBar: true,
            disableResize: false,
        });
        const url = info.data?.liveViewUrl;
        console.log(`\n[LiveView] ===========================================`);
        console.log(`[LiveView] URL: ${url || '(none)'}`);
        console.log(`[LiveView] Session recording: https://portal.airtop.ai/sessions/${sessionId}`);
        console.log(`[LiveView] Tip: open URL in Chrome incognito directly (not embedded)`);
        console.log(`[LiveView] ===========================================\n`);
        return { liveViewUrl: url };
    } catch (e: any) {
        console.log(`[LiveView] FAILED: ${e.message}`);
        return {};
    }
}

/**
 * Fill the entire signup form in ONE call using Airtop's AI form filler.
 * Replaces the fragile click+type sequence.
 */
async function fillSignupForm(
    client: AirtopClient,
    sessionId: string,
    windowId: string,
    data: { birthday: { month: string; day: number; year: number }; email: string; password: string }
): Promise<any> {
    const customData = `Birthday month: ${data.birthday.month}
Birthday day: ${data.birthday.day}
Birthday year: ${data.birthday.year}
Email address: ${data.email}
Password: ${data.password}`;

    console.log('[FillForm] Calling Airtop fillForm with customData...');
    return await (client.windows as any).fillForm(sessionId, windowId, {
        automationId: 'auto',
        parameters: { customData },
        timeThresholdSeconds: 120,
    });
}

/**
 * Outcomes after clicking "Send Code" — actual states detected by AI vision.
 */
type PostSendOutcome =
    | { kind: 'success'; reason: string }
    | { kind: 'confirmationPage'; reason: string }
    | { kind: 'error'; message: string }
    | { kind: 'captcha' }
    | { kind: 'phoneRequested' }
    | { kind: 'reloaded' }
    | { kind: 'unknown'; raw: string };

function parsePostSendOutcome(modelResponse: string): PostSendOutcome {
    const lower = modelResponse.toLowerCase();

    // PRIORITY 1: Explicit CAPTCHA keywords (must be actual captcha, not form mention)
    if (lower.includes('captcha') || lower.includes('puzzle') || lower.includes('slider')) {
        if (lower.includes('/4') || lower.includes('"4"') || /\b4[.:,)]/.test(lower)) {
            return { kind: 'captcha' };
        }
        // Also check if captcha is explicitly present (not just mentioned in negative)
        if (!lower.includes('no captcha') && !lower.includes('not a captcha') && !lower.includes('not present')) {
            return { kind: 'captcha' };
        }
    }

    // PRIORITY 2: Success states
    if (lower.includes('countdown') || lower.includes('timer')) {
        return { kind: 'success', reason: 'countdown timer' };
    }
    if ((lower.includes('code') && lower.includes('input')) || (lower.includes('code') && lower.includes('field'))) {
        return { kind: 'success', reason: 'code field' };
    }
    // NEW: Username/profile setup page means signup was accepted
    if (lower.includes('username') && lower.includes('password')) {
        return { kind: 'success', reason: 'profile setup page' };
    }
    if (lower.includes('home page') || lower.includes('main feed') || lower.includes('for you')) {
        return { kind: 'success', reason: 'main feed' };
    }

    // PRIORITY 3: Page reloaded back to birthday
    if (lower.includes('birthday selection') || lower.includes('reloaded back') || lower.includes('empty birthday')) {
        return { kind: 'reloaded' };
    }

    // PRIORITY 4: Confirmation/continue page
    if (lower.includes('continue') || lower.includes('confirmation') || lower.includes('accept') || lower.includes('agree') || lower.includes('terms')) {
        return { kind: 'confirmationPage', reason: modelResponse.substring(0, 200) };
    }

    // PRIORITY 5: Phone verification
    if (lower.includes('phone verification') || lower.includes('phone number')) {
        return { kind: 'phoneRequested' };
    }

    // PRIORITY 6: Errors (more specific)
    if (lower.includes('rate limit') || lower.includes('blocked') || lower.includes('too many attempts')) {
        return { kind: 'error', message: modelResponse.substring(0, 200) };
    }

    return { kind: 'unknown', raw: modelResponse };
}

async function monitorPostSendCode(client: AirtopClient, sessionId: string, windowId: string): Promise<PostSendOutcome> {
    console.log('[Monitor] Watching for outcome after Send Code...');
    try {
        const result = await (client.windows as any).monitor(sessionId, windowId, {
            condition: `Determine which of these states the page is in. Reply ONLY with the number and a brief explanation:
1. The Send Code button shows a countdown timer (success)
2. A 6-digit code input field is now focused or visible (success)
3. An error message about email/rate limit/blocked appeared
4. A CAPTCHA puzzle is visible
5. A phone number verification is being requested
6. The page reloaded back to the empty birthday selection form (failure)`,
            configuration: {
                includeVisualAnalysis: 'enabled',
                interval: { intervalSeconds: 3, timeoutSeconds: 60 },
            },
            timeThresholdSeconds: 90,
        });
        const raw = result.data?.modelResponse || '';
        console.log(`[Monitor] AI response: ${raw.substring(0, 300)}`);
        return parsePostSendOutcome(raw);
    } catch (e: any) {
        console.log(`[Monitor] Failed: ${e.message}`);
        return { kind: 'unknown', raw: e.message };
    }
}

/**
 * Self-optimization wrapper. Retries with adaptive recovery on failure.
 * Captures page state via pageQuery on each failure for diagnostic logging.
 */
async function withSelfOptimization<T>(
    stepName: string,
    client: AirtopClient,
    sessionId: string,
    windowId: string,
    fn: () => Promise<T>,
    maxAttempts = 3
): Promise<T> {
    let lastError: Error | null = null;
    let lastPageState = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await fn();
            if (attempt > 1) console.log(`[SelfOpt] ${stepName} recovered on attempt ${attempt}`);
            return result;
        } catch (err: any) {
            lastError = err;
            console.log(`[SelfOpt] ${stepName} attempt ${attempt}/${maxAttempts} failed: ${err.message?.substring(0, 200)}`);

            // Capture page state for diagnostics
            try {
                const stateResult = await (client.windows as any).pageQuery(sessionId, windowId, {
                    prompt: 'Briefly describe what is currently visible on this page: form fields, buttons, error messages, modals. What is the URL? What action should be taken next?',
                    timeThresholdSeconds: 30,
                });
                lastPageState = stateResult.data?.modelResponse?.substring(0, 500) || 'no response';
                console.log(`[SelfOpt] Page state: ${lastPageState}`);
            } catch {
                lastPageState = 'pageQuery failed';
            }

            if (attempt === maxAttempts) {
                throw new Error(`${stepName} failed after ${maxAttempts} attempts. Last page state: ${lastPageState}`);
            }

            // Recovery: wait before retry
            console.log(`[SelfOpt] Waiting 5s before attempt ${attempt + 1}...`);
            await sleep(5000);
        }
    }

    throw lastError || new Error(`${stepName} failed`);
}

// ========================================
// Main entry point
// ========================================

export async function createAccountV2(options: CreateAccountOptions): Promise<CreateAccountResult> {
    // Get config
    const { data: emailDomainSetting } = await supabase.from('app_settings').select('value').eq('key', 'email_domain').single();
    const { data: airtopKeySetting } = await supabase.from('app_settings').select('value').eq('key', 'airtop_api_key').single();

    const emailDomain = emailDomainSetting?.value;
    const airtopKey = airtopKeySetting?.value;

    if (!emailDomain) return { success: false, error: 'email_domain not set in app_settings' };
    if (!airtopKey) return { success: false, error: 'airtop_api_key not set in app_settings' };

    const email = generateEmail(emailDomain, options.platform);
    const password = generatePassword();
    const birthday = generateBirthday();
    const username = `socialup_${Date.now().toString(36)}`;

    console.log(`\n[Creator] Creating ${options.platform} account`);
    console.log(`[Creator] Email: ${email}`);
    console.log(`[Creator] Birthday: ${birthday.month} ${birthday.day}, ${birthday.year}`);

    // Create pending account
    const { data: pendingAccount, error: insertError } = await supabase
        .from('accounts')
        .insert({
            platform: options.platform,
            username,
            email_address: email,
            login_password: password,
            is_active: false,
            creation_method: 'automated',
            verification_status: 'ok',
        })
        .select('id')
        .single();

    if (insertError || !pendingAccount) {
        return { success: false, error: `DB insert failed: ${insertError?.message}` };
    }

    // Resolve proxy
    let proxy: { url: string; username: string; password: string } | null = null;
    if (options.proxyOverride) {
        proxy = options.proxyOverride;
        console.log(`[Creator] Proxy (manual): ${proxy.url}`);
    } else if (!options.noProxy) {
        proxy = await getProxyForAccount(pendingAccount.id, options.platform);
        if (proxy) console.log(`[Creator] Proxy: ${proxy.url}`);
        else console.log('[Creator] No proxy available — proceeding without');
    } else {
        console.log('[Creator] Proxy disabled');
    }

    // Initialize Airtop client (debug enabled for visibility)
    const client = new AirtopClient({ apiKey: airtopKey, debug: false });

    let sessionId: string | undefined;
    let windowId: string | undefined;

    try {
        // ========================================
        // Build session config with high-level features
        // ========================================
        console.log('[Creator] Creating Airtop session with solveCaptcha + record + extended timeout...');
        const sessionConfig: any = {
            solveCaptcha: true,    // Auto-solve CAPTCHAs
            record: true,           // Record session for debugging
            timeoutMinutes: 15,     // Extended timeout (default 10 too short for full flow)
        };
        if (proxy) {
            sessionConfig.proxy = {
                url: proxy.url,
                username: proxy.username,
                password: proxy.password,
            };
        }

        const session = await client.sessions.create({ configuration: sessionConfig });
        sessionId = session.data?.id;
        if (!sessionId) throw new Error('Failed to create Airtop session');
        console.log(`[Creator] Session: ${sessionId}`);
        console.log(`[Creator] Recording: https://portal.airtop.ai/sessions/${sessionId}`);

        // ========================================
        // Create window and navigate
        // ========================================
        console.log(`[Creator] Opening ${SIGNUP_URLS[options.platform]}...`);
        const window = await client.windows.create(sessionId, {
            url: SIGNUP_URLS[options.platform],
        });
        windowId = window.data?.windowId;
        if (!windowId) throw new Error('Failed to create Airtop window');

        // Wait for page to render with monitor() instead of blind sleep
        console.log('[Creator] Waiting for signup page to render...');
        try {
            await (client.windows as any).monitor(sessionId, windowId, {
                condition: 'The signup form has rendered with visible birthday selectors and email/password fields',
                configuration: {
                    includeVisualAnalysis: 'enabled',
                    interval: { intervalSeconds: 3, timeoutSeconds: 30 },
                },
                timeThresholdSeconds: 45,
            });
        } catch {
            console.log('[Creator] Page render monitor timeout — continuing anyway');
        }

        // Get live view AFTER page rendered (improves visibility)
        const liveView = await getLiveView(client, sessionId, windowId);

        // ========================================
        // STRATEGY:
        // 1. fillForm birthday+email+password (AI also clicks Send Code automatically)
        // 2. Wait for email code & enter it (via fillForm or manual)
        // 3. Detect next page with pageQuery/monitor (could be profile setup or feed)
        // 4. If profile setup: fillForm username (+ new password if required)
        // 5. Monitor until feed or final success state
        // ========================================

        // Step 1: Fill the signup form step by step with explicit clicks + types
        // (fillForm "auto" doesn't work reliably on TikTok's custom dropdowns)
        console.log('[Creator] Step 1a: Selecting birthday month...');
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The Month dropdown selector in the "When\'s your birthday?" section',
            timeThresholdSeconds: 45,
        });
        await sleep(2500);
        await client.windows.click(sessionId, windowId, {
            elementDescription: `The option "${birthday.month}" in the opened month dropdown list`,
            timeThresholdSeconds: 45,
        });
        await sleep(2000);

        console.log('[Creator] Step 1b: Selecting birthday day...');
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The Day dropdown selector (the middle dropdown) in the birthday section',
            timeThresholdSeconds: 45,
        });
        await sleep(2500);
        await client.windows.click(sessionId, windowId, {
            elementDescription: `The option "${birthday.day}" in the opened day dropdown list`,
            timeThresholdSeconds: 45,
        });
        await sleep(2000);

        console.log('[Creator] Step 1c: Selecting birthday year...');
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The Year dropdown selector (the rightmost dropdown) in the birthday section',
            timeThresholdSeconds: 45,
        });
        await sleep(2500);
        await client.windows.click(sessionId, windowId, {
            elementDescription: `The option "${birthday.year}" in the opened year dropdown list (you may need to scroll)`,
            timeThresholdSeconds: 45,
        });
        await sleep(2000);

        console.log('[Creator] Step 1d: Typing email address...');
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The email address input field (below the birthday section)',
            timeThresholdSeconds: 30,
        });
        await sleep(1000);
        await client.windows.type(sessionId, windowId, {
            text: email,
            elementDescription: 'The email address input field',
            timeThresholdSeconds: 30,
        });
        await sleep(2000);

        console.log('[Creator] Step 1e: Typing password...');
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The password input field',
            timeThresholdSeconds: 30,
        });
        await sleep(1000);
        await client.windows.type(sessionId, windowId, {
            text: password,
            elementDescription: 'The password input field',
            timeThresholdSeconds: 30,
        });
        await sleep(2000);

        // Verify form is filled before proceeding
        console.log('[Creator] Verifying form state...');
        const formCheck = await (client.windows as any).pageQuery(sessionId, windowId, {
            prompt: `Is the birthday set (not empty)? Is there text in the email field? Is there a password entered (dots visible)? Answer yes or no for each: birthday_filled, email_filled, password_filled.`,
            timeThresholdSeconds: 30,
        }).then((r: any) => r.data?.modelResponse || '').catch(() => '');
        console.log(`[Creator] Form check: ${formCheck.substring(0, 200)}`);

        // Step 2: Click Send Code
        console.log('[Creator] Step 2: Clicking Send Code button...');
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The "Send code" button to send the email verification code',
            timeThresholdSeconds: 30,
        });
        await sleep(5000);

        // Step 3: Wait for email verification code
        console.log('[Creator] Step 3: Waiting for email verification code...');
        const verifier = createEmailVerifier('supabase');
        const code = await verifier.getVerificationCode(email, options.platform, 120000);

        if (code) {
            console.log(`[Creator] Code received: ${code}`);
            // Enter the code and submit
            try {
                await (client.windows as any).fillForm(sessionId, windowId, {
                    automationId: 'auto',
                    parameters: { customData: `Verification code: ${code}` },
                    timeThresholdSeconds: 90,
                });
                console.log('[Creator] Code entered ✓');
            } catch (e: any) {
                console.log(`[Creator] fillForm for code failed (${e.message}), falling back to manual type...`);
                try {
                    await client.windows.click(sessionId, windowId, {
                        elementDescription: 'The 6-digit verification code input field',
                        timeThresholdSeconds: 20,
                    });
                    await client.windows.type(sessionId, windowId, {
                        text: code,
                        elementDescription: 'The verification code input field',
                        pressEnterKey: false,
                        timeThresholdSeconds: 20,
                    });
                } catch (e2: any) {
                    console.log(`[Creator] Manual code entry also failed: ${e2.message}`);
                }
            }

            // Click Next/Submit
            try {
                await client.windows.click(sessionId, windowId, {
                    elementDescription: 'The "Next", "Sign up", or "Siguiente" submit button',
                    timeThresholdSeconds: 30,
                });
            } catch {
                console.log('[Creator] Submit button not found (may have auto-submitted)');
            }
            await sleep(5000);
        } else {
            console.log('[Creator] No email code received — checking if signup already progressed...');
        }

        // Step 4: Detect what page we're on now
        console.log('[Creator] Step 4: Detecting current page state...');
        const pageState = await (client.windows as any).pageQuery(sessionId, windowId, {
            prompt: 'What page is currently visible? Describe it briefly. Is it: (a) a username/profile creation page asking for username and optionally a new password, (b) the main TikTok feed/home page logged in, (c) a CAPTCHA puzzle, (d) a phone verification page, (e) an error page, or (f) still on the signup form with email/password?',
            timeThresholdSeconds: 45,
        }).then((r: any) => r.data?.modelResponse || '').catch(() => 'unknown');
        console.log(`[Creator] Page state: ${pageState.substring(0, 300)}`);

        const stateLower = pageState.toLowerCase();

        // Handle CAPTCHA
        if (stateLower.includes('captcha') || stateLower.includes('puzzle')) {
            console.log('[Creator] CAPTCHA detected — waiting for solveCaptcha...');
            await sleep(25000);
        }

        // Handle phone verification
        if (stateLower.includes('phone')) {
            console.log('[Creator] Phone verification required — handling SMS...');
            const handled = await handlePhoneVerification(client, sessionId, windowId, options.platform);
            if (!handled) throw new Error('Phone verification failed');
        }

        // Step 5: Handle profile/username setup page
        if (stateLower.includes('username') || stateLower.includes('create account') || stateLower.includes('profile')) {
            console.log('[Creator] Step 5: Filling username/profile setup page...');
            const profileData = `Username: ${username}
Password: ${password}`;

            try {
                await (client.windows as any).fillForm(sessionId, windowId, {
                    automationId: 'auto',
                    parameters: { customData: profileData },
                    timeThresholdSeconds: 90,
                });
                console.log('[Creator] Profile form filled ✓');
            } catch (e: any) {
                console.log(`[Creator] Profile fillForm failed: ${e.message}`);
            }

            // Submit the profile form
            try {
                await client.windows.click(sessionId, windowId, {
                    elementDescription: 'The "Sign up", "Create account", or "Submit" button',
                    timeThresholdSeconds: 30,
                });
            } catch { /* ignore */ }

            await sleep(8000);
        }

        // Step 6: Final verification — are we logged in?
        console.log('[Creator] Step 6: Verifying signup completion...');
        try {
            const finalCheck = await (client.windows as any).monitor(sessionId, windowId, {
                condition: 'The TikTok main feed (For You page) is visible OR we see a logged-in user interface with videos/content OR the URL changed to tiktok.com/foryou or similar',
                configuration: {
                    includeVisualAnalysis: 'enabled',
                    interval: { intervalSeconds: 3, timeoutSeconds: 60 },
                },
                timeThresholdSeconds: 90,
            });
            console.log(`[Creator] Final check: ${(finalCheck.data?.modelResponse || '').substring(0, 200)}`);
        } catch (e: any) {
            console.log(`[Creator] Final check timeout: ${e.message}`);
        }

        // ========================================
        // Step 8: Activate account in DB
        // ========================================
        await supabase.from('accounts').update({
            is_active: true,
            username,
            last_login_at: new Date().toISOString(),
        }).eq('id', pendingAccount.id);

        await supabase.from('account_creation_jobs').insert({
            platform: options.platform,
            email_address: email,
            username,
            status: 'completed',
            account_id: pendingAccount.id,
            completed_at: new Date().toISOString(),
        });

        // ========================================
        // Step 9: Save profile for future warmup reuse
        // ========================================
        const profileName = `${options.platform}_${username}`;
        try {
            await (client.sessions as any).saveProfileOnTermination(sessionId, profileName);
            console.log(`[Creator] Profile saved as ${profileName}`);

            // Also persist in DB (best effort — column may not exist yet)
            try {
                await supabase.from('accounts').update({
                    airtop_profile_name: profileName,
                } as any).eq('id', pendingAccount.id);
            } catch {
                console.log(`[Creator] Note: airtop_profile_name column not in DB — saved in Airtop only`);
            }
        } catch (e: any) {
            console.log(`[Creator] Profile save failed (non-fatal): ${e.message}`);
        }

        console.log(`\n[Creator] ✅ Account created: ${username} (${email})`);

        return {
            success: true,
            email,
            username,
            accountId: pendingAccount.id,
            liveViewUrl: liveView.liveViewUrl,
            sessionId,
        };
    } catch (err: any) {
        console.error(`[Creator] ❌ Error: ${err.message}`);
        if (sessionId) {
            console.log(`[Creator] Review recording: https://portal.airtop.ai/sessions/${sessionId}`);
        }

        // Cleanup
        await supabase.from('account_creation_jobs').delete().eq('account_id', pendingAccount.id);
        await supabase.from('proxy_account_assignments').delete().eq('account_id', pendingAccount.id);
        await supabase.from('accounts').delete().eq('id', pendingAccount.id);

        return { success: false, email, error: err.message, sessionId };
    } finally {
        if (sessionId) {
            try {
                await client.sessions.terminate(sessionId);
                console.log(`[Creator] Session terminated`);
            } catch { /* ignore */ }
        }
    }
}

// ========================================
// Phone verification helper
// ========================================

async function handlePhoneVerification(
    client: AirtopClient,
    sessionId: string,
    windowId: string,
    platform: string
): Promise<boolean> {
    try {
        const smsVerifier = createSmsVerifier();
        const rental = await smsVerifier.rentNumber(platform);
        if (!rental) {
            console.log('[Creator] Failed to rent SMS number');
            return false;
        }
        console.log(`[Creator] Rented SMS number: ${rental.phoneNumber}`);

        // Use fillForm for phone entry
        try {
            await (client.windows as any).fillForm(sessionId, windowId, {
                automationId: 'auto',
                parameters: { customData: `Phone number: ${rental.phoneNumber}` },
                timeThresholdSeconds: 60,
            });
        } catch {
            await client.windows.type(sessionId, windowId, {
                text: rental.phoneNumber,
                elementDescription: 'The phone number input field',
                timeThresholdSeconds: 30,
            });
        }

        // Click send code
        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The "Send code" or submit button for phone verification',
            timeThresholdSeconds: 30,
        });

        // Wait for SMS
        const smsCode = await smsVerifier.waitForCode(rental.id, 120000);
        if (!smsCode) {
            await smsVerifier.cancelNumber(rental.id);
            return false;
        }

        // Enter SMS code
        try {
            await (client.windows as any).fillForm(sessionId, windowId, {
                automationId: 'auto',
                parameters: { customData: `SMS verification code: ${smsCode}` },
                timeThresholdSeconds: 60,
            });
        } catch {
            await client.windows.type(sessionId, windowId, {
                text: smsCode,
                elementDescription: 'The SMS verification code input field',
                timeThresholdSeconds: 30,
            });
        }

        await client.windows.click(sessionId, windowId, {
            elementDescription: 'The verify or submit button',
            timeThresholdSeconds: 30,
        });

        await smsVerifier.confirmCodeReceived(rental.id);
        console.log('[Creator] SMS verification complete');
        return true;
    } catch (e: any) {
        console.error(`[Creator] SMS verification error: ${e.message}`);
        return false;
    }
}

// ========================================
// CLI entry point
// ========================================

async function main() {
    const args = process.argv.slice(2);
    const flags: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
        if (args[i].startsWith('--')) flags[args[i].replace('--', '')] = args[i + 1] || '';
    }

    const platform = (flags.platform || 'tiktok') as 'tiktok' | 'instagram' | 'youtube';
    const noProxy = flags['no-proxy'] === 'true' || flags['no-proxy'] === '';

    await loadConfig();

    console.log(`
╔═══════════════════════════════════════════════╗
║   SocialUp - AI Account Creator V3            ║
║   Platform: ${platform.padEnd(33)}║
║   Mode: ${(noProxy ? 'No proxy' : 'With proxy').padEnd(37)}║
╚═══════════════════════════════════════════════╝`);

    const startTime = Date.now();
    const result = await createAccountV2({ platform, noProxy });
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n${'='.repeat(50)}`);
    if (result.success) {
        console.log(`✅ SUCCESS in ${elapsed}s`);
        console.log(`   Username: ${result.username}`);
        console.log(`   Email: ${result.email}`);
        console.log(`   ID: ${result.accountId}`);
        console.log(`   Recording: https://portal.airtop.ai/sessions/${result.sessionId}`);
    } else {
        console.log(`❌ FAILED in ${elapsed}s — ${result.error}`);
        if (result.sessionId) {
            console.log(`   Recording: https://portal.airtop.ai/sessions/${result.sessionId}`);
        }
    }
    console.log(`${'='.repeat(50)}\n`);

    process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
    main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}
