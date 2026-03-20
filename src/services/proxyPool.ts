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
    is_healthy: boolean;
    last_checked_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProxyAssignment {
    account_id: string;
    platform: string;
    username: string;
}

export interface ProxyGroup {
    proxy_id: string;
    host: string;
    port: number;
    country_code: string | null;
    is_healthy: boolean;
    is_available: boolean;
    assignments: ProxyAssignment[];
    assignment_count: number;
}

export interface ProxyPoolStats {
    total: number;
    available: number;
    assigned: number;
    unhealthy: number;
    totalSlots: number;
    usedSlots: number;
}

/**
 * Build a proxy URL string from pool proxy fields
 */
export function buildProxyUrl(proxy: Pick<PoolProxy, 'protocol' | 'host' | 'port'>): string {
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
}

/**
 * Get all available proxies (has at least 1 free slot and is healthy)
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
 * Atomically assign a proxy to an account for a specific platform via RPC.
 * Prefers proxies that already have assignments on other platforms (groups accounts).
 */
export async function assignProxyToAccount(accountId: string, platform: string): Promise<PoolProxy | null> {
    const { data, error } = await supabase
        .rpc('assign_proxy_for_platform', { p_account_id: accountId, p_platform: platform });

    if (error) {
        if (error.message?.includes('No available proxy')) {
            console.warn(`No available proxy with free ${platform} slot`);
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
 * Legacy: assign next proxy (1:1 model, backwards compatible)
 */
export async function assignNextProxy(accountId: string): Promise<PoolProxy | null> {
    const { data, error } = await supabase
        .rpc('assign_next_proxy', { p_account_id: accountId });

    if (error) {
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
    const { data: proxies, error: proxyError } = await supabase
        .from('proxy_pool')
        .select('is_available, is_healthy');

    const { count: usedSlots } = await supabase
        .from('proxy_account_assignments')
        .select('id', { count: 'exact', head: true });

    if (proxyError) {
        console.error('Error fetching proxy stats:', proxyError);
        throw proxyError;
    }

    const rows = proxies || [];
    return {
        total: rows.length,
        available: rows.filter(r => r.is_available && r.is_healthy).length,
        assigned: rows.filter(r => !r.is_available).length,
        unhealthy: rows.filter(r => !r.is_healthy).length,
        totalSlots: rows.length * 3,
        usedSlots: usedSlots || 0,
    };
}

/**
 * Get the proxy assigned to a specific account (via junction table)
 */
export async function getProxyForAccount(accountId: string): Promise<PoolProxy | null> {
    const { data, error } = await supabase
        .from('proxy_account_assignments')
        .select('proxy_id')
        .eq('account_id', accountId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching proxy for account:', error);
        return null;
    }

    const { data: proxy, error: proxyError } = await supabase
        .from('proxy_pool')
        .select('*')
        .eq('id', data.proxy_id)
        .single();

    if (proxyError) return null;
    return proxy;
}

/**
 * Get proxy groups (proxy + all assigned accounts)
 */
export async function getProxyGroups(): Promise<ProxyGroup[]> {
    const { data, error } = await supabase
        .from('proxy_groups')
        .select('*');

    if (error) {
        console.error('Error fetching proxy groups:', error);
        return [];
    }

    return data || [];
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
