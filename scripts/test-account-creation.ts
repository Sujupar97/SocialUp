/**
 * Test Script - Account Creation E2E
 * Creates a single account with visible browser for testing.
 *
 * Prerequisites:
 * - email_domain set in app_settings (e.g., fullcontent.online)
 * - Cloudflare Email Worker active (for email verification)
 * - At least 1 proxy in proxy_pool (optional but recommended)
 * - CapSolver API key set (for CAPTCHA)
 * - sms-activate.org API key set (optional, for phone verification)
 *
 * Usage:
 *   npx tsx scripts/test-account-creation.ts --platform tiktok
 *   npx tsx scripts/test-account-creation.ts --platform instagram --headless true
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG, loadConfig } from './config';
import { createAccount } from './account-creator';
import 'dotenv/config';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

async function preflight(): Promise<{ ok: boolean; issues: string[] }> {
    const issues: string[] = [];

    console.log('\n🔍 Preflight checks...\n');

    // 1. Check email domain
    const { data: emailDomain } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'email_domain')
        .single();

    if (emailDomain?.value) {
        console.log(`  ✅ Email domain: ${emailDomain.value}`);
    } else {
        issues.push('email_domain not set in app_settings');
        console.log('  ❌ Email domain: NOT SET');
    }

    // 2. Check proxies
    const { count: proxyCount } = await supabase
        .from('proxy_pool')
        .select('*', { count: 'exact', head: true })
        .eq('is_available', true);

    if (proxyCount && proxyCount > 0) {
        console.log(`  ✅ Available proxies: ${proxyCount}`);
    } else {
        issues.push('No proxies in proxy_pool (account will be created without proxy)');
        console.log('  ⚠️  No proxies available (will proceed without proxy)');
    }

    // 3. Check CapSolver
    const { data: capsolverKey } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'capsolver_api_key')
        .single();

    if (capsolverKey?.value) {
        console.log('  ✅ CapSolver API key: configured');
        // Check balance
        try {
            const resp = await fetch('https://api.capsolver.com/getBalance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientKey: capsolverKey.value }),
            });
            const data = await resp.json() as any;
            if (data.balance !== undefined) {
                console.log(`     Balance: $${data.balance}`);
                if (data.balance < 0.01) issues.push('CapSolver balance is very low');
            }
        } catch { /* ignore */ }
    } else {
        issues.push('capsolver_api_key not set (CAPTCHA solving will fail)');
        console.log('  ❌ CapSolver API key: NOT SET');
    }

    // 4. Check SMS (optional)
    const { data: smsKey } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'smsactivate_api_key')
        .single();

    if (smsKey?.value) {
        console.log('  ✅ sms-activate.org API key: configured');
    } else {
        console.log('  ⚠️  sms-activate.org API key: NOT SET (phone verification will fail if required)');
    }

    // 5. Test email delivery
    console.log('\n  📧 Testing email delivery...');
    const testEmail = `test_preflight_${Date.now()}@${emailDomain?.value || 'fullcontent.online'}`;
    console.log(`     Send a test email to: ${testEmail}`);
    console.log('     (Skipping email delivery test — will be tested during account creation)');

    console.log('');
    return { ok: issues.filter(i => !i.includes('optional') && !i.includes('without proxy')).length === 0, issues };
}

async function main() {
    const args = process.argv.slice(2);
    const flags: Record<string, string> = {};

    for (let i = 0; i < args.length; i += 2) {
        if (args[i].startsWith('--')) {
            flags[args[i].replace('--', '')] = args[i + 1] || '';
        }
    }

    const platform = (flags.platform || 'tiktok') as 'tiktok' | 'instagram' | 'youtube';
    const headless = flags.headless === 'true';

    console.log(`
╔═══════════════════════════════════════╗
║   SocialUp - Account Creation Test    ║
║   Platform: ${platform.padEnd(25)}║
║   Headless: ${String(headless).padEnd(25)}║
╚═══════════════════════════════════════╝`);

    // Load config from Supabase
    await loadConfig();

    // Run preflight checks
    const { ok, issues } = await preflight();

    if (!ok) {
        console.log('❌ Preflight failed:');
        issues.forEach(i => console.log(`   - ${i}`));
        console.log('\nFix the issues above and try again.');
        process.exit(1);
    }

    if (issues.length > 0) {
        console.log('⚠️  Warnings:');
        issues.forEach(i => console.log(`   - ${i}`));
    }

    // Get email domain
    const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'email_domain')
        .single();

    const emailDomain = settings?.value || 'fullcontent.online';

    // Generate a strong password
    const password = `SUp${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;

    console.log(`\n🚀 Starting account creation...`);
    console.log(`   Email domain: ${emailDomain}`);
    console.log(`   Password: ${password.slice(0, 4)}****`);
    console.log(`   Browser: ${headless ? 'headless' : 'VISIBLE (watch the browser!)'}\n`);

    const startTime = Date.now();

    const result = await createAccount({
        platform,
        emailDomain,
        count: 1,
        startIndex: 1,
        usernamePrefix: 'socialup',
        password,
        maxConcurrent: 1,
        headless,
    }, 0);

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n${'='.repeat(50)}`);
    if (result.success) {
        console.log(`✅ SUCCESS — Account created in ${elapsed}s`);
        console.log(`   Platform: ${platform}`);
        console.log(`   Username: ${result.username}`);
        console.log(`   Email: ${result.email}`);
        console.log(`   Account ID: ${result.accountId}`);
        console.log(`   Password: ${password}`);
    } else {
        console.log(`❌ FAILED — ${result.error}`);
        console.log(`   Email attempted: ${result.email}`);
        console.log(`   Elapsed: ${elapsed}s`);
    }
    console.log(`${'='.repeat(50)}\n`);

    process.exit(result.success ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
