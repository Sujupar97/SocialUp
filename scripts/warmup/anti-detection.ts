/**
 * Anti-detection utilities for warmup browser sessions.
 * Provides randomized user agents, viewports, and timezone mapping
 * to make each session appear as a unique real user.
 */

// Real Chrome user agents from recent versions (macOS + Windows mix)
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
];

// Country code → timezone mapping for proxy geo-matching
const TIMEZONE_MAP: Record<string, string> = {
    CO: 'America/Bogota',
    MX: 'America/Mexico_City',
    AR: 'America/Argentina/Buenos_Aires',
    CL: 'America/Santiago',
    PE: 'America/Lima',
    EC: 'America/Guayaquil',
    VE: 'America/Caracas',
    US: 'America/New_York',
    ES: 'Europe/Madrid',
    BR: 'America/Sao_Paulo',
};

// Country code → locale mapping
const LOCALE_MAP: Record<string, string> = {
    CO: 'es-CO',
    MX: 'es-MX',
    AR: 'es-AR',
    CL: 'es-CL',
    PE: 'es-PE',
    EC: 'es-EC',
    VE: 'es-VE',
    US: 'en-US',
    ES: 'es-ES',
    BR: 'pt-BR',
};

export interface BrowserFingerprint {
    userAgent: string;
    viewport: { width: number; height: number };
    timezoneId: string;
    locale: string;
}

/**
 * Generate a randomized but consistent browser fingerprint for a session.
 * Uses the username as seed so the same account always gets the same UA
 * (switching UA mid-account looks suspicious).
 */
export function generateFingerprint(username: string, countryCode?: string): BrowserFingerprint {
    // Deterministic UA selection based on username hash
    const hash = simpleHash(username);
    const uaIndex = hash % USER_AGENTS.length;

    // Slight viewport variation (±30px) — deterministic per username
    const widthOffset = (hash % 61) - 30;  // -30 to +30
    const heightOffset = ((hash >> 8) % 41) - 20;  // -20 to +20

    const country = (countryCode || 'CO').toUpperCase();

    return {
        userAgent: USER_AGENTS[uaIndex],
        viewport: {
            width: 1280 + widthOffset,
            height: 720 + heightOffset,
        },
        timezoneId: TIMEZONE_MAP[country] || 'America/Bogota',
        locale: LOCALE_MAP[country] || 'es-CO',
    };
}

/**
 * Simple string hash for deterministic randomization.
 * Not cryptographic — just for consistent fingerprint selection.
 */
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Browser launch args optimized for stealth.
 */
export const STEALTH_BROWSER_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
];
