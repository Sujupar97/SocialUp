import { supabase } from './supabase';
import type { DashboardStats, AccountAnalytics } from '../types';

/**
 * Obtener estadísticas del dashboard
 */
export async function getDashboardStats(): Promise<DashboardStats> {
    const { data, error } = await supabase
        .from('dashboard_stats')
        .select('*')
        .single();

    if (error) {
        console.error('Error fetching dashboard stats:', error);
        // Retornar valores por defecto si hay error
        return {
            total_accounts: 0,
            active_accounts: 0,
            total_videos: 0,
            total_distributions: 0,
            total_views: 0,
            total_likes: 0,
            total_comments: 0,
            total_shares: 0,
        };
    }

    return data;
}

/**
 * Obtener estadísticas por cuenta
 */
export async function getAccountStats(): Promise<AccountAnalytics[]> {
    const { data, error } = await supabase
        .from('account_stats')
        .select('*');

    if (error) {
        console.error('Error fetching account stats:', error);
        return [];
    }

    return (data || []).map(row => ({
        account_id: row.id,
        account_username: row.username,
        platform: row.platform,
        total_views: Number(row.total_views) || 0,
        total_likes: Number(row.total_likes) || 0,
        total_comments: Number(row.total_comments) || 0,
        total_shares: Number(row.total_shares) || 0,
        total_posts: Number(row.total_posts) || 0,
        average_engagement_rate: row.total_views > 0
            ? ((Number(row.total_likes) + Number(row.total_comments) + Number(row.total_shares)) / Number(row.total_views)) * 100
            : 0,
    }));
}

/**
 * Guardar analytics de una publicación (llamado desde N8N)
 */
export async function saveAnalytics(input: {
    video_copy_id: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    reach?: number;
}): Promise<void> {
    const { error } = await supabase
        .from('analytics')
        .insert([input]);

    if (error) {
        console.error('Error saving analytics:', error);
        throw error;
    }
}
