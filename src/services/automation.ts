/**
 * ContentHub - Automation Service
 * Connects the frontend with the automation backend and Supabase
 */

import { supabase } from './supabase';
import { N8N_WEBHOOKS } from '../utils/constants';

export interface DistributionRequest {
    videoUrl: string;
    baseDescription: string;
    accountIds: string[];
    ctaType?: 'first_comment' | 'keyword_dm';
    ctaContent?: string;
}

export interface DistributionStatus {
    jobId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    completedAccounts: number;
    totalAccounts: number;
    results: {
        accountId: string;
        status: 'pending' | 'published' | 'failed';
        postUrl?: string;
        error?: string;
    }[];
}

/**
 * Starts the video distribution process
 */
export async function startDistribution(request: DistributionRequest): Promise<{ jobId: string } | null> {
    try {
        if (!N8N_WEBHOOKS.PUBLISH_TIKTOK) {
            throw new Error('N8N webhook URL not configured. Run initializeConfig() or set VITE_N8N_PUBLISH_TIKTOK in .env');
        }

        const response = await fetch(N8N_WEBHOOKS.PUBLISH_TIKTOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoUrl: request.videoUrl,
                baseDescription: request.baseDescription,
                accountIds: request.accountIds,
                ctaType: request.ctaType,
                ctaContent: request.ctaContent,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        return { jobId: data.jobId };
    } catch (error) {
        console.error('Error starting distribution:', error);
        return null;
    }
}

/**
 * Gets distribution job status from Supabase (real data)
 */
export async function getDistributionStatus(jobId: string): Promise<DistributionStatus | null> {
    try {
        // Fetch job from video_processing_jobs
        const { data: job, error: jobError } = await supabase
            .from('video_processing_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            console.error('Error fetching job:', jobError);
            return null;
        }

        // Fetch associated video copies with account info
        const { data: copies, error: copiesError } = await supabase
            .from('video_copies')
            .select('id, account_id, status, external_post_id, error_message')
            .eq('video_id', job.video_id);

        if (copiesError) {
            console.error('Error fetching copies:', copiesError);
        }

        const results = (copies || []).map(copy => ({
            accountId: copy.account_id,
            status: copy.status === 'published' ? 'published' as const :
                   copy.status === 'failed' ? 'failed' as const : 'pending' as const,
            postUrl: copy.external_post_id || undefined,
            error: copy.error_message || undefined,
        }));

        const completedAccounts = results.filter(r => r.status === 'published').length;
        const totalAccounts = job.total_copies || results.length;
        const progress = totalAccounts > 0 ? Math.round((completedAccounts / totalAccounts) * 100) : 0;

        return {
            jobId,
            status: job.status as DistributionStatus['status'],
            progress,
            completedAccounts,
            totalAccounts,
            results
        };
    } catch (error) {
        console.error('Error getting distribution status:', error);
        return null;
    }
}

/**
 * Generates unique descriptions for a video via N8N
 */
export async function generateDescriptions(baseDescription: string, count: number): Promise<string[]> {
    try {
        if (!N8N_WEBHOOKS.GENERATE_DESCRIPTIONS) {
            throw new Error('N8N webhook URL not configured. Set VITE_N8N_GENERATE_DESCRIPTIONS in .env');
        }

        const response = await fetch(N8N_WEBHOOKS.GENERATE_DESCRIPTIONS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseDescription,
                count,
                language: 'español'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        return data.descriptions || [];
    } catch (error) {
        console.error('Error generating descriptions:', error);
        return [];
    }
}
