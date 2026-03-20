import { supabase } from './supabase';

const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';
const REDIRECT_URI = 'https://socialfullup.netlify.app';
const SCOPES = 'instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list';
const GRAPH_API_VERSION = 'v22.0';

/**
 * Start Instagram OAuth flow via Facebook Login.
 * Redirects user to Facebook's consent screen.
 */
export const initiateInstagramAuth = () => {
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('instagram_auth_state', state);

    const authUrl = new URL(`https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`);
    authUrl.searchParams.append('client_id', FACEBOOK_APP_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    window.location.href = authUrl.toString();
};

/**
 * Handle the OAuth callback from Facebook.
 * Validates state, exchanges code via Edge Function, returns account.
 */
export const handleInstagramCallback = async (code: string, state: string) => {
    try {
        console.log('Exchanging Instagram auth code via Edge Function...');

        const savedState = localStorage.getItem('instagram_auth_state');
        if (state !== savedState) {
            throw new Error('State mismatch — possible CSRF attack. Please try again.');
        }

        const body: Record<string, string> = {
            code,
            redirect_uri: REDIRECT_URI,
        };

        // Attach current user ID for multi-tenant linking
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            body.user_id = user.id;
        }

        const { data, error } = await supabase.functions.invoke('instagram-auth', {
            body,
        });

        if (error) throw error;

        // Clean up localStorage
        localStorage.removeItem('instagram_auth_state');

        console.log('Instagram authentication successful:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Instagram Auth Error:', error);
        throw error;
    }
};

/**
 * Refresh Instagram token for an account if expiring within 7 days.
 * Instagram long-lived tokens last 60 days.
 */
export const refreshInstagramTokenIfNeeded = async (accountId: string): Promise<{ refreshed: boolean; error?: string }> => {
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
            const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            if (expiresAt > sevenDaysFromNow) {
                return { refreshed: false };
            }
        }

        console.log(`Refreshing Instagram token for account ${accountId}...`);

        const { data, error } = await supabase.functions.invoke('instagram-refresh', {
            body: { account_id: accountId },
        });

        if (error) {
            return { refreshed: false, error: error.message };
        }

        console.log('Instagram token refreshed. New expiration:', data?.expires_at);
        return { refreshed: true };
    } catch (error: any) {
        return { refreshed: false, error: error.message };
    }
};

/**
 * Detect if the current URL callback is from Instagram/Facebook OAuth.
 */
export const isInstagramCallback = (searchParams: URLSearchParams): boolean => {
    const state = searchParams.get('state');
    const code = searchParams.get('code');
    const savedState = localStorage.getItem('instagram_auth_state');
    return !!(code && state && savedState && state === savedState);
};
