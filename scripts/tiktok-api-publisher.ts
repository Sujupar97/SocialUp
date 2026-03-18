/**
 * ContentHub - TikTok API Publisher
 * Publishes videos via TikTok's official Content Posting API v2
 *
 * Flow:
 * 1. POST /v2/post/publish/video/init/ → get upload_url + publish_id
 * 2. PUT upload_url with video binary (chunked for large files)
 * 3. Poll GET /v2/post/publish/status/fetch/ until published
 *
 * Requires: access_token with video.publish + video.upload scopes
 */

import * as fs from 'fs';
import { TIKTOK_CONFIG } from './config';

const TIKTOK_API_BASE = TIKTOK_CONFIG.apiBaseUrl || 'https://open.tiktokapis.com';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for large files
const MAX_STATUS_POLLS = 30;
const STATUS_POLL_INTERVAL_MS = 5000; // 5 seconds

export interface TikTokPublishOptions {
    videoPath: string;
    description: string;
    accessToken: string;
    privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
    videoCoverTimestampMs?: number;
}

export interface TikTokPublishResult {
    success: boolean;
    publishId?: string;
    error?: string;
    errorCode?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Query creator info to get available privacy levels and constraints
 */
async function queryCreatorInfo(accessToken: string): Promise<{
    privacyLevelOptions: string[];
    commentDisabled: boolean;
    duetDisabled: boolean;
    stitchDisabled: boolean;
    maxVideoPostDurationSec: number;
}> {
    const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
    });

    const data = await response.json() as Record<string, any>;
    console.log('  Creator info response:', JSON.stringify(data, null, 2));

    if (data.error?.code && data.error.code !== 'ok') {
        console.warn(`  Creator info error: ${data.error.message || data.error.code}`);
    }

    return {
        privacyLevelOptions: data.data?.privacy_level_options || ['SELF_ONLY'],
        commentDisabled: data.data?.comment_disabled ?? false,
        duetDisabled: data.data?.duet_disabled ?? false,
        stitchDisabled: data.data?.stitch_disabled ?? false,
        maxVideoPostDurationSec: data.data?.max_video_post_duration_sec || 60,
    };
}

/**
 * Step 1: Initialize video upload and get upload URL
 */
async function initializeDirectPost(
    accessToken: string,
    fileSize: number,
    description: string,
    options: TikTokPublishOptions
): Promise<{ publishId: string; uploadUrl: string } | { error: string; errorCode?: string }> {

    const isChunked = fileSize > CHUNK_SIZE;

    const postInfo: Record<string, unknown> = {
        title: description.slice(0, 2200),
        privacy_level: options.privacyLevel || 'PUBLIC_TO_EVERYONE',
        disable_comment: options.disableComment || false,
        disable_duet: options.disableDuet || false,
        disable_stitch: options.disableStitch || false,
    };

    if (options.videoCoverTimestampMs !== undefined) {
        postInfo.video_cover_timestamp_ms = options.videoCoverTimestampMs;
    }

    const totalChunkCount = isChunked ? Math.ceil(fileSize / CHUNK_SIZE) : 1;
    const chunkSize = isChunked ? CHUNK_SIZE : fileSize;

    const sourceInfo: Record<string, unknown> = {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
    };

    const body = {
        post_info: postInfo,
        source_info: sourceInfo,
    };

    console.log('  Request body:', JSON.stringify(body, null, 2));

    const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, any>;

    console.log('  Response status:', response.status);
    console.log('  Response body:', JSON.stringify(data, null, 2));

    if (data.error?.code !== 'ok' && data.error?.code) {
        return {
            error: data.error.message || `TikTok API error: ${data.error.code}`,
            errorCode: data.error.code,
        };
    }

    const publishId = data.data?.publish_id;
    const uploadUrl = data.data?.upload_url;

    if (!publishId || !uploadUrl) {
        return { error: 'Missing publish_id or upload_url in TikTok response' };
    }

    return { publishId, uploadUrl };
}

/**
 * Step 2: Upload video file to TikTok's upload URL
 * Supports both single-request and chunked upload
 */
async function uploadVideoFile(uploadUrl: string, videoPath: string, fileSize: number): Promise<{ error?: string }> {
    const isChunked = fileSize > CHUNK_SIZE;

    if (!isChunked) {
        // Single upload for files <= CHUNK_SIZE
        const videoBuffer = fs.readFileSync(videoPath);

        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': fileSize.toString(),
                'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
            },
            body: videoBuffer,
        });

        if (!response.ok && response.status !== 201) {
            return { error: `Upload failed with status ${response.status}` };
        }

        return {};
    }

    // Chunked upload for large files
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const fileHandle = fs.openSync(videoPath, 'r');

    try {
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const chunkSize = end - start;

            const buffer = Buffer.alloc(chunkSize);
            fs.readSync(fileHandle, buffer, 0, chunkSize, start);

            console.log(`  Uploading chunk ${i + 1}/${totalChunks} (${Math.round(chunkSize / 1024 / 1024)}MB)...`);

            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'video/mp4',
                    'Content-Length': chunkSize.toString(),
                    'Content-Range': `bytes ${start}-${end - 1}/${fileSize}`,
                },
                body: buffer,
            });

            if (!response.ok && response.status !== 201 && response.status !== 206) {
                return { error: `Chunk ${i + 1} upload failed with status ${response.status}` };
            }
        }
    } finally {
        fs.closeSync(fileHandle);
    }

    return {};
}

