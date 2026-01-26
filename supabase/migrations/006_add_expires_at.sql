-- Migration: 006_add_expires_at.sql
-- Add expires_at column for easier token validity checking

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
