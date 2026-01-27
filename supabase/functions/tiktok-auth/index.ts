import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("TikTok Auth Function Up!")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { code, redirect_uri, code_verifier } = await req.json()

        // Default key from frontend (public), but ideally should also be env var if possible.
        const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') || 'awz6klemqb5wxgsh'
        const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')

        if (!clientSecret) {
            throw new Error('TIKTOK_CLIENT_SECRET is not set in Edge Function Secrets')
        }

        console.log(`Exchanging code for token... Code: ${code?.substring(0, 5)}..., RedirectURI: ${redirect_uri}`)

        // 1. Exchange code for token
        // Using v2 token endpoint
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cache-Control': 'no-cache'
            },
            body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: redirect_uri,
                code_verifier: code_verifier
            })
        })

        const tokenData = await tokenResponse.json()

        if (tokenData.error) {
            console.error('TikTok Token Error:', tokenData)
            throw new Error(tokenData.error_description || JSON.stringify(tokenData))
        }

        console.log('Token exchanged successfully. Fetching user info...')

        const { open_id, access_token, expires_in, refresh_token, scope, token_type } = tokenData

        // 2. Fetch User Info
        const userInfoResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=avatar_url,display_name,username', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        })

        const userInfoData = await userInfoResponse.json()
        const userData = userInfoData.data?.user || {}

        console.log('User info fetched:', userData.username)

        // 3. Save to Supabase (With Strict Error Handling)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const now = new Date()
        const expiresAt = new Date(now.getTime() + (expires_in * 1000))

        console.log('Upserting account to DB...')

        const { data: account, error: upsertError } = await supabaseClient
            .from('accounts')
            .upsert({
                platform: 'tiktok',
                open_id: open_id,
                access_token: access_token,
                refresh_token: refresh_token,
                token_type: token_type,
                scope: scope,
                expires_at: expiresAt.toISOString(),
                username: userData.username || 'tiktok_user',
                display_name: userData.display_name || 'TikTok User',
                profile_photo_url: userData.avatar_url,
                is_active: true,
                updated_at: now.toISOString()
            }, { onConflict: 'open_id' })
            .select()
            .single()

        if (upsertError) {
            console.error('Supabase Upsert Error:', upsertError)
            throw new Error(`Database Error: ${upsertError.message} (${upsertError.details || ''})`)
        }

        console.log('Account saved successfully:', account?.id)

        return new Response(
            JSON.stringify({ success: true, message: 'Account connected' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Edge Function Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
