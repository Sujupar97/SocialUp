/**
 * Quick test: Publish a video to YouTube Shorts using the connected account's token.
 *
 * Usage:
 *   npx tsx scripts/test-youtube-publish.ts <path-to-video.mp4>
 *
 * The script reads the YouTube account's access_token from Supabase,
 * refreshes it if needed, and uploads the video as a Short.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { publishToYouTubeAPI } from './youtube-api-publisher';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function main() {
    const videoPath = process.argv[2];

    if (!videoPath) {
        console.log('Usage: npx tsx scripts/test-youtube-publish.ts <video.mp4>');
        console.log('Example: npx tsx scripts/test-youtube-publish.ts ~/Desktop/test-short.mp4');
        process.exit(1);
    }

    // 1. Get YouTube account from DB
    console.log('Fetching YouTube account from Supabase...');
    const { data: account, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('platform', 'youtube')
        .eq('is_active', true)
        .limit(1)
        .single();

    if (error || !account) {
        console.error('No YouTube account found:', error?.message);
        process.exit(1);
    }

    console.log(`Account: ${account.username} (${account.channel_id})`);

    // 2. Check if token needs refresh
    let accessToken = account.access_token;
    if (account.expires_at) {
        const expiresAt = new Date(account.expires_at);
        const now = new Date();
        if (expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
            console.log('Token expired or expiring soon, refreshing...');
            const { data: refreshData, error: refreshError } = await supabase.functions.invoke('youtube-refresh', {
                body: { account_id: account.id },
            });
            if (refreshError) {
                console.error('Token refresh failed:', refreshError);
                process.exit(1);
            }
            accessToken = refreshData?.access_token || accessToken;
            console.log('Token refreshed.');
        }
    }

    // 3. Publish
    console.log('\nPublishing to YouTube Shorts...');
    const result = await publishToYouTubeAPI({
        videoPath,
        title: 'Test Short from SocialUp',
        description: 'Testing YouTube Shorts publishing via SocialUp platform.\n\n#Shorts #Test',
        accessToken,
        privacyStatus: 'unlisted', // Use unlisted for testing
    });

    if (result.success) {
        console.log(`\nPublished successfully!`);
        console.log(`Video ID: ${result.videoId}`);
        console.log(`URL: https://youtube.com/shorts/${result.videoId}`);
    } else {
        console.error(`\nFailed: ${result.error}`);
    }

    process.exit(result.success ? 0 : 1);
}

main();
