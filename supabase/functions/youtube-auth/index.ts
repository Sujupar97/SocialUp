import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("YouTube Auth Function Up!")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { code, redirect_uri, code_verifier, user_id } = await req.json()

        const clientId = Deno.env.get('YOUTUBE_CLIENT_ID')
        const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET')

        if (!clientId || !clientSecret) {
            throw new Error('YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not set in Edge Function Secrets')
        }

        console.log(`Exchanging YouTube auth code... Code: ${code?.substring(0, 10)}...`)

        // 1. Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri,
                grant_type: 'authorization_code',
                code_verifier,
            }),
        })

        const tokenData = await tokenResponse.json()

        if (tokenData.error) {
            console.error('Google Token Error:', tokenData)
            throw new Error(tokenData.error_description || tokenData.error)
        }

        const { access_token, refresh_token, expires_in, scope, token_type } = tokenData

        if (!refresh_token) {
            console.warn('No refresh_token received. User may have already authorized this app without prompt=consent.')
        }

        console.log('YouTube tokens obtained. Fetching channel info...')

        // 2. Fetch channel info
        const channelResponse = await fetch(
            'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
            { headers: { 'Authorization': `Bearer ${access_token}` } }
        )

        const channelData = await channelResponse.json()

        if (channelData.error) {
            console.error('YouTube Channel API Error:', channelData.error)
            throw new Error(channelData.error.message || 'Failed to fetch channel info')
        }

        const channel = channelData.items?.[0]
        if (!channel) {
            throw new Error('No YouTube channel found for this account')
        }

        const channelId = channel.id
        const channelTitle = channel.snippet?.title || 'YouTube User'
        const avatarUrl = channel.snippet?.thumbnails?.default?.url || null

        console.log(`Channel: ${channelTitle} (${channelId})`)

        // 3. Save to Supabase
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const now = new Date()
        const expiresAt = new Date(now.getTime() + (expires_in * 1000))

        const dbPayload: Record<string, unknown> = {
            platform: 'youtube',
            channel_id: channelId,
            access_token,
            refresh_token: refresh_token || null,
            token_type: token_type || 'Bearer',
            scope: scope || '',
            expires_at: expiresAt.toISOString(),
            username: channelTitle,
            display_name: channelTitle,
            profile_photo_url: avatarUrl,
            is_active: true,
            updated_at: now.toISOString(),
        }

        if (user_id) {
            dbPayload.user_id = user_id
        }

        console.log('Saving YouTube account to DB...')

        // Check if account with this channel_id already exists
        const { data: existing } = await supabaseClient
            .from('accounts')
            .select('id')
            .eq('channel_id', channelId)
            .eq('platform', 'youtube')
            .maybeSingle()

        let account
        let upsertError

        if (existing) {
            // Update existing account
            const { data, error } = await supabaseClient
                .from('accounts')
                .update(dbPayload)
                .eq('id', existing.id)
                .select()
                .single()
            account = data
            upsertError = error
        } else {
            // Insert new account
            dbPayload.created_at = now.toISOString()
            const { data, error } = await supabaseClient
                .from('accounts')
                .insert(dbPayload)
                .select()
                .single()
            account = data
            upsertError = error
        }

        if (upsertError) {
            console.error('Supabase DB Error:', upsertError)
            throw new Error(`Database Error: ${upsertError.message} (${upsertError.details || ''} | ${upsertError.hint || ''})`)
        }

        console.log('YouTube account saved:', account?.id)

        // 4. Assign proxy from pool (platform-aware)
        if (account?.id) {
            try {
                await supabaseClient.rpc('assign_proxy_for_platform', {
                    p_account_id: account.id,
                    p_platform: 'youtube',
                })
                console.log('Proxy assigned from pool for YouTube account:', account.id)
            } catch (proxyErr: any) {
                // Non-fatal: proxy pool may be empty or account may already have one
                console.log('Proxy pool assignment skipped:', proxyErr?.message || 'no available proxy')
            }
        }

        return new Response(
            JSON.stringify({ success: true, message: 'YouTube account connected', account_id: account?.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Edge Function Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
