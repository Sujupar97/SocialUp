import { supabase } from './supabase';

const TIKTOK_CLIENT_KEY = 'awz6klemqb5wxgsh';
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

export const initiateTikTokAuth = async () => {
    // 1. Generate State (CSRF)
    const state = Math.random().toString(36).substring(7);

    // 2. Generate PKCE Verifier and Challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // 3. Store in LocalStorage for verification later
    localStorage.setItem('tiktok_auth_state', state);
    localStorage.setItem('tiktok_code_verifier', codeVerifier);

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

        if (!codeVerifier) {
            throw new Error('Code Verifier missing from local storage. Auth flow interrupted?');
        }

        const { data, error } = await supabase.functions.invoke('tiktok-auth', {
            body: {
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier // Send to backend for the token exchange
            }
        });

        if (error) throw error;

        // Clean up
        localStorage.removeItem('tiktok_auth_state');
        localStorage.removeItem('tiktok_code_verifier');

        console.log('Authentication successful:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Auth Error:', error);
        throw error;
    }
};
