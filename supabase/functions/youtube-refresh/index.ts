import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("YouTube Token Refresh Function Up!")

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

        const clientId = Deno.env.get('YOUTUBE_CLIENT_ID')
        const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET')

        if (!clientId || !clientSecret) {
            throw new Error('YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not set in Edge Function Secrets')
        }

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
            throw new Error(`No refresh token for YouTube account ${account.username}`)
        }

        console.log(`Refreshing YouTube token for @${account.username}...`)

        // Call Google token refresh endpoint
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: account.refresh_token,
                grant_type: 'refresh_token',
            }),
        })

        const tokenData = await tokenResponse.json()

        if (tokenData.error) {
            console.error('Google Refresh Error:', tokenData)
            throw new Error(tokenData.error_description || tokenData.error)
        }

        // Google does NOT return a new refresh_token — only access_token + expires_in
        const { access_token, expires_in, scope, token_type } = tokenData

        const now = new Date()
        const expiresAt = new Date(now.getTime() + (expires_in * 1000))

        // Update account with new access token
        const { error: updateError } = await supabaseClient
            .from('accounts')
            .update({
                access_token,
                token_type: token_type || 'Bearer',
                scope: scope || undefined,
                expires_at: expiresAt.toISOString(),
                updated_at: now.toISOString(),
                // refresh_token stays the same — Google doesn't rotate it
            })
            .eq('id', account_id)

        if (updateError) {
            throw new Error(`Failed to update tokens: ${updateError.message}`)
        }

        console.log(`YouTube token refreshed for @${account.username}. Expires: ${expiresAt.toISOString()}`)

        return new Response(
            JSON.stringify({
                success: true,
                message: 'YouTube token refreshed',
                expires_at: expiresAt.toISOString(),
                access_token,
            }),
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
