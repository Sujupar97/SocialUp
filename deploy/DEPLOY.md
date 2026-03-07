# SocialUp - Guia de Despliegue (Hostinger VPS KVM)

## Requisitos Previos

- VPS Hostinger KVM con Ubuntu 22.04+
- Acceso root via SSH
- Dominio apuntando al VPS (opcional, para SSL)

## 1. Setup Inicial del VPS

```bash
ssh root@TU_IP_VPS

# Descargar y ejecutar script de setup
# (sube el archivo deploy/setup-vps.sh al VPS primero)
bash setup-vps.sh
```

Esto instala: Node.js 20, FFmpeg, Playwright deps, PM2, Nginx, Certbot.

## 2. Copiar Codigo al VPS

```bash
# Desde tu maquina local:
rsync -avz --exclude node_modules --exclude .git \
  ./contenthub/ root@TU_IP_VPS:/opt/socialup/

# En el VPS:
cd /opt/socialup
npm install
npx playwright install chromium
mkdir -p logs
```

## 3. Configurar Variables de Entorno

Crear `/opt/socialup/.env` con las credenciales minimas para bootstrap:

```env
SUPABASE_URL=https://nyxpkfjkgpjipejsrbac.supabase.co
SUPABASE_ANON_KEY=TU_ANON_KEY
AUTOMATION_SERVER_PORT=3001
```

Las demas credenciales (TikTok keys, Gemini API key) se cargan automaticamente
desde **Supabase Vault** al iniciar el servidor via `loadConfig()`.

## 4. Configurar Secretos en Supabase Vault

En el **SQL Editor** de Supabase Dashboard, ejecutar:

```sql
-- Primero aplicar la migracion 011 si no se ha hecho:
-- (copiar contenido de supabase/migrations/011_app_settings.sql)

-- Luego almacenar secretos en Vault:
SELECT vault.create_secret('tiktok_client_key', 'TU_CLIENT_KEY');
SELECT vault.create_secret('tiktok_client_secret', 'TU_CLIENT_SECRET');
SELECT vault.create_secret('gemini_api_key', 'TU_GEMINI_KEY');
```

## 5. Actualizar app_settings con URL del VPS

Una vez que el VPS tenga IP/dominio, actualizar en Supabase:

```sql
UPDATE app_settings SET value = 'https://TU_DOMINIO_O_IP:3001'
WHERE key = 'automation_server_url';
```

## 6. Configurar Nginx

```bash
# Copiar config
cp /opt/socialup/deploy/nginx-socialup.conf /etc/nginx/sites-available/socialup

# Editar: reemplazar server_name _ con tu dominio
nano /etc/nginx/sites-available/socialup

# Activar
ln -s /etc/nginx/sites-available/socialup /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL (si tienes dominio)
certbot --nginx -d tu-dominio.com
```

## 7. Iniciar con PM2

```bash
cd /opt/socialup

# Editar ecosystem.config.js con tus credenciales de Supabase
nano deploy/ecosystem.config.js

# Iniciar
pm2 start deploy/ecosystem.config.js

# Verificar
pm2 logs socialup-server

# Persistir entre reinicios
pm2 save
pm2 startup
```

## 8. Verificar

```bash
# Health check
curl http://localhost:3001/health

# Listar cuentas
curl http://localhost:3001/api/accounts
```

## 9. Configurar N8N Webhooks

En tu servidor N8N (`https://n8n.srv991927.hstgr.cloud/`):

1. Importar los workflows de `n8n-workflows/`
2. Configurar credenciales de Supabase en N8N
3. Activar los workflows

Los 7 webhooks que deben estar activos:
- `/webhook/contenthub-generate-descriptions`
- `/webhook/contenthub-update-status`
- `/webhook/contenthub-save-comment`
- `/webhook/contenthub-publish-tiktok`
- `/webhook/contenthub-publish-instagram`
- `/webhook/contenthub-post-comment`
- `/webhook/contenthub-fetch-analytics`

## Comandos Utiles

```bash
pm2 status           # Ver estado
pm2 logs             # Ver logs en tiempo real
pm2 restart all      # Reiniciar
pm2 monit            # Monitor de recursos
```
