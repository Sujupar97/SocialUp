/**
 * ContentHub - YouTube API Publisher
 * Publishes videos as YouTube Shorts via YouTube Data API v3
 *
 * Flow:
 * 1. POST resumable upload init → get upload URL
 * 2. PUT video binary to upload URL
 * 3. Response contains video resource with ID
 *
 * For Shorts: video must be vertical (9:16), ≤ 60s. #Shorts in title/description.
 *
 * Requires: access_token with youtube.upload scope
 */

import * as fs from 'fs';

const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3/videos';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for resumable upload

export interface YouTubePublishOptions {
    videoPath: string;
    title: string;           // max 100 chars
    description: string;     // max 5000 chars
    accessToken: string;
    tags?: string[];
    privacyStatus?: 'public' | 'unlisted' | 'private';
    categoryId?: string;     // default '22' (People & Blogs)
    madeForKids?: boolean;
}

export interface YouTubePublishResult {
    success: boolean;
    videoId?: string;
    error?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure #Shorts is in the title or description for YouTube Shorts classification
 */
function ensureShortsTag(title: string, description: string): { title: string; description: string } {
    const hasShorts = title.toLowerCase().includes('#shorts') || description.toLowerCase().includes('#shorts');
    if (!hasShorts) {
        // Append to description to avoid cluttering title
        description = description.trimEnd() + '\n\n#Shorts';
    }
    return { title, description };
}

/**
 * Step 1: Initialize resumable upload and get upload URL
 */
async function initResumableUpload(
    accessToken: string,
    options: YouTubePublishOptions,
    fileSize: number
): Promise<{ uploadUrl: string } | { error: string }> {

    const { title: rawTitle, description: rawDescription } = ensureShortsTag(
        options.title.slice(0, 100),
        options.description.slice(0, 5000)
    );

    const metadata = {
        snippet: {
            title: rawTitle,
            description: rawDescription,
            tags: options.tags || [],
            categoryId: options.categoryId || '22',
        },
        status: {
            privacyStatus: options.privacyStatus || 'public',
            selfDeclaredMadeForKids: options.madeForKids || false,
        },
    };

    const response = await fetch(
        `${YOUTUBE_UPLOAD_BASE}?uploadType=resumable&part=snippet,status`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Length': fileSize.toString(),
                'X-Upload-Content-Type': 'video/*',
            },
            body: JSON.stringify(metadata),
        }
    );

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMsg = (errorBody as any)?.error?.message || `HTTP ${response.status}`;
        return { error: `Failed to init upload: ${errorMsg}` };
    }

    const uploadUrl = response.headers.get('Location');
    if (!uploadUrl) {
        return { error: 'No upload URL in response headers' };
    }

    return { uploadUrl };
}

/**
 * Step 2: Upload video file to the resumable upload URL
 * Single request for files ≤ CHUNK_SIZE, chunked for larger files
 */
async function uploadVideoFile(
    uploadUrl: string,
    videoPath: string,
    fileSize: number
): Promise<YouTubePublishResult> {

    if (fileSize <= CHUNK_SIZE) {
        // Single request upload
        const videoBuffer = fs.readFileSync(videoPath);

        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'video/*',
                'Content-Length': fileSize.toString(),
            },
            body: videoBuffer,
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            return {
                success: false,
                error: `Upload failed: ${(errorBody as any)?.error?.message || `HTTP ${response.status}`}`,
            };
        }

        const result = await response.json() as Record<string, any>;
        return { success: true, videoId: result.id };
    }

    // Chunked resumable upload for large files
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const fileHandle = fs.openSync(videoPath, 'r');

    try {
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const thisChunkSize = end - start;

            const buffer = Buffer.alloc(thisChunkSize);
            fs.readSync(fileHandle, buffer, 0, thisChunkSize, start);

            console.log(`  Uploading chunk ${i + 1}/${totalChunks} (${Math.round(thisChunkSize / 1024 / 1024)}MB)...`);

            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'video/*',
                    'Content-Length': thisChunkSize.toString(),
                    'Content-Range': `bytes ${start}-${end - 1}/${fileSize}`,
                },
                body: buffer,
            });

            // 308 Resume Incomplete = chunk received, continue
            // 200/201 = final chunk, upload complete
            if (response.status === 308) {
                continue;
            }

            if (response.ok) {
                const result = await response.json() as Record<string, any>;
                return { success: true, videoId: result.id };
            }

            const errorBody = await response.json().catch(() => ({}));
            return {
                success: false,
                error: `Chunk ${i + 1} failed: ${(errorBody as any)?.error?.message || `HTTP ${response.status}`}`,
            };
        }

        return { success: false, error: 'Upload completed but no video ID returned' };
    } finally {
        fs.closeSync(fileHandle);
    }
}

/**
 * Main publish function — orchestrates resumable upload to YouTube
 */
export async function publishToYouTubeAPI(options: YouTubePublishOptions): Promise<YouTubePublishResult> {
    const { videoPath, accessToken } = options;

    if (!fs.existsSync(videoPath)) {
        return { success: false, error: `Video not found: ${videoPath}` };
    }

    if (!accessToken) {
        return { success: false, error: 'No access token provided' };
    }

    const fileSize = fs.statSync(videoPath).size;
    console.log(`Publishing to YouTube: ${videoPath} (${Math.round(fileSize / 1024 / 1024)}MB)`);

    // Step 1: Initialize resumable upload
    console.log('  Step 1: Initializing resumable upload...');
    const initResult = await initResumableUpload(accessToken, options, fileSize);

    if ('error' in initResult) {
        return { success: false, error: initResult.error };
    }

    console.log('  Upload URL obtained.');

    // Step 2: Upload video
    console.log('  Step 2: Uploading video...');
    const uploadResult = await uploadVideoFile(initResult.uploadUrl, videoPath, fileSize);

    if (uploadResult.success) {
        console.log(`  Published as YouTube Short! Video ID: ${uploadResult.videoId}`);
    } else {
        console.log(`  Upload failed: ${uploadResult.error}`);
    }

    return uploadResult;
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.log(`
ContentHub - YouTube API Publisher
Usage: npx tsx youtube-api-publisher.ts <video_path> <title> <description> <access_token>
`);
        process.exit(1);
    }

    const [videoPath, title, description, accessToken] = args;

    publishToYouTubeAPI({ videoPath, title, description, accessToken })
        .then(result => {
            if (result.success) {
                console.log(`\nPublished! Video ID: ${result.videoId}`);
            } else {
                console.error(`\nFailed: ${result.error}`);
            }
            process.exit(result.success ? 0 : 1);
        });
}
