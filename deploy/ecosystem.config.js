// PM2 Configuration for SocialUp Automation Server + Warmup Scheduler
module.exports = {
    apps: [
        {
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
                SUPABASE_URL: '',
                SUPABASE_ANON_KEY: '',
            },
            error_file: '/opt/socialup/logs/server-error.log',
            out_file: '/opt/socialup/logs/server-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },
        {
            name: 'socialup-warmup',
            script: 'npx',
            args: 'tsx scripts/warmup-scheduler.ts',
            cwd: '/opt/socialup',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '2G',
            env: {
                NODE_ENV: 'production',
                SUPABASE_URL: '',
                SUPABASE_ANON_KEY: '',
            },
            error_file: '/opt/socialup/logs/warmup-error.log',
            out_file: '/opt/socialup/logs/warmup-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },
    ],
};
