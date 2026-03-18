import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Proxy Sync Function Up!")

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

interface WebshareProxy {
    proxy_address: string;
    port: number;
    username: string;
    password: string;
    country_code: string;
    valid: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { provider } = await req.json()

        if (!provider || provider !== 'webshare') {
            throw new Error('Unsupported provider. Currently only "webshare" is supported.')
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Read API key from Vault
        const { data: apiKey, error: secretError } = await supabaseClient
            .rpc('get_secret', { secret_name: 'webshare_api_key' })

        if (secretError || !apiKey) {
            throw new Error('webshare_api_key not found in Vault. Run: SELECT vault.create_secret(\'webshare_api_key\', \'<KEY>\');')
        }

        // Fetch proxies from Webshare API
        const response = await fetch('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100', {
            headers: {
                'Authorization': `Token ${apiKey}`
            }
        })

        if (!response.ok) {
            const errText = await response.text()
            throw new Error(`Webshare API error (${response.status}): ${errText}`)
        }

        const data = await response.json()
        const proxies: WebshareProxy[] = data.results || []

        console.log(`Fetched ${proxies.length} proxies from Webshare`)

        let upserted = 0
        let skipped = 0

        for (const proxy of proxies) {
            if (!proxy.valid) {
                skipped++
                continue
            }

            const { error: upsertError } = await supabaseClient
                .from('proxy_pool')
                .upsert({
                    provider: 'webshare',
                    host: proxy.proxy_address,
                    port: proxy.port,
                    username: proxy.username,
                    password: proxy.password,
                    protocol: 'http',
                    country_code: proxy.country_code?.toUpperCase() || null,
                    is_healthy: true,
                    last_checked_at: new Date().toISOString(),
                }, { onConflict: 'host,port,username' })

            if (upsertError) {
                console.error(`Error upserting proxy ${proxy.proxy_address}:${proxy.port}:`, upsertError)
                skipped++
            } else {
                upserted++
            }
        }

        console.log(`Sync complete: ${upserted} upserted, ${skipped} skipped`)

        return new Response(
            JSON.stringify({
                success: true,
                provider,
                total_fetched: proxies.length,
                upserted,
                skipped
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Proxy Sync Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
