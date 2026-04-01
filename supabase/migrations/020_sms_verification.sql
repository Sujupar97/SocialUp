-- Migration 020: SMS verification system
-- Stores phone number rentals and received verification codes
-- for automated account creation via sms-activate.org

CREATE TABLE IF NOT EXISTS sms_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    platform TEXT NOT NULL,
    country_code TEXT,
    verification_code TEXT,
    status TEXT NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'code_received', 'confirmed', 'cancelled', 'expired')),
    account_id UUID REFERENCES accounts(id),
    provider TEXT DEFAULT 'sms-activate',
    rented_at TIMESTAMPTZ DEFAULT now(),
    code_received_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_verifications_rental ON sms_verifications(rental_id);
CREATE INDEX IF NOT EXISTS idx_sms_verifications_status ON sms_verifications(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_sms_verifications_platform ON sms_verifications(platform, rented_at DESC);

-- App settings for SMS verification
INSERT INTO app_settings (key, value, description) VALUES
    ('smsactivate_api_key', '', 'sms-activate.org API key for phone verification'),
    ('sms_default_country', '0', 'Default country code for SMS number rental (0 = any)')
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description;
