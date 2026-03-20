import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Instagram Auth Function Up!")

const GRAPH_API_VERSION = 'v22.0'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { code, redirect_uri, user_id } = await req.json()

        const appId = Deno.env.get('FACEBOOK_APP_ID')
        const appSecret = Deno.env.get('FACEBOOK_APP_SECRET')

        if (!appId || !appSecret) {
            throw new Error('FACEBOOK_APP_ID or FACEBOOK_APP_SECRET not set in Edge Function Secrets')
        }

        console.log(`Exchanging Instagram/Facebook auth code...`)

        // 1. Exchange code for short-lived token
        const tokenUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
            `?client_id=${appId}` +
            `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
            `&client_secret=${appSecret}` +
            `&code=${code}`

        const tokenResponse = await fetch(tokenUrl)
        const tokenData = await tokenResponse.json()

        if (tokenData.error) {
            console.error('Facebook Token Error:', tokenData.error)
            throw new Error(tokenData.error.message || tokenData.error.type)
        }

        const shortLivedToken = tokenData.access_token
        console.log('Short-lived token obtained. Exchanging for long-lived token...')

        // 2. Exchange for long-lived token (60 days)
        const longLivedUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
            `?grant_type=fb_exchange_token` +
            `&client_id=${appId}` +
            `&client_secret=${appSecret}` +
            `&fb_exchange_token=${shortLivedToken}`

        const longLivedResponse = await fetch(longLivedUrl)
        const longLivedData = await longLivedResponse.json()

        if (longLivedData.error) {
            console.error('Long-lived token Error:', longLivedData.error)
            throw new Error(longLivedData.error.message || 'Failed to get long-lived token')
        }

        const accessToken = longLivedData.access_token
        const expiresIn = longLivedData.expires_in || 5184000 // 60 days default
        console.log('Long-lived token obtained.')

        // 3. Get Facebook Pages managed by user
        const pagesResponse = await fetch(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?access_token=${accessToken}`
        )
        const pagesData = await pagesResponse.json()

        if (pagesData.error) {
            console.error('Pages API Error:', pagesData.error)
            throw new Error(pagesData.error.message || 'Failed to fetch Facebook Pages')
        }

        const pages = pagesData.data || []
        if (pages.length === 0) {
            throw new Error('No Facebook Pages found. Instagram Business accounts must be linked to a Facebook Page.')
        }

        console.log(`Found ${pages.length} Facebook Page(s). Checking for Instagram accounts...`)

        // 4. Find Instagram Business Account linked to a Page
        let igAccount: { id: string; username: string; name: string; profilePic: string; pageId: string; pageToken: string } | null = null

        for (const page of pages) {
            const igResponse = await fetch(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${accessToken}`
            )
            const igData = await igResponse.json()

            if (igData.instagram_business_account) {
                const igId = igData.instagram_business_account.id

                // Get IG account details
                const igInfoResponse = await fetch(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${igId}?fields=username,name,profile_picture_url&access_token=${accessToken}`
                )
                const igInfo = await igInfoResponse.json()

                igAccount = {
                    id: igId,
                    username: igInfo.username || 'instagram_user',
                    name: igInfo.name || igInfo.username || 'Instagram User',
                    profilePic: igInfo.profile_picture_url || null,
                    pageId: page.id,
                    pageToken: page.access_token, // Page-scoped token
                }
                break // Use first IG account found
            }
        }

        if (!igAccount) {
            throw new Error('No Instagram Business/Creator account found linked to any of your Facebook Pages. Make sure your Instagram account is a Business or Creator account and is connected to a Facebook Page.')
        }

        console.log(`Instagram account: @${igAccount.username} (${igAccount.id})`)

        // 5. Save to Supabase
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const now = new Date()
        const expiresAt = new Date(now.getTime() + (expiresIn * 1000))

        const dbPayload: Record<string, unknown> = {
            platform: 'instagram',
            instagram_user_id: igAccount.id,
            facebook_page_id: igAccount.pageId,
            access_token: accessToken,
            refresh_token: null, // Facebook uses token exchange, not refresh_token
            scope: 'instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list',
            expires_at: expiresAt.toISOString(),
            username: igAccount.username,
            display_name: igAccount.name,
            profile_photo_url: igAccount.profilePic,
            is_active: true,
            updated_at: now.toISOString(),
        }

        if (user_id) {
            dbPayload.user_id = user_id
        }

        console.log('Saving Instagram account to DB...')

        // Check if account already exists
        const { data: existing } = await supabaseClient
            .from('accounts')
            .select('id')
            .eq('instagram_user_id', igAccount.id)
            .eq('platform', 'instagram')
            .maybeSingle()

        let account
        let dbError

        if (existing) {
            const { data, error } = await supabaseClient
                .from('accounts')
                .update(dbPayload)
                .eq('id', existing.id)
                .select()
                .single()
            account = data
            dbError = error
        } else {
            dbPayload.created_at = now.toISOString()
            const { data, error } = await supabaseClient
                .from('accounts')
                .insert(dbPayload)
                .select()
                .single()
            account = data
            dbError = error
        }

        if (dbError) {
            console.error('Supabase DB Error:', dbError)
            throw new Error(`Database Error: ${dbError.message} (${dbError.details || ''} | ${dbError.hint || ''})`)
        }

        console.log('Instagram account saved:', account?.id)

        // 6. Assign proxy from pool
        if (account?.id) {
            try {
                await supabaseClient.rpc('assign_proxy_for_platform', {
                    p_account_id: account.id,
                    p_platform: 'instagram',
                })
                console.log('Proxy assigned for Instagram account:', account.id)
            } catch (proxyErr: any) {
                console.log('Proxy pool assignment skipped:', proxyErr?.message || 'no available proxy')
            }
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Instagram account connected', account_id: account?.id }),
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
