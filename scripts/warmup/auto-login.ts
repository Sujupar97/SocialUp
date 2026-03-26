/**
 * Auto-login system for warmup agent.
 * When a session expires or is not logged in, this module handles
 * automated login for each platform using stored credentials.
 *
 * Login flows:
 * - TikTok: email/password login via web
 * - Instagram: email/password login via web
 * - YouTube: Google account login (email → password → possible 2FA)
 */

import { Page } from 'playwright';

// Human-like typing and delays
function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface LoginCredentials {
    email: string;
    password: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    username?: string;
}

export interface LoginResult {
    success: boolean;
    error?: string;
    needsVerification?: boolean;
    verificationType?: 'email_code' | 'sms_code' | 'captcha';
}

/**
 * Attempt automated login on the given page.
 * The page should already be navigated to the platform's home/login page.
 */
export async function autoLogin(page: Page, credentials: LoginCredentials): Promise<LoginResult> {
    switch (credentials.platform) {
        case 'tiktok':
            return loginTikTok(page, credentials);
        case 'instagram':
            return loginInstagram(page, credentials);
        case 'youtube':
            return loginYouTube(page, credentials);
        default:
            return { success: false, error: `Unknown platform: ${credentials.platform}` };
    }
}

// ========================================
// TikTok Login
// ========================================

async function loginTikTok(page: Page, creds: LoginCredentials): Promise<LoginResult> {
    try {
        console.log(`[AutoLogin] TikTok: Logging in as ${creds.email}...`);

        // Navigate to login page
        await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 4000));

        // Check if we need to click "Log in with email/username" first
        const emailTab = await page.$('a[href*="email"], div:has-text("Email / Username")').catch(() => null);
        if (emailTab) {
            await emailTab.click();
            await sleep(humanDelay(1000, 2000));
        }

        // Find and fill email input
        const emailInput = await page.$(
            'input[name="username"], input[placeholder*="Email"], input[placeholder*="email"], ' +
            'input[placeholder*="Phone"], input[type="text"]'
        );
        if (!emailInput) {
            return { success: false, error: 'TikTok: email input not found' };
        }

        await emailInput.click();
        await sleep(humanDelay(300, 600));
        await emailInput.fill(''); // Clear first
        await page.keyboard.type(creds.email, { delay: humanDelay(50, 100) });
        await sleep(humanDelay(500, 1000));

        // Find and fill password input
        const passwordInput = await page.$('input[type="password"]');
        if (!passwordInput) {
            return { success: false, error: 'TikTok: password input not found' };
        }

        await passwordInput.click();
        await sleep(humanDelay(300, 600));
        await page.keyboard.type(creds.password, { delay: humanDelay(50, 100) });
        await sleep(humanDelay(500, 1000));

        // Click login button
        const loginBtn = await page.$(
            'button[type="submit"], button[data-e2e="login-button"], ' +
            'button:has-text("Log in"), button:has-text("Iniciar sesión")'
        );
        if (loginBtn) {
            await loginBtn.click();
        } else {
            await page.keyboard.press('Enter');
        }

        await sleep(humanDelay(3000, 5000));

        // Check for CAPTCHA
        const captcha = await page.$('#captcha-verify, iframe[src*="captcha"]').catch(() => null);
        if (captcha) {
            console.log('[AutoLogin] TikTok: CAPTCHA detected');
            return { success: false, needsVerification: true, verificationType: 'captcha' };
        }

        // Check for verification code request
        const verifyCode = await page.$(
            'input[placeholder*="code"], input[placeholder*="código"], ' +
            'div:has-text("verification code"), div:has-text("código de verificación")'
        ).catch(() => null);
        if (verifyCode) {
            console.log('[AutoLogin] TikTok: Email verification required');
            return { success: false, needsVerification: true, verificationType: 'email_code' };
        }

        // Check for error messages
        const errorMsg = await page.$('div[class*="error"], span[class*="error"]').catch(() => null);
        if (errorMsg) {
            const text = await errorMsg.textContent().catch(() => '');
            if (text && text.length > 0) {
                return { success: false, error: `TikTok login error: ${text}` };
            }
        }

        // Verify we're logged in by checking for feed elements
        await sleep(humanDelay(2000, 3000));
        const isLoggedIn = await page.locator('[data-e2e="top-login-button"]').count() === 0;

        if (isLoggedIn) {
            console.log('[AutoLogin] TikTok: Login successful ✓');
            return { success: true };
        }

        return { success: false, error: 'TikTok: login state unclear after submit' };
    } catch (err: any) {
        return { success: false, error: `TikTok login error: ${err.message}` };
    }
}

