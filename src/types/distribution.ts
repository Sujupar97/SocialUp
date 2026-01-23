// Distribution Types
export type DistributionStatus = 'pending' | 'publishing' | 'published' | 'failed';

export interface VideoCopy {
    id: string;
    video_id: string;
    account_id: string;
    copy_filename: string;
    storage_path: string;
    generated_description: string | null;
    status: DistributionStatus;
    published_at: string | null;
    external_post_id: string | null;
    error_message: string | null;
    created_at: string;
    // Relations
    account?: {
        username: string;
        platform: 'tiktok' | 'instagram';
        profile_photo_url: string | null;
    };
}

export interface DistributionJob {
    video_id: string;
    account_ids: string[];
    total_copies: number;
    completed_copies: number;
    failed_copies: number;
}
