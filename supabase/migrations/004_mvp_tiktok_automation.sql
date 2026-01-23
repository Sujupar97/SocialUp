-- ContentHub MVP Schema Update
-- Soporte para cuentas TikTok con credenciales encriptadas

-- Agregar campos para credenciales TikTok
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS encrypted_password TEXT,
ADD COLUMN IF NOT EXISTS session_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS login_status VARCHAR(50) DEFAULT 'unknown';

-- Tabla para tracking de videos procesados
CREATE TABLE IF NOT EXISTS video_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    total_copies INTEGER DEFAULT 0,
    completed_copies INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_video_copies_status ON video_copies(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON video_processing_jobs(status);

-- Comentarios
COMMENT ON COLUMN accounts.encrypted_password IS 'Contraseña encriptada de TikTok';
COMMENT ON COLUMN accounts.session_data IS 'Cookies y datos de sesión para login persistente';
COMMENT ON COLUMN accounts.login_status IS 'Estado del último login: success, failed, captcha_required';
