import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Get Config Function Up!")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { keys } = await req.json()

        if (!keys || !Array.isArray(keys) || keys.length === 0) {
            throw new Error('keys[] is required')
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const settings: Record<string, string> = {}

        // Separate regular keys from secret keys
        const regularKeys = keys.filter((k: string) => !k.startsWith('secret:'))
        const secretKeys = keys.filter((k: string) => k.startsWith('secret:')).map((k: string) => k.replace('secret:', ''))

        // Fetch regular settings from app_settings table
        if (regularKeys.length > 0) {
            const { data, error } = await supabaseClient
                .from('app_settings')
                .select('key, value')
                .in('key', regularKeys)

            if (error) {
                throw new Error(`Error fetching settings: ${error.message}`)
            }

            for (const row of data || []) {
                settings[row.key] = row.value
            }
        }

        // Fetch secrets from Vault
        if (secretKeys.length > 0) {
            for (const secretName of secretKeys) {
                const { data, error } = await supabaseClient
                    .rpc('get_secret', { secret_name: secretName })

                if (!error && data) {
                    settings[`secret:${secretName}`] = data
                }
            }
        }

        return new Response(
            JSON.stringify({ settings }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Get Config Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
