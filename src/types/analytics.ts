// Analytics Types
export interface Analytics {
    id: string;
    video_copy_id: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    fetched_at: string;
}

export interface AccountAnalytics {
    account_id: string;
    account_username: string;
    platform: 'tiktok' | 'instagram';
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_posts: number;
    average_engagement_rate: number;
}

export interface DashboardStats {
    total_accounts: number;
    active_accounts: number;
    total_videos: number;
    total_distributions: number;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
}
