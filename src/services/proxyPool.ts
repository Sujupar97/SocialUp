import { supabase } from './supabase';

export interface PoolProxy {
    id: string;
    provider: string;
    host: string;
    port: number;
    username: string | null;
    password: string | null;
    protocol: string;
    country_code: string | null;
    is_available: boolean;
    assigned_account_id: string | null;
    is_healthy: boolean;
    last_checked_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProxyPoolStats {
    total: number;
    available: number;
    assigned: number;
    unhealthy: number;
}

/**
 * Build a proxy URL string from pool proxy fields
 */
export function buildProxyUrl(proxy: Pick<PoolProxy, 'protocol' | 'host' | 'port'>): string {
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
}

/**
 * Get all available (unassigned + healthy) proxies
 */
export async function getAvailableProxies(): Promise<PoolProxy[]> {
    const { data, error } = await supabase
        .from('proxy_pool')
        .select('*')
        .eq('is_available', true)
        .eq('is_healthy', true)
        .order('id');

    if (error) {
        console.error('Error fetching available proxies:', error);
        throw error;
    }

    return data || [];
}

/**
 * Atomically assign the next available proxy to an account via RPC
 */
export async function assignProxyToAccount(accountId: string): Promise<PoolProxy | null> {
    const { data, error } = await supabase
        .rpc('assign_next_proxy', { p_account_id: accountId });

    if (error) {
        // No available proxies is not a fatal error
        if (error.message?.includes('No available proxies')) {
            console.warn('No available proxies in pool');
            return null;
        }
        console.error('Error assigning proxy:', error);
        throw error;
    }

    if (!data || data.length === 0) return null;

    const row = data[0];
    return {
        id: row.proxy_id,
        host: row.proxy_host,
        port: row.proxy_port,
        username: row.proxy_username,
        password: row.proxy_password,
        protocol: row.proxy_protocol,
    } as PoolProxy;
}

/**
 * Release the proxy assigned to a specific account
 */
export async function releaseProxy(accountId: string): Promise<void> {
    const { error } = await supabase
        .rpc('release_proxy', { p_account_id: accountId });

    if (error) {
        console.error('Error releasing proxy:', error);
        throw error;
    }
}

/**
 * Get proxy pool statistics
 */
export async function getProxyPoolStats(): Promise<ProxyPoolStats> {
    const { data, error } = await supabase
        .from('proxy_pool')
        .select('is_available, is_healthy');

    if (error) {
        console.error('Error fetching proxy stats:', error);
        throw error;
    }

    const rows = data || [];
    return {
        total: rows.length,
        available: rows.filter(r => r.is_available && r.is_healthy).length,
        assigned: rows.filter(r => !r.is_available).length,
        unhealthy: rows.filter(r => !r.is_healthy).length,
    };
}

/**
 * Get the proxy assigned to a specific account
 */
export async function getProxyForAccount(accountId: string): Promise<PoolProxy | null> {
    const { data, error } = await supabase
        .from('proxy_pool')
        .select('*')
        .eq('assigned_account_id', accountId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows
        console.error('Error fetching proxy for account:', error);
        throw error;
    }

    return data;
}

/**
 * Get all proxies (for admin view)
 */
export async function getAllProxies(): Promise<PoolProxy[]> {
    const { data, error } = await supabase
        .from('proxy_pool')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching all proxies:', error);
        throw error;
    }

    return data || [];
}
