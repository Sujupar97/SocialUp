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
 * 6. Publish via platform-specific API (TikTok, YouTube, etc.)
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
import { getPublisher } from './publishers';
import { WarmupAgent } from './warmup-agent';
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

// Serve processed videos for Instagram publishing (Instagram downloads from this URL)
app.use('/api/ig-videos', express.static(path.join(__dirname, 'processed')));
app.use('/api/ig-videos', express.static(path.join(__dirname, 'uploads')));

/**
 * Load active accounts from Supabase with valid access tokens.
 * Optionally filter by platform(s). If no platforms specified, loads all.
 */
async function loadActiveAccounts(platforms?: string[]) {
    let query = supabase
        .from('accounts')
        .select('id, username, access_token, refresh_token, expires_at, platform, proxy_url, channel_id, instagram_user_id')
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .order('created_at', { ascending: true });

    if (platforms && platforms.length === 1) {
        query = query.eq('platform', platforms[0]);
    } else if (platforms && platforms.length > 1) {
        query = query.in('platform', platforms);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error loading accounts:', error.message);
        return [];
    }

    return data || [];
}

// Map platform → Edge Function name for token refresh
const REFRESH_FUNCTIONS: Record<string, string> = {
    tiktok: 'tiktok-refresh',
    youtube: 'youtube-refresh',
    instagram: 'instagram-refresh',
};

/**
 * Refresh token for an account if expired or expiring within 10 minutes.
 * Automatically calls the correct Edge Function based on platform.
 */
