-- Migration: 008_disable_rls_accounts.sql

-- Disable RLS on accounts table to verify visibility
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
