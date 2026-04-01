/**
 * SMS Verification Service - sms-activate.org
 * Rents virtual phone numbers and retrieves SMS verification codes
 * for automated account creation on TikTok, Instagram, YouTube.
 *
 * Flow: rentNumber() → waitForCode() → confirmCodeReceived() / cancelNumber()
 * API docs: https://sms-activate.org/en/api2
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from './config';

const SMS_ACTIVATE_API = 'https://api.sms-activate.org/stubs/handler_api.php';

// Platform service codes for sms-activate.org
const SERVICE_CODES: Record<string, string> = {
    tiktok: 'ew',
    instagram: 'ig',
    youtube: 'go',
    google: 'go',
};

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let cachedApiKey: string | null = null;
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (!supabase) {
        supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }
    return supabase;
}

async function getApiKey(): Promise<string> {
    if (cachedApiKey) return cachedApiKey;

    const db = getSupabase();
    const { data } = await db
        .from('app_settings')
        .select('value')
        .eq('key', 'smsactivate_api_key')
        .single();

    if (!data?.value) {
        throw new Error('sms-activate.org API key not found in app_settings. Add it with key "smsactivate_api_key".');
    }

    cachedApiKey = data.value;
    return data.value;
}

export interface SmsRental {
    id: string;
    phoneNumber: string;
    platform: string;
    countryCode: string;
}

export interface SmsVerifier {
    /** Check account balance */
    getBalance(): Promise<number>;

    /** Rent a phone number for a specific platform */
    rentNumber(platform: string, countryCode?: string): Promise<SmsRental | null>;

    /** Wait for the SMS verification code to arrive */
    waitForCode(rentalId: string, timeoutMs?: number): Promise<string | null>;

    /** Confirm that the code was received and used (releases the number) */
    confirmCodeReceived(rentalId: string): Promise<void>;

    /** Cancel the rental and get a refund (if no SMS was received) */
    cancelNumber(rentalId: string): Promise<void>;
}

async function apiCall(params: Record<string, string>): Promise<string> {
    const apiKey = await getApiKey();
    const url = new URL(SMS_ACTIVATE_API);
    url.searchParams.set('api_key', apiKey);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    const text = await response.text();
    return text.trim();
}

function parseResponse(response: string): { status: string; data?: string } {
    // Responses are in format STATUS:DATA or just STATUS
    const parts = response.split(':');
    return {
        status: parts[0],
        data: parts.slice(1).join(':') || undefined,
    };
}

class SmsActivateVerifier implements SmsVerifier {
    async getBalance(): Promise<number> {
        const response = await apiCall({ action: 'getBalance' });
        const parsed = parseResponse(response);

        if (parsed.status === 'ACCESS_BALANCE') {
            return parseFloat(parsed.data || '0');
        }

        throw new Error(`Failed to get balance: ${response}`);
    }

    async rentNumber(platform: string, countryCode: string = '0'): Promise<SmsRental | null> {
        const serviceCode = SERVICE_CODES[platform.toLowerCase()];
        if (!serviceCode) {
            throw new Error(`Unknown platform: ${platform}. Supported: ${Object.keys(SERVICE_CODES).join(', ')}`);
        }

        console.log(`[SMS] Renting number for ${platform} (service: ${serviceCode}, country: ${countryCode})...`);

        const response = await apiCall({
            action: 'getNumber',
            service: serviceCode,
            country: countryCode,
        });

        const parsed = parseResponse(response);

        if (parsed.status === 'ACCESS_NUMBER' && parsed.data) {
            // Response: ACCESS_NUMBER:ID:NUMBER
            const parts = parsed.data.split(':');
            const rentalId = parts[0];
            const phoneNumber = parts[1];

            console.log(`[SMS] Rented number: ${phoneNumber} (rental ID: ${rentalId})`);

            // Save to DB
            const db = getSupabase();
            await db.from('sms_verifications').insert({
                rental_id: rentalId,
                phone_number: phoneNumber,
                platform: platform.toLowerCase(),
                country_code: countryCode,
                status: 'waiting',
                provider: 'sms-activate',
            });

            return {
                id: rentalId,
                phoneNumber,
                platform: platform.toLowerCase(),
                countryCode,
            };
        }

        // Handle errors
        const errorMessages: Record<string, string> = {
            'NO_NUMBERS': 'No numbers available for this service/country',
            'NO_BALANCE': 'Insufficient balance on sms-activate.org',
            'BAD_ACTION': 'Invalid API action',
            'BAD_SERVICE': 'Invalid service code',
            'BAD_KEY': 'Invalid API key',
            'ERROR_SQL': 'Server error',
            'NO_ACTIVATION': 'No activation found',
        };

        const errorMsg = errorMessages[response] || `Unknown error: ${response}`;
        console.error(`[SMS] Failed to rent number: ${errorMsg}`);
        return null;
    }

