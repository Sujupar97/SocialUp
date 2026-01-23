-- Add buffer_profile_id to accounts table
ALTER TABLE accounts 
ADD COLUMN buffer_profile_id VARCHAR(255);

COMMENT ON COLUMN accounts.buffer_profile_id IS 'ID del perfil en Buffer para publicación automática';
