-- Migration: 009_add_unique_openid.sql

-- Ensure open_id is unique to support UPSERT operations correctly
ALTER TABLE accounts ADD CONSTRAINT accounts_open_id_key UNIQUE (open_id);
