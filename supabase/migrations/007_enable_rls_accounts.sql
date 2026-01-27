-- Migration: 007_enable_rls_accounts.sql

-- Enable RLS on accounts table
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Policy to allow anonymous/authenticated users to READ accounts (For the Single User Dashboard)
-- In a multi-user app, we would restrict this to auth.uid(), but for this internal tool, we allow public read.
CREATE POLICY "Allow public read access to accounts"
ON accounts FOR SELECT
TO anon, authenticated
USING (true);

-- Also allow update/delete if needed by the frontend (e.g. toggling status)
CREATE POLICY "Allow public update access to accounts"
ON accounts FOR UPDATE
TO anon, authenticated
USING (true);

-- Note: Inserts are handled by the Service Role (Edge Function), so they bypass RLS.
