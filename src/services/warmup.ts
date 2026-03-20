import { supabase } from './supabase';
import { AUTOMATION_SERVER } from '../utils/constants';
import type { WarmupSession, WarmupDailyStats } from '../types/warmup';

/**
 * Get today's warmup stats for all accounts
 */
export async function getWarmupDailyStats(): Promise<WarmupDailyStats[]> {
    const { data, error } = await supabase
        .from('warmup_daily_stats')
        .select('*');

    if (error) {
        console.error('Error fetching warmup stats:', error.message);
        return [];
    }

    return data || [];
}

/**
 * Get warmup session history for a specific account
 */
export async function getWarmupSessions(accountId: string, limit = 20): Promise<WarmupSession[]> {
    const { data, error } = await supabase
        .from('warmup_sessions')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching warmup sessions:', error.message);
        return [];
    }

    return data || [];
}

/**
 * Trigger a manual warmup session via the automation server
 */
export async function triggerWarmup(accountId: string): Promise<{ success: boolean; error?: string }> {
    if (!AUTOMATION_SERVER) {
        return { success: false, error: 'Automation server not configured' };
    }

    try {
        const response = await fetch(`${AUTOMATION_SERVER}/api/warmup/start/${accountId}`, {
            method: 'POST',
        });

        const data = await response.json();
        return { success: data.success, error: data.error };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Get warmup stats for a single account
 */
export async function getAccountWarmupStats(accountId: string): Promise<WarmupDailyStats | null> {
    const { data, error } = await supabase
        .from('warmup_daily_stats')
        .select('*')
        .eq('account_id', accountId)
        .single();

    if (error) return null;
    return data;
}