/**
 * Step 3: Poll publish status until completion or failure
 */
async function pollPublishStatus(
    accessToken: string,
    publishId: string
): Promise<{ status: string; error?: string }> {

    for (let attempt = 0; attempt < MAX_STATUS_POLLS; attempt++) {
        await sleep(STATUS_POLL_INTERVAL_MS);

        const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify({ publish_id: publishId }),
        });

        const data = await response.json() as Record<string, any>;

        if (data.error?.code && data.error.code !== 'ok') {
            return { status: 'FAILED', error: data.error.message || data.error.code };
        }

        const status = data.data?.status;

        if (status === 'PUBLISH_COMPLETE') {
            return { status: 'PUBLISH_COMPLETE' };
        }

        if (status === 'FAILED') {
            const failReason = data.data?.fail_reason || 'Unknown failure';
            return { status: 'FAILED', error: failReason };
        }

        // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SENDING_TO_USER_INBOX — keep polling
        console.log(`  Status: ${status} (attempt ${attempt + 1}/${MAX_STATUS_POLLS})`);
    }

    return { status: 'TIMEOUT', error: `Status polling timed out after ${MAX_STATUS_POLLS} attempts` };
}

/**
 * Main publish function — orchestrates the full flow
 */
export async function publishToTikTokAPI(options: TikTokPublishOptions): Promise<TikTokPublishResult> {
    const { videoPath, description, accessToken } = options;

    // Validate video file exists
    if (!fs.existsSync(videoPath)) {
        return { success: false, error: `Video not found: ${videoPath}` };
    }

    if (!accessToken) {
        return { success: false, error: 'No access token provided' };
    }

    const fileSize = fs.statSync(videoPath).size;
    console.log(`Publishing via TikTok API: ${videoPath} (${Math.round(fileSize / 1024 / 1024)}MB, ${fileSize} bytes)`);

    // Step 0: Query creator info for available privacy levels
    console.log('  Step 0: Querying creator info...');
    const creatorInfo = await queryCreatorInfo(accessToken);
    console.log(`  Available privacy levels: ${creatorInfo.privacyLevelOptions.join(', ')}`);

    // Use the requested privacy level if available, otherwise fall back to first available
    const requestedPrivacy = options.privacyLevel || 'PUBLIC_TO_EVERYONE';
    const effectivePrivacy = creatorInfo.privacyLevelOptions.includes(requestedPrivacy)
        ? requestedPrivacy
        : creatorInfo.privacyLevelOptions[0] || 'SELF_ONLY';

    if (effectivePrivacy !== requestedPrivacy) {
        console.log(`  Privacy level adjusted: ${requestedPrivacy} → ${effectivePrivacy}`);
    }

    // Override options with creator info constraints
    const adjustedOptions: TikTokPublishOptions = {
        ...options,
        privacyLevel: effectivePrivacy as TikTokPublishOptions['privacyLevel'],
        disableComment: creatorInfo.commentDisabled || options.disableComment || false,
        disableDuet: creatorInfo.duetDisabled || options.disableDuet || false,
        disableStitch: creatorInfo.stitchDisabled || options.disableStitch || false,
    };

    // Step 1: Initialize
    console.log('  Step 1: Initializing direct post...');
    const initResult = await initializeDirectPost(accessToken, fileSize, description, adjustedOptions);

    if ('error' in initResult) {
        return { success: false, error: initResult.error, errorCode: initResult.errorCode };
    }

    const { publishId, uploadUrl } = initResult;
    console.log(`  Publish ID: ${publishId}`);

    // Step 2: Upload video
    console.log('  Step 2: Uploading video...');
    const uploadResult = await uploadVideoFile(uploadUrl, videoPath, fileSize);

    if (uploadResult.error) {
        return { success: false, publishId, error: uploadResult.error };
    }

    console.log('  Upload complete.');

    // Step 3: Poll for status
    console.log('  Step 3: Waiting for processing...');
    const statusResult = await pollPublishStatus(accessToken, publishId);

    if (statusResult.status === 'PUBLISH_COMPLETE') {
        console.log('  Published successfully!');
        return { success: true, publishId };
    }

    return {
        success: false,
        publishId,
        error: statusResult.error || `Unexpected status: ${statusResult.status}`,
    };
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
ContentHub - TikTok API Publisher
Usage: npx ts-node tiktok-api-publisher.ts <video_path> <description> <access_token>
`);
        process.exit(1);
    }

    const [videoPath, description, accessToken] = args;

    publishToTikTokAPI({ videoPath, description, accessToken })
        .then(result => {
            if (result.success) {
                console.log(`\nPublished! Publish ID: ${result.publishId}`);
            } else {
                console.error(`\nFailed: ${result.error}`);
            }
            process.exit(result.success ? 0 : 1);
        });
}
