-- Migration: 010_add_proxy_and_userid.sql

-- Add user_id to link accounts to specific SaaS Tenants (Platform Users)
-- It is nullable for now to avoid issues with existing data, but ideally should be NOT NULL in production.
ALTER TABLE accounts ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Add Proxy Configuration for Account Isolation
ALTER TABLE accounts ADD COLUMN proxy_url TEXT;      -- e.g. http://1.2.3.4:8080 or socks5://...
ALTER TABLE accounts ADD COLUMN proxy_username TEXT;
ALTER TABLE accounts ADD COLUMN proxy_password TEXT;
ALTER TABLE accounts ADD COLUMN user_agent TEXT;     -- To override standard UA if needed for "Grey Hat" consistency

-- Index for faster lookup by user (Tenant)
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
