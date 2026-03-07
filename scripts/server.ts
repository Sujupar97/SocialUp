/**
 * ContentHub - Automation Server
 * Express server that orchestrates video distribution
 *
 * Pipeline:
 * 1. Receive video from frontend
 * 2. Create video + job records in Supabase
 * 3. Duplicate with FFmpeg (unique copies)
 * 4. Generate descriptions with Gemini AI
 * 5. Create video_copies records in Supabase
 * 6. Publish via TikTok Content Posting API v2
 * 7. Post first comment if configured (CTA)
 * 8. Update status in DB throughout
 */

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { duplicateVideo } from './video-processor';
import { generateDescriptions } from './description-generator';
import { publishToTikTokAPI } from './tiktok-api-publisher';
import { PATHS, SUPABASE_CONFIG, SERVER_CONFIG, loadConfig } from './config';
import 'dotenv/config';

const app = express();
const PORT = SERVER_CONFIG.port;

// Supabase client
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Multer config for video uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path.join(__dirname, PATHS.uploads);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de video'));
        }
    },
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

app.use(cors());
app.use(express.json());

/**
 * Load active TikTok accounts from Supabase with valid access tokens
 */
async function loadActiveAccounts() {
    const { data, error } = await supabase
        .from('accounts')
        .select('id, username, access_token, refresh_token, expires_at, platform, proxy_url')
        .eq('is_active', true)
        .eq('platform', 'tiktok')
        .not('access_token', 'is', null)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error loading accounts:', error.message);
        return [];
    }

    return data || [];
}

/**
 * Refresh token for an account if expired or expiring within 10 minutes
 */
async function refreshTokenIfNeeded(account: { id: string; username: string; access_token: string; expires_at: string | null }): Promise<string> {
    let accessToken = account.access_token;

    if (account.expires_at) {
        const expiresAt = new Date(account.expires_at);
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

        if (expiresAt <= tenMinutesFromNow) {
            console.log(`  Token for @${account.username} expired/expiring, refreshing...`);
            const { data: refreshData, error: refreshError } = await supabase.functions.invoke('tiktok-refresh', {
                body: { account_id: account.id }
            });

            if (refreshError) {
                throw new Error(`Token refresh failed: ${refreshError.message}`);
            }

            accessToken = refreshData?.access_token || accessToken;
            console.log(`  Token refreshed for @${account.username}`);
        }
    }

    return accessToken;
}

/**
 * Save first comment intent to DB.
 * TikTok Content Posting API doesn't support comment posting directly,
 * so we store it for future implementation (browser automation or API update).
 */
async function saveFirstComment(videoCopyId: string, commentText: string): Promise<void> {
    await supabase.from('auto_comments').insert({
        video_copy_id: videoCopyId,
        comment_text: commentText,
    });
    console.log(`  First comment saved for video_copy ${videoCopyId}`);
}

/**
 * POST /api/distribute
 * Main endpoint to start video distribution
 */
