import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("TikTok Token Refresh Function Up!")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { account_id } = await req.json()

        if (!account_id) {
            throw new Error('account_id is required')
        }

        const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') || ''
        const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')

        if (!clientSecret) {
            throw new Error('TIKTOK_CLIENT_SECRET is not set in Edge Function Secrets')
        }

        // Initialize Supabase client with service role key
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Fetch account from DB
        const { data: account, error: fetchError } = await supabaseClient
            .from('accounts')
            .select('id, refresh_token, expires_at, username')
            .eq('id', account_id)
            .single()

        if (fetchError || !account) {
            throw new Error(`Account not found: ${fetchError?.message || account_id}`)
        }

        if (!account.refresh_token) {
            throw new Error(`No refresh token for account ${account.username}`)
        }

        console.log(`Refreshing token for @${account.username}...`)

        // Call TikTok refresh token endpoint
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cache-Control': 'no-cache'
            },
            body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: account.refresh_token
            })
        })

        const tokenData = await tokenResponse.json()

        if (tokenData.error) {
            console.error('TikTok Refresh Error:', tokenData)
            throw new Error(tokenData.error_description || JSON.stringify(tokenData))
        }

        const { open_id, access_token, refresh_token, expires_in, scope, token_type } = tokenData

        // Calculate new expiration
        const now = new Date()
        const expiresAt = new Date(now.getTime() + (expires_in * 1000))

        // Update account with new tokens
        const { error: updateError } = await supabaseClient
            .from('accounts')
            .update({
                access_token: access_token,
                refresh_token: refresh_token,
                token_type: token_type,
                scope: scope,
                expires_at: expiresAt.toISOString(),
                updated_at: now.toISOString(),
            })
            .eq('id', account_id)

        if (updateError) {
            throw new Error(`Failed to update tokens: ${updateError.message}`)
        }

        console.log(`Token refreshed for @${account.username}. Expires: ${expiresAt.toISOString()}`)

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Token refreshed',
                expires_at: expiresAt.toISOString(),
                access_token: access_token,
            }),
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
