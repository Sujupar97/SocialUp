import { supabase } from './supabase';

const TIKTOK_CLIENT_KEY = import.meta.env.VITE_TIKTOK_CLIENT_KEY || '';
// Production Redirect URI (must match Developer Portal exactly)
const REDIRECT_URI = 'https://socialfullup.netlify.app';

const SCOPES = 'user.info.basic,video.publish,video.upload';

// PKCE Helper Functions
const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
};

const generateCodeChallenge = async (verifier: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);

    // Convert buffer to base64 URL safe string manually to avoid dependency issues
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const initiateTikTokAuth = async (proxyConfig?: { url: string, username?: string, password?: string }) => {
    // 1. Generate State (CSRF)
    const state = Math.random().toString(36).substring(7);

    // 2. Generate PKCE Verifier and Challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // 3. Store in LocalStorage for verification later
    localStorage.setItem('tiktok_auth_state', state);
    localStorage.setItem('tiktok_code_verifier', codeVerifier);

    // Store Proxy Config if provided
    if (proxyConfig) {
        localStorage.setItem('tiktok_proxy_config', JSON.stringify(proxyConfig));
    } else {
        localStorage.removeItem('tiktok_proxy_config');
    }

    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.append('client_key', TIKTOK_CLIENT_KEY);
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('state', state);

    // Add PKCE parameters
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    window.location.href = authUrl.toString();
};

export const handleAuthCallback = async (code: string) => {
    try {
        console.log('Exchanging code for token via Edge Function...');

        // Retrieve the verifier we stored before redirecting
        const codeVerifier = localStorage.getItem('tiktok_code_verifier');

        // Retrieve Pending Proxy Config
        const proxyConfigStr = localStorage.getItem('tiktok_proxy_config');
        const proxyConfig = proxyConfigStr ? JSON.parse(proxyConfigStr) : null;

        if (!codeVerifier) {
            throw new Error('Code Verifier missing from local storage. Auth flow interrupted?');
        }

        const body: any = {
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        };

        if (proxyConfig) {
            body.proxy_url = proxyConfig.url;
            body.proxy_username = proxyConfig.username;
            body.proxy_password = proxyConfig.password;
        }

        // Retrieve current User ID to link account owner
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            body.user_id = user.id;
        }

        const { data, error } = await supabase.functions.invoke('tiktok-auth', {
            body: body
        });

        if (error) throw error;

        // Clean up
        localStorage.removeItem('tiktok_auth_state');
        localStorage.removeItem('tiktok_code_verifier');
        localStorage.removeItem('tiktok_proxy_config');

        console.log('Authentication successful:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Auth Error:', error);
        throw error;
    }
};

/**
 * Refresh token for an account if expired or about to expire.
 * Calls the tiktok-refresh Edge Function.
 */
export const refreshTokenIfNeeded = async (accountId: string): Promise<{ refreshed: boolean; error?: string }> => {
    try {
        // Check if token is expired or expires within 10 minutes
        const { data: account, error: fetchError } = await supabase
            .from('accounts')
            .select('id, expires_at, access_token')
            .eq('id', accountId)
            .single();

        if (fetchError || !account) {
            return { refreshed: false, error: `Account not found: ${fetchError?.message}` };
        }

        if (!account.expires_at) {
            // No expiration info — try refreshing to be safe
        } else {
            const expiresAt = new Date(account.expires_at);
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

            if (expiresAt > tenMinutesFromNow) {
                // Token still valid
                return { refreshed: false };
            }
        }

        console.log(`Refreshing token for account ${accountId}...`);

        const { data, error } = await supabase.functions.invoke('tiktok-refresh', {
            body: { account_id: accountId }
        });

        if (error) {
            return { refreshed: false, error: error.message };
        }

        console.log('Token refreshed. New expiration:', data?.expires_at);
        return { refreshed: true };
    } catch (error: any) {
        return { refreshed: false, error: error.message };
    }
};
