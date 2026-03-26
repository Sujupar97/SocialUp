import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Instagram Auth Function Up!")

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

        const appId = Deno.env.get('INSTAGRAM_APP_ID')
        const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET')

        if (!appId || !appSecret) {
            throw new Error('INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET not set in Edge Function Secrets')
        }

        console.log(`Exchanging Instagram auth code...`)

        // 1. Exchange code for short-lived token via Instagram API
        const tokenFormData = new URLSearchParams()
        tokenFormData.append('client_id', appId)
        tokenFormData.append('client_secret', appSecret)
        tokenFormData.append('grant_type', 'authorization_code')
        tokenFormData.append('redirect_uri', redirect_uri)
        tokenFormData.append('code', code)

        console.log(`Token exchange with redirect_uri: ${redirect_uri}, code length: ${code?.length}`)

        const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
            method: 'POST',
            body: tokenFormData,
        })
        const tokenData = await tokenResponse.json()
        console.log('Token response status:', tokenResponse.status, 'data:', JSON.stringify(tokenData))

        if (!tokenResponse.ok || tokenData.error_type || tokenData.error_message || tokenData.error) {
            console.error('Instagram Token Error:', tokenData)
            const errMsg = tokenData.error_message || tokenData.error?.message || tokenData.error_type || tokenData.error || 'Token exchange failed'
            throw new Error(errMsg)
        }

        const shortLivedToken = tokenData.access_token
        const igUserId = tokenData.user_id?.toString()
        console.log(`Short-lived token obtained for user ${igUserId}. Exchanging for long-lived token...`)

        // 2. Exchange for long-lived token (60 days)
        const longLivedUrl = `https://graph.instagram.com/access_token` +
            `?grant_type=ig_exchange_token` +
            `&client_secret=${appSecret}` +
            `&access_token=${shortLivedToken}`

        const longLivedResponse = await fetch(longLivedUrl)
        const longLivedData = await longLivedResponse.json()

        if (longLivedData.error) {
            console.error('Long-lived token Error:', longLivedData.error)
            throw new Error(longLivedData.error.message || 'Failed to get long-lived token')
        }

        const accessToken = longLivedData.access_token
        const expiresIn = longLivedData.expires_in || 5184000 // 60 days default
        console.log('Long-lived token obtained.')

        // 3. Get Instagram user profile
        const profileResponse = await fetch(
            `https://graph.instagram.com/v22.0/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${accessToken}`
        )
        const profileData = await profileResponse.json()

        if (profileData.error) {
            console.error('Profile API Error:', profileData.error)
            throw new Error(profileData.error.message || 'Failed to fetch Instagram profile')
        }

        // Use app-scoped `id` for Content Publishing API (NOT `user_id`)
        const instagramUserId = profileData.id?.toString() || profileData.user_id?.toString() || igUserId
        const username = profileData.username || 'instagram_user'
        const displayName = profileData.name || username
        const profilePic = profileData.profile_picture_url || null

        console.log(`Instagram account: @${username} (app-scoped id: ${instagramUserId}, user_id: ${profileData.user_id})`)

        // 4. Save to Supabase
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const now = new Date()
        const expiresAt = new Date(now.getTime() + (expiresIn * 1000))

        const dbPayload: Record<string, unknown> = {
            platform: 'instagram',
            instagram_user_id: instagramUserId,
            access_token: accessToken,
            refresh_token: null,
            scope: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages',
            expires_at: expiresAt.toISOString(),
            username: username,
            display_name: displayName,
            profile_photo_url: profilePic,
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
            .eq('instagram_user_id', instagramUserId)
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

        // 5. Assign proxy from pool
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