app.post('/api/distribute', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se recibio ningun video' });
        }

        const { description, ctaType, ctaContent } = req.body;
        const videoPath = req.file.path;

        // Load real accounts from Supabase
        const accounts = await loadActiveAccounts();
        if (accounts.length === 0) {
            return res.status(400).json({
                error: 'No hay cuentas activas con tokens. Conecta al menos 1 cuenta TikTok via OAuth.'
            });
        }

        // 1. Create video record in DB
        const { data: videoRecord, error: videoError } = await supabase
            .from('videos')
            .insert({
                original_filename: req.file.originalname,
                storage_path: videoPath,
                description_template: description || '',
                call_to_action_type: ctaType || null,
                call_to_action_text: ctaType === 'first_comment' ? ctaContent : null,
                keyword_trigger: ctaType === 'keyword_response' ? ctaContent : null,
            })
            .select('id')
            .single();

        if (videoError || !videoRecord) {
            throw new Error(`Error creating video record: ${videoError?.message}`);
        }

        const videoId = videoRecord.id;

        // 2. Create processing job in DB
        const { data: jobRecord, error: jobError } = await supabase
            .from('video_processing_jobs')
            .insert({
                video_id: videoId,
                status: 'pending',
                total_copies: accounts.length,
                completed_copies: 0,
                started_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (jobError || !jobRecord) {
            throw new Error(`Error creating job record: ${jobError?.message}`);
        }

        const jobId = jobRecord.id;

        // Respond immediately
        res.json({
            success: true,
            jobId,
            videoId,
            accountCount: accounts.length,
            message: 'Distribucion iniciada en segundo plano.'
        });

        // Process in background
        processDistribution(jobId, videoId, videoPath, description || '', ctaType, ctaContent, accounts);

    } catch (error: any) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/status/:jobId
 * Get job status from Supabase (persistent)
 */
app.get('/api/status/:jobId', async (req, res) => {
    const jobId = req.params.jobId;

    const { data: job, error: jobError } = await supabase
        .from('video_processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (jobError || !job) {
        return res.status(404).json({ error: 'Job no encontrado' });
    }

    // Fetch video copies with account usernames
    const { data: copies } = await supabase
        .from('video_copies')
        .select('account_id, status, external_post_id, error_message')
        .eq('video_id', job.video_id);

    // Fetch account usernames separately (simpler than join)
    const accountIds = [...new Set((copies || []).map(c => c.account_id))];
    const { data: accountsData } = await supabase
        .from('accounts')
        .select('id, username')
        .in('id', accountIds);

    const accountMap = new Map((accountsData || []).map(a => [a.id, a.username]));

    const results = (copies || []).map(copy => ({
        account: accountMap.get(copy.account_id) || copy.account_id,
        success: copy.status === 'published',
        postUrl: copy.external_post_id || undefined,
        error: copy.error_message || undefined,
    }));

    const processed = (copies || []).filter(c => c.status === 'published' || c.status === 'failed').length;
    const successCount = results.filter(r => r.success).length;
    const totalCopies = job.total_copies || 0;
    const progress = totalCopies > 0 ? Math.round((processed / totalCopies) * 100) : 0;

    let message = '';
    if (job.status === 'completed') {
        message = `Completado: ${successCount}/${totalCopies} publicaciones exitosas`;
    } else if (job.status === 'failed') {
        message = job.error_message || 'Error en la distribucion';
    } else if (job.status === 'processing') {
        message = `Publicando: ${processed}/${totalCopies} procesadas...`;
    } else {
        message = `Iniciando distribucion a ${totalCopies} cuentas...`;
    }

    res.json({
        id: jobId,
        status: job.status,
        progress,
        message,
        results,
        createdAt: job.created_at,
    });
});

/**
 * GET /api/accounts
 */
app.get('/api/accounts', async (_req, res) => {
    const accounts = await loadActiveAccounts();
    res.json({
        total: accounts.length,
        accounts: accounts.map(a => ({
            id: a.id,
            username: a.username,
            platform: a.platform,
            hasToken: !!a.access_token,
            tokenExpired: a.expires_at ? new Date(a.expires_at) < new Date() : true,
        }))
    });
});

/**
 * GET /health
 */
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ContentHub Automation Server', timestamp: new Date().toISOString() });
});

/**
 * Background distribution processing — persists everything to Supabase
 */
