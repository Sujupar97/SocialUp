import { supabase } from './supabase';

const YOUTUBE_CLIENT_ID = import.meta.env.VITE_YOUTUBE_CLIENT_ID || '';
const REDIRECT_URI = 'https://socialfullup.netlify.app';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';

// PKCE Helper Functions (same pattern as tiktokAuth.ts)
const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
};

const generateCodeChallenge = async (verifier: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Start YouTube OAuth 2.0 flow with PKCE.
 * Redirects user to Google's consent screen.
 */
export const initiateYouTubeAuth = async () => {
    const state = Math.random().toString(36).substring(7);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store in localStorage for callback verification
    localStorage.setItem('youtube_auth_state', state);
    localStorage.setItem('youtube_code_verifier', codeVerifier);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', YOUTUBE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent'); // Force refresh_token on every auth
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    window.location.href = authUrl.toString();
};

/**
 * Handle the OAuth callback from Google.
 * Validates state, exchanges code via Edge Function, returns account.
 */
export const handleYouTubeCallback = async (code: string, state: string) => {
    try {
        console.log('Exchanging YouTube auth code via Edge Function...');

        const savedState = localStorage.getItem('youtube_auth_state');
        if (state !== savedState) {
            throw new Error('State mismatch — possible CSRF attack. Please try again.');
        }

        const codeVerifier = localStorage.getItem('youtube_code_verifier');
        if (!codeVerifier) {
            throw new Error('Code verifier missing from localStorage. Auth flow interrupted?');
        }

        const body: Record<string, string> = {
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        };

        // Attach current user ID for multi-tenant linking
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            body.user_id = user.id;
        }

        const { data, error } = await supabase.functions.invoke('youtube-auth', {
            body,
        });

        if (error) throw error;

        // Clean up localStorage
        localStorage.removeItem('youtube_auth_state');
        localStorage.removeItem('youtube_code_verifier');

        console.log('YouTube authentication successful:', data);
        return { success: true, data };
    } catch (error) {
        console.error('YouTube Auth Error:', error);
        throw error;
    }
};

/**
 * Refresh YouTube token for an account if expired or expiring within 10 minutes.
 */
export const refreshYouTubeTokenIfNeeded = async (accountId: string): Promise<{ refreshed: boolean; error?: string }> => {
    try {
        const { data: account, error: fetchError } = await supabase
            .from('accounts')
            .select('id, expires_at, access_token')
            .eq('id', accountId)
            .single();

        if (fetchError || !account) {
            return { refreshed: false, error: `Account not found: ${fetchError?.message}` };
        }

        if (!account.expires_at) {
            // No expiration info — refresh to be safe
        } else {
            const expiresAt = new Date(account.expires_at);
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
            if (expiresAt > tenMinutesFromNow) {
                return { refreshed: false };
            }
        }

        console.log(`Refreshing YouTube token for account ${accountId}...`);

        const { data, error } = await supabase.functions.invoke('youtube-refresh', {
            body: { account_id: accountId },
        });

        if (error) {
            return { refreshed: false, error: error.message };
        }

        console.log('YouTube token refreshed. New expiration:', data?.expires_at);
        return { refreshed: true };
    } catch (error: any) {
        return { refreshed: false, error: error.message };
    }
};

/**
 * Detect if the current URL callback is from YouTube OAuth.
 * YouTube uses `state` param that matches our stored youtube_auth_state.
 */
export const isYouTubeCallback = (searchParams: URLSearchParams): boolean => {
    const state = searchParams.get('state');
    const code = searchParams.get('code');
    const savedState = localStorage.getItem('youtube_auth_state');
    return !!(code && state && savedState && state === savedState);
};
