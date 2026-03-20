export type WarmupActionType = 'scroll' | 'watch' | 'like' | 'comment' | 'save' | 'follow' | 'visit_profile' | 'search';

export type WarmupSessionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WarmupSession {
    id: string;
    account_id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    status: WarmupSessionStatus;
    started_at: string | null;
    ended_at: string | null;
    session_duration_sec: number | null;
    actions_count: number;
    actions_summary: Record<string, number>;
    error_message: string | null;
    created_at: string;
}

export interface WarmupAction {
    id: string;
    session_id: string;
    action_type: WarmupActionType;
    target_url: string | null;
    duration_ms: number | null;
    success: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface WarmupDailyStats {
    account_id: string;
    username: string;
    platform: string;
    sessions_today: number;
    sessions_running: number;
    last_session_at: string | null;
    actions_today: number;
}