async function refreshTokenIfNeeded(account: { id: string; username: string; access_token: string; expires_at: string | null; platform: string }): Promise<string> {
    let accessToken = account.access_token;

    if (account.expires_at) {
        const expiresAt = new Date(account.expires_at);
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

        if (expiresAt <= tenMinutesFromNow) {
            const refreshFn = REFRESH_FUNCTIONS[account.platform];
            if (!refreshFn) {
                console.warn(`  No refresh function for platform ${account.platform}, skipping refresh`);
                return accessToken;
            }

            console.log(`  Token for @${account.username} (${account.platform}) expired/expiring, refreshing...`);
            const { data: refreshData, error: refreshError } = await supabase.functions.invoke(refreshFn, {
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

        const { description, ctaType, ctaContent, platforms } = req.body;
        const videoPath = req.file.path;

        // Parse platforms filter (default: all platforms)
        // Frontend sends JSON string via FormData, so parse if needed
        let platformFilter: string[] | undefined;
        if (platforms) {
            try {
                const parsed = typeof platforms === 'string' ? JSON.parse(platforms) : platforms;
                platformFilter = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                platformFilter = [platforms];
            }
        }

        console.log(`[distribute] Raw platforms value: ${JSON.stringify(platforms)} (type: ${typeof platforms})`);
        console.log(`[distribute] Parsed platformFilter: ${JSON.stringify(platformFilter)}`);

        // Load real accounts from Supabase
        const accounts = await loadActiveAccounts(platformFilter);
        console.log(`[distribute] Loaded ${accounts.length} accounts:`, accounts.map(a => `${a.username} (${a.platform})`));
        if (accounts.length === 0) {
            return res.status(400).json({
                error: 'No hay cuentas activas con tokens. Conecta al menos 1 cuenta via OAuth.'
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
 * GET /api/accounts/:platform — filter by platform
 */
app.get('/api/accounts', async (req, res) => {
    const accounts = await loadActiveAccounts();
    res.json({
        total: accounts.length,
        platform: 'all',
        accounts: accounts.map(a => ({
            id: a.id,
            username: a.username,
            platform: a.platform,
            hasToken: !!a.access_token,
            tokenExpired: a.expires_at ? new Date(a.expires_at) < new Date() : true,
        }))
    });
});

app.get('/api/accounts/:platform', async (req, res) => {
    const platform = req.params.platform;
    const accounts = await loadActiveAccounts([platform]);
    res.json({
        total: accounts.length,
        platform,
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
 * POST /api/warmup/start/:accountId
 * Trigger a manual warmup session for a specific account
 */
app.post('/api/warmup/start/:accountId', async (req, res) => {
    const accountId = req.params.accountId;

    const { data: account, error } = await supabase
        .from('accounts')
        .select('id, platform, username, proxy_url, proxy_username, proxy_password')
        .eq('id', accountId)
        .single();

    if (error || !account) {
        return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    res.json({ success: true, message: `Warmup iniciado para @${account.username}` });

    // Run in background
    const agent = new WarmupAgent({
        accountId: account.id,
        platform: account.platform as 'tiktok' | 'instagram' | 'youtube',
        username: account.username,
        proxyUrl: account.proxy_url || undefined,
        proxyUsername: account.proxy_username || undefined,
        proxyPassword: account.proxy_password || undefined,
        minDurationSec: 300,
        maxDurationSec: 900,
        headless: true,
    });

    agent.runSession().then(result => {
        console.log(`[Warmup] @${account.username}: ${result.success ? 'OK' : 'Failed'} — ${result.actionsPerformed} actions in ${result.durationSec}s`);
    });
});

/**
 * GET /api/warmup/status
 * Get today's warmup stats for all accounts
 */
app.get('/api/warmup/status', async (_req, res) => {
    const { data, error } = await supabase
        .from('warmup_daily_stats')
        .select('*');

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ accounts: data || [] });
});

/**
 * GET /api/warmup/sessions/:accountId
 * Get warmup session history for a specific account
 */
app.get('/api/warmup/sessions/:accountId', async (req, res) => {
    const accountId = req.params.accountId;

    const { data, error } = await supabase
        .from('warmup_sessions')
        .select('id, platform, status, started_at, ended_at, session_duration_sec, actions_count, actions_summary, error_message')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ sessions: data || [] });
});

/**
 * GET /api/warmup/verification-status
 * Get accounts that need verification attention
 */
app.get('/api/warmup/verification-status', async (_req, res) => {
    const { data, error } = await supabase
        .from('accounts')
        .select('id, username, platform, verification_status, email_address, updated_at')
        .neq('verification_status', 'ok')
        .eq('is_active', true);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ accounts: data || [] });
});

/**
 * POST /api/warmup/manual-verify/:accountId
 * Manually mark an account as verified (after manual intervention)
 */
app.post('/api/warmup/manual-verify/:accountId', async (req, res) => {
    const accountId = req.params.accountId;

    const { error } = await supabase
        .from('accounts')
        .update({ verification_status: 'ok' })
        .eq('id', accountId);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, message: `Account ${accountId} marked as verified` });
});

/**
 * GET /api/email/recent/:accountId
 * Get recent email verifications for an account
 */
app.get('/api/email/recent/:accountId', async (req, res) => {
    const accountId = req.params.accountId;

    // Get account's email
    const { data: account } = await supabase
        .from('accounts')
        .select('email_address')
        .eq('id', accountId)
        .single();

    if (!account?.email_address) {
        return res.json({ emails: [], message: 'No email configured for this account' });
    }

    const { data, error } = await supabase
        .from('email_verifications')
        .select('*')
        .eq('email_address', account.email_address)
        .order('received_at', { ascending: false })
        .limit(10);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ emails: data || [] });
});

/**
 * GET /api/creation/jobs
 * Get account creation jobs with optional status filter
 */
app.get('/api/creation/jobs', async (req, res) => {
    const status = req.query.status as string | undefined;
    const platform = req.query.platform as string | undefined;

    let query = supabase
        .from('account_creation_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);

    const { data, error } = await query;

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ jobs: data || [] });
});

/**
 * GET /api/creation/stats
 * Get account creation statistics
 */
app.get('/api/creation/stats', async (_req, res) => {
    const { data: accounts } = await supabase
        .from('accounts')
        .select('platform, is_active, verification_status, creation_method')
        .eq('is_active', true);

    const stats: Record<string, { total: number; ok: number; issues: number; automated: number }> = {
        tiktok: { total: 0, ok: 0, issues: 0, automated: 0 },
        instagram: { total: 0, ok: 0, issues: 0, automated: 0 },
        youtube: { total: 0, ok: 0, issues: 0, automated: 0 },
    };

    for (const acc of accounts || []) {
        const platform = acc.platform as string;
        if (stats[platform]) {
            stats[platform].total++;
            if (acc.verification_status === 'ok' || !acc.verification_status) stats[platform].ok++;
            else stats[platform].issues++;
            if (acc.creation_method === 'automated') stats[platform].automated++;
        }
    }

    res.json({ stats });
});

/**
 * POST /api/creation/create
 * Start automated account creation
 * Body: { platform, count?, prefix? }
 */
app.post('/api/creation/create', async (req, res) => {
    try {
        const { platform, count = 1, prefix = 'socialup' } = req.body;

        if (!['tiktok', 'instagram', 'youtube'].includes(platform)) {
            return res.status(400).json({ error: 'Invalid platform. Use: tiktok, instagram, youtube' });
        }

        if (count < 1 || count > 50) {
            return res.status(400).json({ error: 'Count must be between 1 and 50' });
        }

        // Get email domain
        const { data: settings } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'email_domain')
            .single();

        const emailDomain = settings?.value;
        if (!emailDomain) {
            return res.status(400).json({ error: 'email_domain not configured in app_settings' });
        }

        const password = `SUp${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;

        // Start creation in background
        const jobGroupId = crypto.randomUUID();
        res.json({
            message: `Starting creation of ${count} ${platform} account(s)`,
            jobGroupId,
            platform,
            count,
        });

        // Import and run account creator in background
        const { createAccount } = await import('./account-creator');

        for (let i = 0; i < count; i++) {
            console.log(`\n[Creation] Creating ${platform} account ${i + 1}/${count}...`);
            const result = await createAccount({
                platform: platform as 'tiktok' | 'instagram' | 'youtube',
                emailDomain,
                count,
                startIndex: i + 1,
                usernamePrefix: prefix,
                password,
                maxConcurrent: 1,
                headless: true,
            }, 0);

            if (result.success) {
                console.log(`[Creation] ✅ ${result.username} (${result.email})`);
            } else {
                console.log(`[Creation] ❌ ${result.email}: ${result.error}`);
            }

            // Delay between accounts (60-120s)
            if (i < count - 1) {
                const delay = 60000 + Math.random() * 60000;
                console.log(`[Creation] Waiting ${Math.round(delay / 1000)}s before next...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    } catch (err: any) {
        console.error('[Creation] Error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
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

                // Use publisher registry to dispatch to correct platform
                const publisher = getPublisher(account.platform);
                const publishResult = await publisher({
                    accountId: account.id,
                    accessToken,
                    videoPath: uniqueVideoPath,
                    title: uniqueDescription.slice(0, 100), // YouTube needs title
                    description: uniqueDescription,
                    instagramUserId: account.instagram_user_id || undefined,
                });

                if (publishResult.success) {
                    await supabase.from('video_copies').update({
                        status: 'published',
                        external_post_id: publishResult.publishId || null,
                        published_at: new Date().toISOString(),
                    }).eq('id', copyId);

                    completedCount++;
                    console.log(`  @${account.username} [${account.platform}]: Published (${publishResult.publishId})`);

                    // Save first comment if CTA configured
                    if (ctaType === 'first_comment' && ctaContent) {
                        await saveFirstComment(copyId, ctaContent);
                    }
                } else {
                    await supabase.from('video_copies').update({
                        status: 'failed',
                        error_message: publishResult.error || 'Unknown error',
                    }).eq('id', copyId);

                    console.log(`  @${account.username} [${account.platform}]: Failed - ${publishResult.error}`);
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
  POST /api/distribute          - Start video distribution (accepts platforms[] filter)
  GET  /api/status/:id          - Check job status
  GET  /api/accounts            - List all active accounts
  GET  /api/accounts/:platform  - List accounts by platform (tiktok/youtube/instagram)
  POST /api/warmup/start/:id    - Trigger warmup session
  GET  /api/warmup/status               - Today's warmup stats
  GET  /api/warmup/sessions/:id         - Session history
  GET  /api/warmup/verification-status  - Accounts needing verification
  POST /api/warmup/manual-verify/:id    - Mark account as verified
  GET  /api/email/recent/:accountId     - Recent email verifications
  GET  /api/creation/jobs               - Account creation job history
  GET  /api/creation/stats              - Account creation statistics
  GET  /health                          - Health check

Supported platforms: TikTok, YouTube, Instagram

Config: N8N base = ${SERVER_CONFIG.n8nWebhookBase || '(not set)'}
Accounts loaded from Supabase (real data only).
    `);
    });
});

export default app;
