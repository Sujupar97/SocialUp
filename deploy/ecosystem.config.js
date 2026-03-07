// PM2 Configuration for SocialUp Automation Server
module.exports = {
    apps: [{
        name: 'socialup-server',
        script: 'npx',
        args: 'tsx scripts/server.ts',
        cwd: '/opt/socialup',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            AUTOMATION_SERVER_PORT: '3001',
            // Supabase credentials (required for bootstrap)
            SUPABASE_URL: '',        // Fill with your Supabase URL
            SUPABASE_ANON_KEY: '',   // Fill with your Supabase anon key
            // Other secrets loaded from Supabase Vault at runtime
        },
        error_file: '/opt/socialup/logs/error.log',
        out_file: '/opt/socialup/logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    }]
};
