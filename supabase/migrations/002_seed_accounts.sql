-- Insertar cuentas de prueba para demostración
-- Ejecutar en Supabase SQL Editor

INSERT INTO accounts (platform, username, display_name, bio, is_active) VALUES
('tiktok', 'julianparra_01', 'Julián David', 'Emprendedor | Marketing Digital | Contenido de Valor 🚀', true),
('tiktok', 'julianparra_02', 'Julian Parra', 'Transformando vidas con contenido 💡 | Emprendedor', true),
('tiktok', 'julianparra_03', 'J. David Parra', 'Creador de contenido | Tips de negocios 📈', true),
('tiktok', 'julianparra_04', 'JulianDavidP', 'Emprendimiento y crecimiento personal ✨', true),
('tiktok', 'julianparra_05', 'Julián P.', 'Marketing | Contenido | Valor real 🔥', true),
('tiktok', 'julianparra_06', 'JDParra', 'Tu dosis diaria de motivación y negocios 💪', true),
('tiktok', 'julianparra_07', 'Julian_David_P', 'Emprendedor digital | Creador de comunidades', true),
('tiktok', 'julianparra_08', 'JulianDavidParra', 'Contenido que transforma | Marketing Digital', true),
('tiktok', 'julianparra_09', 'ParraJulian', 'Tips de negocios y marketing 📊', true),
('tiktok', 'julianparra_10', 'JulianParra10', 'Emprendedor serial | Contenido de valor', true),
('tiktok', 'julianparra_11', 'JDP_Contenido', 'Tu guía en el mundo digital 🌐', true),
('tiktok', 'julianparra_12', 'JulianD_Parra', 'Marketing estratégico | Crecimiento personal', true)
ON CONFLICT DO NOTHING;
