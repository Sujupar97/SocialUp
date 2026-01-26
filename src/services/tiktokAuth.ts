import { supabase } from './supabase';

const TIKTOK_CLIENT_KEY = 'awz6klemqb5wxgsh';
// Usar dinámicamente el origen actual + ruta de cuentas
const REDIRECT_URI = `${window.location.origin}/accounts`;

const SCOPES = 'user.info.basic,video.publish,video.upload';

export const initiateTikTokAuth = () => {
    // Generar estado aleatorio para seguridad (CSRF)
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('tiktok_auth_state', state);

    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.append('client_key', TIKTOK_CLIENT_KEY);
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('state', state);

    window.location.href = authUrl.toString();
};

export const handleAuthCallback = async (code: string) => {
    try {
        console.log('Intercambiando código por token vía Edge Function...');

        const { data, error } = await supabase.functions.invoke('tiktok-auth', {
            body: {
                code,
                redirect_uri: REDIRECT_URI
            }
        });

        if (error) throw error;

        console.log('Autenticación exitosa:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Error en autenticación:', error);
        throw error;
    }
};
