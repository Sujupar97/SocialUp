/**
 * Email Verification Code Retriever
 *
 * Two backends:
 * 1. Supabase polling (recommended) — Reads from email_verifications table.
 *    Codes are inserted by Cloudflare Email Worker or external webhook.
 * 2. IMAP (alternative) — Connects directly to IMAP mailbox.
 *    Requires 'imapflow' npm package when using this backend.
 *
 * Usage:
 *   const verifier = createEmailVerifier('supabase');
 *   const code = await verifier.getVerificationCode('user@domain.com', 'tiktok', 120000);
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from './config';
import 'dotenv/config';

// Regex patterns for extracting verification codes by platform
const CODE_PATTERNS: Record<string, { senders: string[]; pattern: RegExp }> = {
    tiktok: {
        senders: ['no-reply@tiktok.com', 'noreply@tiktok.com'],
        pattern: /(\d{6})/,
    },
    instagram: {
        senders: ['security@mail.instagram.com', 'no-reply@mail.instagram.com'],
        pattern: /(\d{6})/,
    },
    youtube: {
        senders: ['noreply@google.com', 'no-reply@accounts.google.com'],
        pattern: /(\d{6})/,
    },
};

export interface EmailVerifier {
    /**
     * Wait for and retrieve a verification code sent to the given email.
     * @returns The verification code string, or null if timeout.
     */
    getVerificationCode(
        emailAddress: string,
        platform: string,
        timeoutMs?: number
    ): Promise<string | null>;
}

// ========================================
// Backend 1: Supabase Polling
// ========================================

class SupabaseEmailVerifier implements EmailVerifier {
    private supabase;

    constructor() {
        this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }

    async getVerificationCode(
        emailAddress: string,
        platform: string,
        timeoutMs: number = 120000
    ): Promise<string | null> {
        const startTime = Date.now();
        const pollInterval = 5000; // Check every 5 seconds
        // Only look for codes received after we start waiting (minus a small buffer)
        const cutoffTime = new Date(Date.now() - 10000).toISOString();

        console.log(`[EmailVerifier] Waiting for code to ${emailAddress} (${platform}), timeout ${timeoutMs / 1000}s...`);

        while (Date.now() - startTime < timeoutMs) {
            const { data, error } = await this.supabase
                .from('email_verifications')
                .select('id, verification_code, platform, received_at')
                .eq('email_address', emailAddress)
                .eq('is_consumed', false)
                .gte('received_at', cutoffTime)
                .order('received_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                const record = data[0];

                // Filter by platform if the record has one
                if (record.platform && record.platform !== platform) {
                    // Not for this platform, keep waiting
                } else {
                    // Mark as consumed
                    await this.supabase
                        .from('email_verifications')
                        .update({
                            is_consumed: true,
                            consumed_at: new Date().toISOString(),
                        })
                        .eq('id', record.id);

                    console.log(`[EmailVerifier] Code received: ${record.verification_code}`);
                    return record.verification_code;
                }
            }

            // Wait before polling again
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.log(`[EmailVerifier] Timeout — no code received for ${emailAddress}`);
        return null;
    }
}

// ========================================
// Backend 2: IMAP (requires imapflow package)
// ========================================

class ImapEmailVerifier implements EmailVerifier {
    private host: string;
    private port: number;
    private user: string;
    private pass: string;

    constructor(config: { host: string; port: number; user: string; pass: string }) {
        this.host = config.host;
        this.port = config.port;
        this.user = config.user;
        this.pass = config.pass;
    }

    async getVerificationCode(
        emailAddress: string,
        platform: string,
        timeoutMs: number = 120000
    ): Promise<string | null> {
        // Dynamic import — only loads imapflow when this backend is used
        let ImapFlow: any;
        try {
            ImapFlow = (await import('imapflow')).ImapFlow;
        } catch {
            console.error('[EmailVerifier] IMAP backend requires "imapflow" package. Run: npm install imapflow');
            return null;
        }

        const startTime = Date.now();
        const pollInterval = 5000;
        const platformConfig = CODE_PATTERNS[platform] || CODE_PATTERNS.tiktok;

        console.log(`[EmailVerifier] IMAP: Waiting for code to ${emailAddress} (${platform})...`);

        while (Date.now() - startTime < timeoutMs) {
            const client = new ImapFlow({
                host: this.host,
                port: this.port,
                secure: this.port === 993,
                auth: { user: this.user, pass: this.pass },
                logger: false,
            });

            try {
                await client.connect();
                const lock = await client.getMailboxLock('INBOX');

                try {
                    // Search for recent messages to this email address
                    const searchCriteria = {
                        since: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
                        to: emailAddress,
                    };

                    const messages = client.fetch(searchCriteria, {
                        source: true,
                        envelope: true,
                    });

                    for await (const message of messages) {
                        const from = message.envelope?.from?.[0]?.address || '';
                        const subject = message.envelope?.subject || '';
                        const body = message.source?.toString() || '';

                        // Check if from a known platform sender
                        const isFromPlatform = platformConfig.senders.some(
                            sender => from.toLowerCase().includes(sender.toLowerCase())
                        );

                        if (isFromPlatform) {
                            // Extract code from subject or body
                            const match = subject.match(platformConfig.pattern) ||
                                          body.match(platformConfig.pattern);

                            if (match) {
                                console.log(`[EmailVerifier] IMAP: Code found: ${match[1]}`);
                                lock.release();
                                await client.logout();
                                return match[1];
                            }
                        }
                    }
                } finally {
                    lock.release();
                }

                await client.logout();
            } catch (err: any) {
                console.error(`[EmailVerifier] IMAP error: ${err.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.log(`[EmailVerifier] IMAP: Timeout — no code received for ${emailAddress}`);
        return null;
    }
}

// ========================================
// Factory
// ========================================

/**
 * Create an email verifier instance.
 * @param provider 'supabase' (poll DB) or 'imap' (connect to mailbox)
 * @param imapConfig Required if provider is 'imap'
 */
export function createEmailVerifier(
    provider: 'supabase' | 'imap' = 'supabase',
    imapConfig?: { host: string; port: number; user: string; pass: string }
): EmailVerifier {
    if (provider === 'imap') {
        if (!imapConfig) {
            throw new Error('IMAP config required for imap provider');
        }
        return new ImapEmailVerifier(imapConfig);
    }
    return new SupabaseEmailVerifier();
}

/**
 * Extract verification code from raw email body text.
 * Useful for Cloudflare Email Worker to parse before inserting to DB.
 */
export function extractVerificationCode(body: string, platform?: string): string | null {
    const config = platform ? CODE_PATTERNS[platform] : null;
    const pattern = config?.pattern || /(\d{6})/;
    const match = body.match(pattern);
    return match ? match[1] : null;
}
