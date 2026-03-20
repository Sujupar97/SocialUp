import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Instagram Refresh Function Up!")

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
        const { account_id } = await req.json()

        if (!account_id) {
            throw new Error('account_id is required')
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Fetch current token
        const { data: account, error: fetchError } = await supabaseClient
            .from('accounts')
            .select('id, access_token, platform')
            .eq('id', account_id)
            .single()

        if (fetchError || !account) {
            throw new Error(`Account not found: ${fetchError?.message || 'unknown'}`)
        }

        if (account.platform !== 'instagram') {
            throw new Error(`Account ${account_id} is not an Instagram account`)
        }

        console.log(`Refreshing Instagram token for account ${account_id}...`)

        // Instagram/Facebook long-lived token refresh
        // Exchange current long-lived token for a new one
        const refreshUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
            `?grant_type=fb_exchange_token` +
            `&client_id=${Deno.env.get('FACEBOOK_APP_ID')}` +
            `&client_secret=${Deno.env.get('FACEBOOK_APP_SECRET')}` +
            `&fb_exchange_token=${account.access_token}`

        const refreshResponse = await fetch(refreshUrl)
        const refreshData = await refreshResponse.json()

        if (refreshData.error) {
            console.error('Facebook Refresh Error:', refreshData.error)
            throw new Error(refreshData.error.message || 'Token refresh failed')
        }

        const newToken = refreshData.access_token
        const expiresIn = refreshData.expires_in || 5184000 // 60 days
        const expiresAt = new Date(Date.now() + (expiresIn * 1000))

        // Update in DB
        const { error: updateError } = await supabaseClient
            .from('accounts')
            .update({
                access_token: newToken,
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', account_id)

        if (updateError) {
            throw new Error(`Failed to update token: ${updateError.message}`)
        }

        console.log(`Instagram token refreshed. Expires: ${expiresAt.toISOString()}`)

        return new Response(
            JSON.stringify({
                success: true,
                access_token: newToken,
                expires_at: expiresAt.toISOString(),
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