async function processDistribution(
    jobId: string,
    videoId: string,
    videoPath: string,
    description: string,
    ctaType: string | undefined,
    ctaContent: string | undefined,
    accounts: Awaited<ReturnType<typeof loadActiveAccounts>>
) {
    try {
        await supabase.from('video_processing_jobs').update({ status: 'processing' }).eq('id', jobId);

        // Step 1: Duplicate video
        console.log(`\n[${jobId}] Duplicando video para ${accounts.length} cuentas...`);
        const duplicateResult = await duplicateVideo({
            inputPath: videoPath,
            outputDir: path.join(__dirname, PATHS.processed),
            copies: accounts.length
        });

        if (!duplicateResult.success) {
            throw new Error(`Error duplicando: ${duplicateResult.error}`);
        }

        // Step 2: Generate unique descriptions
        console.log(`[${jobId}] Generando ${accounts.length} descripciones con IA...`);
        const descriptionsResult = await generateDescriptions({
            baseDescription: description,
            copies: accounts.length,
            language: 'espanol'
        });

        if (!descriptionsResult.success) {
            throw new Error(`Error generando descripciones: ${descriptionsResult.error}`);
        }

        // Step 3: Create video_copies records
        const copyInserts = accounts.map((account, i) => ({
            video_id: videoId,
            account_id: account.id,
            copy_filename: path.basename(duplicateResult.outputPaths[i]),
            storage_path: duplicateResult.outputPaths[i],
            generated_description: descriptionsResult.descriptions[i] || description,
            status: 'pending' as const,
        }));

        const { data: copiesData, error: copiesError } = await supabase
            .from('video_copies')
            .insert(copyInserts)
            .select('id, account_id');

        if (copiesError) {
            throw new Error(`Error creating video copies: ${copiesError.message}`);
        }

        const copyRecords = copiesData || [];
        console.log(`[${jobId}] ${copyRecords.length} video_copies creados en DB.`);

        // Step 4: Publish to each account
        let completedCount = 0;

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const copyRecord = copyRecords.find(c => c.account_id === account.id);
            const copyId = copyRecord?.id;
            const uniqueVideoPath = duplicateResult.outputPaths[i];
            const uniqueDescription = descriptionsResult.descriptions[i] || description;

            if (!copyId) {
                console.error(`  No copy record for @${account.username}, skipping.`);
                continue;
            }

            await supabase.from('video_copies').update({ status: 'publishing' }).eq('id', copyId);

            console.log(`[${jobId}] Publicando en @${account.username} (${i + 1}/${accounts.length})...`);

            try {
                const accessToken = await refreshTokenIfNeeded(account);

                const publishResult = await publishToTikTokAPI({
                    videoPath: uniqueVideoPath,
                    description: uniqueDescription,
                    accessToken,
                });

                if (publishResult.success) {
                    await supabase.from('video_copies').update({
                        status: 'published',
                        external_post_id: publishResult.publishId || null,
                        published_at: new Date().toISOString(),
                    }).eq('id', copyId);

                    completedCount++;
                    console.log(`  @${account.username}: Published (${publishResult.publishId})`);

                    // Save first comment if CTA configured
                    if (ctaType === 'first_comment' && ctaContent) {
                        await saveFirstComment(copyId, ctaContent);
                    }
                } else {
                    await supabase.from('video_copies').update({
                        status: 'failed',
                        error_message: publishResult.error || 'Unknown error',
                    }).eq('id', copyId);

                    console.log(`  @${account.username}: Failed - ${publishResult.error}`);
                }
            } catch (err: any) {
                await supabase.from('video_copies').update({
                    status: 'failed',
                    error_message: err.message,
                }).eq('id', copyId);
                console.log(`  @${account.username}: Error - ${err.message}`);
            }

            // Update job progress
            await supabase.from('video_processing_jobs').update({
                completed_copies: i + 1,
            }).eq('id', jobId);

            // Delay between publishes (30-60s randomized)
            if (i < accounts.length - 1) {
                const delay = Math.floor(Math.random() * 30000) + 30000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Finalize job
        await supabase.from('video_processing_jobs').update({
            status: 'completed',
            completed_copies: accounts.length,
            completed_at: new Date().toISOString(),
        }).eq('id', jobId);

        console.log(`[${jobId}] Distribucion completada: ${completedCount}/${accounts.length}`);

        // Cleanup processed files
        for (const p of duplicateResult.outputPaths) {
            try { fs.unlinkSync(p); } catch { /* ignore */ }
        }

    } catch (error: any) {
        console.error(`[${jobId}] Error:`, error.message);
        await supabase.from('video_processing_jobs').update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString(),
        }).eq('id', jobId);
    }
}

// Start server — load config from Supabase first
loadConfig().then(() => {
    app.listen(PORT, () => {
        console.log(`
ContentHub Automation Server running on port ${PORT}

Endpoints:
  POST /api/distribute  - Start video distribution
  GET  /api/status/:id  - Check job status
  GET  /api/accounts    - List active accounts
  GET  /health          - Health check

Config: N8N base = ${SERVER_CONFIG.n8nWebhookBase || '(not set)'}
Accounts loaded from Supabase (real data only).
    `);
    });
});

export default app;
