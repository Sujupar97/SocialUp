/**
 * ContentHub - Test Configuration
 * Cuentas de prueba para el MVP
 * 
 * ⚠️ IMPORTANTE: Este archivo contiene credenciales sensibles
 * En producción, se guardarán encriptadas en Supabase
 */

import 'dotenv/config';

export interface TikTokAccount {
    id: string;
    username: string;
    email: string;
    password: string;
}

// Cuentas de prueba (MVP)
export const TEST_ACCOUNTS: TikTokAccount[] = [
    {
        id: 'account_1',
        username: 'johanngonzalezsas',
        email: 'johanngonzalezsas@gmail.com',
        password: 'Galletas777$'
    },
    {
        id: 'account_2',
        username: 'johanngonza',
        email: 'johanngonza@yahoo.com',
        password: 'Galletas777$'
    }
];

// Configuración de Gemini
export const GEMINI_CONFIG = {
    apiKey: process.env.VITE_GEMINI_API_KEY || '',
    model: 'gemini-1.5-flash'
};

// Directorios de trabajo
export const PATHS = {
    sessions: './sessions',
    processed: './processed',
    uploads: './uploads'
};
