#!/bin/bash
# SocialUp - VPS Setup Script (Hostinger KVM)
# Run as root: bash setup-vps.sh

set -e

echo "=== SocialUp VPS Setup ==="
echo ""

# 1. System updates
echo "[1/7] Updating system packages..."
apt update && apt upgrade -y

# 2. Install Node.js 20 LTS via nvm
echo "[2/7] Installing Node.js 20 LTS..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

# 3. Install FFmpeg
echo "[3/7] Installing FFmpeg..."
apt install -y ffmpeg

# 4. Install Playwright dependencies (Chromium)
echo "[4/7] Installing Playwright browser dependencies..."
apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libxshmfence1 libx11-xcb1 xvfb

# 5. Install PM2
echo "[5/7] Installing PM2..."
npm install -g pm2

# 6. Install Nginx
echo "[6/7] Installing Nginx..."
apt install -y nginx

# 7. Install Certbot for SSL
echo "[7/7] Installing Certbot (Let's Encrypt)..."
apt install -y certbot python3-certbot-nginx

# Create app directory
echo ""
echo "Creating /opt/socialup..."
mkdir -p /opt/socialup
chown -R $USER:$USER /opt/socialup

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy your code to /opt/socialup/"
echo "  2. cd /opt/socialup && npm install"
echo "  3. npx playwright install chromium"
echo "  4. Create .env with SUPABASE_URL, SUPABASE_ANON_KEY"
echo "  5. Copy deploy/nginx-socialup.conf to /etc/nginx/sites-available/"
echo "  6. ln -s /etc/nginx/sites-available/socialup /etc/nginx/sites-enabled/"
echo "  7. certbot --nginx -d your-domain.com"
echo "  8. pm2 start deploy/ecosystem.config.js"
echo "  9. pm2 save && pm2 startup"
echo ""