    async waitForCode(rentalId: string, timeoutMs: number = 120000): Promise<string | null> {
        console.log(`[SMS] Waiting for code on rental ${rentalId} (timeout: ${timeoutMs / 1000}s)...`);

        const startTime = Date.now();
        let pollCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            pollCount++;
            const response = await apiCall({
                action: 'getStatus',
                id: rentalId,
            });

            if (response.startsWith('STATUS_OK:')) {
                const code = response.replace('STATUS_OK:', '');
                console.log(`[SMS] Code received: ${code} (poll #${pollCount})`);

                // Update DB
                const db = getSupabase();
                await db.from('sms_verifications').update({
                    verification_code: code,
                    status: 'code_received',
                    code_received_at: new Date().toISOString(),
                }).eq('rental_id', rentalId);

                return code;
            }

            if (response === 'STATUS_WAIT_CODE') {
                // Still waiting — poll again
                if (pollCount % 6 === 0) {
                    console.log(`[SMS] Still waiting... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
                }
            } else if (response === 'STATUS_CANCEL') {
                console.log('[SMS] Rental was cancelled');
                return null;
            } else {
                console.log(`[SMS] Unexpected status: ${response}`);
            }

            // Poll every 5 seconds
            await sleep(5000);
        }

        console.log(`[SMS] Timeout waiting for code (${timeoutMs / 1000}s)`);
        return null;
    }

    async confirmCodeReceived(rentalId: string): Promise<void> {
        console.log(`[SMS] Confirming code received for rental ${rentalId}`);

        const response = await apiCall({
            action: 'setStatus',
            id: rentalId,
            status: '6', // 6 = activation completed
        });

        // Update DB
        const db = getSupabase();
        await db.from('sms_verifications').update({
            status: 'confirmed',
        }).eq('rental_id', rentalId);

        console.log(`[SMS] Confirmed: ${response}`);
    }

    async cancelNumber(rentalId: string): Promise<void> {
        console.log(`[SMS] Cancelling rental ${rentalId}`);

        const response = await apiCall({
            action: 'setStatus',
            id: rentalId,
            status: '8', // 8 = cancel activation
        });

        // Update DB
        const db = getSupabase();
        await db.from('sms_verifications').update({
            status: 'cancelled',
        }).eq('rental_id', rentalId);

        console.log(`[SMS] Cancelled: ${response}`);
    }
}

/**
 * Create an SMS verifier instance.
 * Currently only supports sms-activate.org.
 */
export function createSmsVerifier(): SmsVerifier {
    return new SmsActivateVerifier();
}

// CLI test
if (require.main === module) {
    (async () => {
        const verifier = createSmsVerifier();

        try {
            const balance = await verifier.getBalance();
            console.log(`Balance: $${balance}`);

            const args = process.argv.slice(2);
            if (args[0] === 'rent') {
                const platform = args[1] || 'tiktok';
                const country = args[2] || '0';
                const rental = await verifier.rentNumber(platform, country);
                if (rental) {
                    console.log(`\nRented: ${rental.phoneNumber} (ID: ${rental.id})`);
                    console.log('Waiting for code...');
                    const code = await verifier.waitForCode(rental.id, 120000);
                    if (code) {
                        console.log(`Code: ${code}`);
                        await verifier.confirmCodeReceived(rental.id);
                    } else {
                        console.log('No code received, cancelling...');
                        await verifier.cancelNumber(rental.id);
                    }
                }
            }
        } catch (err: any) {
            console.error(`Error: ${err.message}`);
        }

        process.exit(0);
    })();
}
