/**
 * ContentHub - Automation Service
 * Servicio que conecta el frontend con los scripts de automatización
 */

// URLs de webhooks (se configuran en .env)
const N8N_WEBHOOKS = {
    PROCESS_VIDEO: import.meta.env.VITE_N8N_PROCESS_VIDEO || 'http://localhost:5679/webhook/contenthub-process-video',
    PUBLISH_TIKTOK: import.meta.env.VITE_N8N_PUBLISH_TIKTOK || 'http://localhost:5679/webhook/contenthub-publish-tiktok',
    GENERATE_DESCRIPTIONS: import.meta.env.VITE_N8N_GENERATE_DESCRIPTIONS || 'http://localhost:5679/webhook/contenthub-generate-descriptions',
};

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
 * Inicia el proceso de distribución de un video
 */
export async function startDistribution(request: DistributionRequest): Promise<{ jobId: string } | null> {
    try {
        const response = await fetch(N8N_WEBHOOKS.PROCESS_VIDEO, {
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
 * Obtiene el estado de un job de distribución
 */
export async function getDistributionStatus(jobId: string): Promise<DistributionStatus | null> {
    try {
        // En producción, esto consultaría Supabase directamente
        // Por ahora, retornamos un mock
        return {
            jobId,
            status: 'processing',
            progress: 50,
            completedAccounts: 1,
            totalAccounts: 2,
            results: []
        };
    } catch (error) {
        console.error('Error getting status:', error);
        return null;
    }
}

/**
 * Genera descripciones únicas para un video
 */
export async function generateDescriptions(baseDescription: string, count: number): Promise<string[]> {
    try {
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