// ========================================
// Instagram Login
// ========================================

async function loginInstagram(page: Page, creds: LoginCredentials): Promise<LoginResult> {
    try {
        console.log(`[AutoLogin] Instagram: Logging in as ${creds.email}...`);

        // Navigate to login page
        await page.goto('https://www.instagram.com/accounts/login/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 4000));

        // Handle cookie consent banner if present
        const cookieBtn = await page.$(
            'button:has-text("Allow"), button:has-text("Permitir"), ' +
            'button:has-text("Accept"), button:has-text("Aceptar")'
        ).catch(() => null);
        if (cookieBtn) {
            await cookieBtn.click();
            await sleep(humanDelay(1000, 2000));
        }

        // Fill username/email
        const usernameInput = await page.$('input[name="username"]');
        if (!usernameInput) {
            return { success: false, error: 'Instagram: username input not found' };
        }

        await usernameInput.click();
        await sleep(humanDelay(300, 600));
        // Use username if available (Instagram prefers username over email for login)
        const loginId = creds.username || creds.email;
        await page.keyboard.type(loginId, { delay: humanDelay(50, 100) });
        await sleep(humanDelay(500, 1000));

        // Fill password
        const passwordInput = await page.$('input[name="password"]');
        if (!passwordInput) {
            return { success: false, error: 'Instagram: password input not found' };
        }

        await passwordInput.click();
        await sleep(humanDelay(300, 600));
        await page.keyboard.type(creds.password, { delay: humanDelay(50, 100) });
        await sleep(humanDelay(500, 1000));

        // Click login
        const loginBtn = await page.$(
            'button[type="submit"], button:has-text("Log in"), button:has-text("Iniciar sesión")'
        );
        if (loginBtn) {
            await loginBtn.click();
        } else {
            await page.keyboard.press('Enter');
        }

        await sleep(humanDelay(4000, 6000));

        // Check for "suspicious login" / security checkpoint
        if (page.url().includes('challenge') || page.url().includes('checkpoint')) {
            console.log('[AutoLogin] Instagram: Security checkpoint detected');

            const securityCodeInput = await page.$(
                'input[name="security_code"], input[placeholder*="code"]'
            ).catch(() => null);

            if (securityCodeInput) {
                return { success: false, needsVerification: true, verificationType: 'email_code' };
            }
            return { success: false, needsVerification: true, verificationType: 'email_code' };
        }

        // Check for error message
        const errorBanner = await page.$('#slfErrorAlert, div[role="alert"]').catch(() => null);
        if (errorBanner) {
            const text = await errorBanner.textContent().catch(() => '');
            if (text && text.length > 0) {
                return { success: false, error: `Instagram: ${text.trim()}` };
            }
        }

        // Handle "Save Your Login Info?" prompt
        const notNowBtn = await page.$(
            'button:has-text("Not Now"), button:has-text("Ahora no"), ' +
            'div[role="button"]:has-text("Not Now")'
        ).catch(() => null);
        if (notNowBtn) {
            await notNowBtn.click();
            await sleep(humanDelay(1000, 2000));
        }

        // Handle "Turn on Notifications?" prompt
        const notifNotNow = await page.$(
            'button:has-text("Not Now"), button:has-text("Ahora no")'
        ).catch(() => null);
        if (notifNotNow) {
            await notifNotNow.click();
            await sleep(humanDelay(1000, 2000));
        }

        // Verify logged in
        const loginInput = await page.locator('input[name="username"]').count();
        if (loginInput === 0) {
            console.log('[AutoLogin] Instagram: Login successful ✓');
            return { success: true };
        }

        return { success: false, error: 'Instagram: still on login page after submit' };
    } catch (err: any) {
        return { success: false, error: `Instagram login error: ${err.message}` };
    }
}

// ========================================
// YouTube / Google Login
// ========================================

async function loginYouTube(page: Page, creds: LoginCredentials): Promise<LoginResult> {
    try {
        console.log(`[AutoLogin] YouTube/Google: Logging in as ${creds.email}...`);

        // Navigate to Google sign-in
        await page.goto('https://accounts.google.com/signin/v2/identifier?service=youtube', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 4000));

        // Step 1: Enter email
        const emailInput = await page.$('input[type="email"], input[name="identifier"]');
        if (!emailInput) {
            // Maybe already past email step
            const passwordInput = await page.$('input[type="password"]');
            if (passwordInput) {
                // Skip to password step
            } else {
                return { success: false, error: 'YouTube: email input not found' };
            }
        } else {
            await emailInput.click();
            await sleep(humanDelay(300, 600));
            await page.keyboard.type(creds.email, { delay: humanDelay(50, 100) });
            await sleep(humanDelay(500, 1000));

            // Click Next
            const nextBtn = await page.$(
                'button:has-text("Next"), button:has-text("Siguiente"), #identifierNext button'
            );
            if (nextBtn) {
                await nextBtn.click();
            } else {
                await page.keyboard.press('Enter');
            }

            await sleep(humanDelay(3000, 5000));
        }

        // Check for "Couldn't find your Google Account" error
        const accountError = await page.$(
            'div:has-text("Couldn\'t find your Google Account"), ' +
            'div:has-text("No se encontró tu cuenta de Google")'
        ).catch(() => null);
        if (accountError) {
            return { success: false, error: 'YouTube: Google account not found' };
        }

        // Step 2: Enter password
        const passwordInput = await page.$('input[type="password"], input[name="Passwd"]');
        if (!passwordInput) {
            // Could be a challenge/verification screen
            const challengeFrame = page.url().includes('challenge');
            if (challengeFrame) {
                return { success: false, needsVerification: true, verificationType: 'email_code' };
            }
            return { success: false, error: 'YouTube: password input not found' };
        }

        await passwordInput.click();
        await sleep(humanDelay(300, 600));
        await page.keyboard.type(creds.password, { delay: humanDelay(50, 100) });
        await sleep(humanDelay(500, 1000));

        // Click Next/Sign in
        const signInBtn = await page.$(
            '#passwordNext button, button:has-text("Next"), button:has-text("Siguiente")'
        );
        if (signInBtn) {
            await signInBtn.click();
        } else {
            await page.keyboard.press('Enter');
        }

        await sleep(humanDelay(4000, 6000));

        // Check for wrong password
        const wrongPassword = await page.$(
            'div:has-text("Wrong password"), div:has-text("Contraseña incorrecta")'
        ).catch(() => null);
        if (wrongPassword) {
            return { success: false, error: 'YouTube: wrong password' };
        }

        // Check for 2FA / verification challenge
        if (page.url().includes('challenge') || page.url().includes('signin/v2/challenge')) {
            console.log('[AutoLogin] YouTube: Verification challenge detected');

            // Check what type of challenge
            const phoneChallenge = await page.$(
                'div:has-text("Verify it\'s you"), div:has-text("Verifica que eres tú")'
            ).catch(() => null);

            if (phoneChallenge) {
                // Try to find "Try another way" to get email option
                const tryAnotherWay = await page.$(
                    'button:has-text("Try another way"), button:has-text("Probar de otra manera"), ' +
                    'a:has-text("Try another way")'
                ).catch(() => null);

                if (tryAnotherWay) {
                    await tryAnotherWay.click();
                    await sleep(humanDelay(2000, 3000));

                    // Look for email option
                    const emailOption = await page.$(
                        'div:has-text("Get a verification code"), div:has-text("Recibir un código de verificación"), ' +
                        'li:has-text("email"), li:has-text("correo")'
                    ).catch(() => null);

                    if (emailOption) {
                        await emailOption.click();
                        await sleep(humanDelay(2000, 3000));
                        return { success: false, needsVerification: true, verificationType: 'email_code' };
                    }
                }

                return { success: false, needsVerification: true, verificationType: 'sms_code' };
            }

            return { success: false, needsVerification: true, verificationType: 'email_code' };
        }

        // Navigate to YouTube after successful Google login
        await page.goto('https://www.youtube.com/shorts', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await sleep(humanDelay(2000, 3000));

        // Verify logged in
        const avatar = await page.locator('button#avatar-btn, img#img[alt="Avatar"]').count();
        if (avatar > 0) {
            console.log('[AutoLogin] YouTube: Login successful ✓');
            return { success: true };
        }

        // Check for sign-in button (means not logged in)
        const signInLink = await page.locator('a[aria-label="Sign in"]').count();
        if (signInLink > 0) {
            return { success: false, error: 'YouTube: login did not persist to YouTube' };
        }

        // Ambiguous — could be logged in with different UI
        console.log('[AutoLogin] YouTube: Login state unclear, assuming success');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: `YouTube login error: ${err.message}` };
    }
}
