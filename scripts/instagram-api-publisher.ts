/**
 * ContentHub - Instagram API Publisher
 * Publishes videos as Instagram Reels via Instagram Graph API
 *
 * Flow:
 * 1. Make video accessible via public URL (Express server)
 * 2. POST container creation with video_url
 * 3. Poll container status until FINISHED
 * 4. POST media_publish
 *
 * Requires: access_token with instagram_business_content_publish scope
 * Uses Instagram Business Login (graph.instagram.com)
 */

import * as fs from 'fs';
import * as path from 'path';
import { SERVER_CONFIG } from './config';

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max wait

export interface InstagramPublishOptions {
    videoPath: string;
    caption: string;          // max 2200 chars
    accessToken: string;
    instagramUserId: string;  // App-scoped IG user ID (from /me endpoint `id` field)
    coverUrl?: string;        // custom thumbnail
    locationId?: string;
    shareToFeed?: boolean;    // default true
}

export interface InstagramPublishResult {
    success: boolean;
    mediaId?: string;
    error?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get public URL for a video file served by the automation server.
 * The video must be in the processed/ or uploads/ directory.
 * In production (VPS), SERVER_PUBLIC_URL points to the public IP/domain.
 */
function getVideoPublicUrl(videoPath: string): string {
    const fileName = path.basename(videoPath);
    const publicUrl = process.env.SERVER_PUBLIC_URL || `http://localhost:${SERVER_CONFIG.port}`;
    return `${publicUrl}/api/ig-videos/${fileName}`;
}

/**
 * Step 1: Create a media container for the Reel
 */
async function createMediaContainer(
    instagramUserId: string,
    accessToken: string,
    videoUrl: string,
    caption: string,
    options: Pick<InstagramPublishOptions, 'coverUrl' | 'locationId' | 'shareToFeed'>
): Promise<{ containerId: string } | { error: string }> {

    const params = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption.slice(0, 2200),
        share_to_feed: String(options.shareToFeed !== false),
        access_token: accessToken,
    });

    if (options.coverUrl) params.append('cover_url', options.coverUrl);
    if (options.locationId) params.append('location_id', options.locationId);

    const response = await fetch(
        `${GRAPH_API_BASE}/${instagramUserId}/media`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        }
    );

    const data = await response.json() as Record<string, any>;
    console.log(`  Container response: ${JSON.stringify(data)}`);

    if (data.error) {
        return { error: `Container creation failed: ${data.error.message} (code: ${data.error.code})` };
    }

    if (!data.id) {
        return { error: 'No container ID in response' };
    }

    return { containerId: data.id };
}

/**
 * Step 2: Poll container status until FINISHED or ERROR
 */
async function pollContainerStatus(
    containerId: string,
    accessToken: string
): Promise<{ ready: boolean; error?: string }> {

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        const response = await fetch(
            `${GRAPH_API_BASE}/${containerId}?fields=status_code,status,id&access_token=${accessToken}`
        );
        const data = await response.json() as Record<string, any>;

        const statusCode = data.status_code;
        console.log(`  Poll ${attempt}/${MAX_POLL_ATTEMPTS}: ${statusCode}`);

        if (statusCode === 'FINISHED') {
            return { ready: true };
        }

        if (statusCode === 'ERROR') {
            return { ready: false, error: `Container processing failed: ${data.status || 'unknown error'}` };
        }

        // IN_PROGRESS — wait and retry
        await sleep(POLL_INTERVAL_MS);
    }

    return { ready: false, error: 'Container processing timed out after 5 minutes' };
}

/**
 * Step 3: Publish the container
 */
async function publishContainer(
    instagramUserId: string,
    containerId: string,
    accessToken: string
): Promise<InstagramPublishResult> {

    const response = await fetch(
        `${GRAPH_API_BASE}/${instagramUserId}/media_publish`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                creation_id: containerId,
                access_token: accessToken,
            }),
        }
    );

    const data = await response.json() as Record<string, any>;

    if (data.error) {
        return { success: false, error: `Publish failed: ${data.error.message} (code: ${data.error.code})` };
    }

    return { success: true, mediaId: data.id };
}

/**
 * Main publish function — orchestrates Instagram Reel publishing
 */
export async function publishToInstagramAPI(options: InstagramPublishOptions): Promise<InstagramPublishResult> {
    const { videoPath, caption, accessToken, instagramUserId } = options;

    if (!fs.existsSync(videoPath)) {
        return { success: false, error: `Video not found: ${videoPath}` };
    }

    if (!accessToken) {
        return { success: false, error: 'No access token provided' };
    }

    if (!instagramUserId) {
        return { success: false, error: 'No Instagram user ID provided' };
    }

    const fileSize = fs.statSync(videoPath).size;
    console.log(`Publishing to Instagram: ${videoPath} (${Math.round(fileSize / 1024 / 1024)}MB)`);

    // Get public URL for the video (served by Express server)
    const videoUrl = getVideoPublicUrl(videoPath);
    console.log(`  Video URL: ${videoUrl}`);

    // Step 1: Create container
    console.log('  Step 1: Creating media container...');
    const containerResult = await createMediaContainer(
        instagramUserId,
        accessToken,
        videoUrl,
        caption,
        { coverUrl: options.coverUrl, locationId: options.locationId, shareToFeed: options.shareToFeed }
    );

    if ('error' in containerResult) {
        return { success: false, error: containerResult.error };
    }

    console.log(`  Container ID: ${containerResult.containerId}`);

    // Step 2: Poll until ready
    console.log('  Step 2: Waiting for video processing...');
    const pollResult = await pollContainerStatus(containerResult.containerId, accessToken);

    if (!pollResult.ready) {
        return { success: false, error: pollResult.error || 'Processing failed' };
    }

    // Step 3: Publish
    console.log('  Step 3: Publishing Reel...');
    const publishResult = await publishContainer(
        instagramUserId,
        containerResult.containerId,
        accessToken
    );

    if (publishResult.success) {
        console.log(`  Published as Instagram Reel! Media ID: ${publishResult.mediaId}`);
    } else {
        console.log(`  Publish failed: ${publishResult.error}`);
    }

    return publishResult;
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.log(`
ContentHub - Instagram API Publisher
Usage: npx tsx instagram-api-publisher.ts <video_path> <caption> <access_token> <ig_user_id>
`);
        process.exit(1);
    }

    const [videoPath, caption, accessToken, instagramUserId] = args;

    publishToInstagramAPI({ videoPath, caption, accessToken, instagramUserId })
        .then(result => {
            if (result.success) {
                console.log(`\nPublished! Media ID: ${result.mediaId}`);
            } else {
                console.error(`\nFailed: ${result.error}`);
            }
            process.exit(result.success ? 0 : 1);
        });
}
