/**
 * ContentHub - Publisher Registry
 * Unified interface for multi-platform video publishing.
 * Each platform publisher is wrapped to conform to a common interface.
 */

import { publishToTikTokAPI, type TikTokPublishOptions } from '../tiktok-api-publisher';
import { publishToYouTubeAPI, type YouTubePublishOptions } from '../youtube-api-publisher';
import { publishToInstagramAPI, type InstagramPublishOptions } from '../instagram-api-publisher';

// Unified publish interface
export interface PublishOptions {
    accountId: string;
    accessToken: string;
    videoPath: string;
    title: string;
    description: string;
    instagramUserId?: string; // Required for Instagram publishing
}

export interface PublishResult {
    success: boolean;
    publishId?: string;  // platform-specific ID (publish_id, video_id, etc.)
    error?: string;
    isInbox?: boolean;   // TikTok-specific: sent to inbox instead of direct post
}

export type Publisher = (options: PublishOptions) => Promise<PublishResult>;

/**
 * TikTok adapter — wraps publishToTikTokAPI to unified interface
 */
async function tiktokPublisher(options: PublishOptions): Promise<PublishResult> {
    const result = await publishToTikTokAPI({
        videoPath: options.videoPath,
        description: options.description,
        accessToken: options.accessToken,
    });

    return {
        success: result.success,
        publishId: result.publishId,
        error: result.error,
        isInbox: result.isInbox,
    };
}

/**
 * YouTube adapter — wraps publishToYouTubeAPI to unified interface
 */
async function youtubePublisher(options: PublishOptions): Promise<PublishResult> {
    const result = await publishToYouTubeAPI({
        videoPath: options.videoPath,
        title: options.title,
        description: options.description,
        accessToken: options.accessToken,
    });

    return {
        success: result.success,
        publishId: result.videoId,
        error: result.error,
    };
}

/**
 * Instagram adapter — wraps publishToInstagramAPI to unified interface
 */
async function instagramPublisher(options: PublishOptions): Promise<PublishResult> {
    if (!options.instagramUserId) {
        return { success: false, error: 'Instagram user ID is required for publishing' };
    }

    const result = await publishToInstagramAPI({
        videoPath: options.videoPath,
        caption: options.description,
        accessToken: options.accessToken,
        instagramUserId: options.instagramUserId,
    });

    return {
        success: result.success,
        publishId: result.mediaId,
        error: result.error,
    };
}

// Registry of all platform publishers
const publishers: Record<string, Publisher> = {
    tiktok: tiktokPublisher,
    youtube: youtubePublisher,
    instagram: instagramPublisher,
};

/**
 * Get the publisher function for a given platform.
 * Throws if platform is not supported.
 */
export function getPublisher(platform: string): Publisher {
    const publisher = publishers[platform];
    if (!publisher) {
        throw new Error(`No publisher registered for platform: ${platform}`);
    }
    return publisher;
}

/**
 * Check if a platform has a registered publisher
 */
export function hasPublisher(platform: string): boolean {
    return platform in publishers;
}

/**
 * Get list of all supported platforms
 */
export function getSupportedPlatforms(): string[] {
    return Object.keys(publishers);
}
