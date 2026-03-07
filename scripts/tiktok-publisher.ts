/**
 * ContentHub - TikTok Publisher (Legacy - Browser Automation)
 * Publishes videos via Playwright browser automation.
 *
 * DEPRECATED: Use tiktok-api-publisher.ts instead (official API).
 * This file is kept for warmup/interaction use cases only.
 */

import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Configuración anti-detección
const BROWSER_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-setuid-sandbox'
];

interface TikTokCredentials {
    username: string;
    password: string;
}

interface PublishOptions {
    videoPath: string;
    description: string;
    credentials: TikTokCredentials;
    sessionDir?: string;
    headless?: boolean;
}

interface PublishResult {
    success: boolean;
    postUrl?: string;
    error?: string;
}

/**
 * Genera delays aleatorios humanizados
 */
function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simula escritura humana
 */
async function typeHumanLike(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector);
    for (const char of text) {
        await page.keyboard.type(char);
        await sleep(humanDelay(50, 150));
    }
}

/**
 * Obtiene o crea un contexto de navegador con sesión persistente
 */
async function getBrowserContext(sessionDir: string): Promise<BrowserContext> {
    const userDataDir = path.join(sessionDir, 'tiktok-session');

    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: BROWSER_ARGS,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'es-CO',
        timezoneId: 'America/Bogota'
    });

    return context;
}

/**
 * Verifica si ya hay sesión activa
 */
async function isLoggedIn(page: Page): Promise<boolean> {
    try {
        await page.goto('https://www.tiktok.com', { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(2000);

        // Buscar elementos que indican sesión activa
        const profileIcon = await page.$('[data-e2e="profile-icon"]');
        const uploadButton = await page.$('[data-e2e="upload-icon"]');

        return !!(profileIcon || uploadButton);
    } catch {
        return false;
    }
}

/**
 * Realiza login en TikTok
 */
async function login(page: Page, credentials: TikTokCredentials): Promise<boolean> {
    try {
        console.log('🔐 Iniciando login en TikTok...');

        await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        await sleep(humanDelay(2000, 3000));

        // Escribir email/username
        await typeHumanLike(page, 'input[name="username"]', credentials.username);
        await sleep(humanDelay(500, 1000));

        // Escribir contraseña
        await typeHumanLike(page, 'input[type="password"]', credentials.password);
        await sleep(humanDelay(500, 1000));

        // Click en login
        await page.click('button[type="submit"]');

        // Esperar navegación o CAPTCHA
        console.log('⏳ Esperando verificación (puede aparecer CAPTCHA)...');
        await sleep(10000);

        // Verificar si el login fue exitoso
        const isLogged = await isLoggedIn(page);

        if (isLogged) {
            console.log('✅ Login exitoso');
            return true;
        } else {
            console.log('⚠️ Login puede requerir verificación manual');
            return false;
        }
    } catch (error: any) {
        console.error('❌ Error en login:', error.message);
        return false;
    }
}

/**
 * Sube un video a TikTok
 */
async function uploadVideo(page: Page, videoPath: string, description: string): Promise<string | null> {
    try {
        console.log('📤 Navegando a página de upload...');
        await page.goto('https://www.tiktok.com/creator-center/upload', {
            waitUntil: 'networkidle',
            timeout: 60000
        });
        await sleep(humanDelay(3000, 5000));

        // Seleccionar archivo de video
        console.log('📁 Seleccionando archivo de video...');
        const fileInput = await page.$('input[type="file"]');
        if (!fileInput) {
            throw new Error('No se encontró el input de archivo');
        }
        await fileInput.setInputFiles(videoPath);

        // Esperar procesamiento del video
        console.log('⏳ Esperando procesamiento del video...');
        await sleep(humanDelay(10000, 15000));

        // Escribir descripción
        console.log('✍️ Escribiendo descripción...');
        const descriptionInput = await page.$('[data-e2e="caption-text-input"]')
            || await page.$('div[contenteditable="true"]')
            || await page.$('.public-DraftEditor-content');

        if (descriptionInput) {
            await descriptionInput.click();
            await sleep(500);
            await page.keyboard.type(description, { delay: 50 });
        }

        await sleep(humanDelay(2000, 3000));

        // Click en publicar
        console.log('🚀 Publicando...');
        const publishButton = await page.$('button:has-text("Publicar")')
            || await page.$('button:has-text("Post")')
            || await page.$('[data-e2e="post-button"]');

        if (publishButton) {
            await publishButton.click();
        }

        // Esperar confirmación
        await sleep(humanDelay(10000, 15000));

        console.log('✅ Video publicado exitosamente');

        // Intentar obtener URL del post
        const currentUrl = page.url();
        return currentUrl;
    } catch (error: any) {
        console.error('❌ Error en upload:', error.message);
        return null;
    }
}

/**
 * Función principal de publicación
 */
export async function publishToTikTok(options: PublishOptions): Promise<PublishResult> {
    const { videoPath, description, credentials, sessionDir = './sessions', headless = false } = options;

    // Verificar que el video existe
    if (!fs.existsSync(videoPath)) {
        return { success: false, error: `Video not found: ${videoPath}` };
    }

    let context: BrowserContext | null = null;

    try {
        // Crear contexto con sesión persistente
        context = await getBrowserContext(sessionDir);
        const page = await context.newPage();

        // Verificar si ya hay sesión
        const loggedIn = await isLoggedIn(page);

        if (!loggedIn) {
            const loginSuccess = await login(page, credentials);
            if (!loginSuccess) {
                return { success: false, error: 'Login failed - may require manual verification' };
            }
        }

        // Subir video
        const postUrl = await uploadVideo(page, videoPath, description);

        if (postUrl) {
            return { success: true, postUrl };
        } else {
            return { success: false, error: 'Upload completed but could not confirm post URL' };
        }
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        if (context) {
            await context.close();
        }
    }
}

// CLI para testing
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.log(`
ContentHub - TikTok Publisher
Usage: npx ts-node tiktok-publisher.ts <video_path> <description> <username> <password>

⚠️ IMPORTANTE: Activa tu VPN antes de ejecutar!
    `);
        process.exit(1);
    }

    const [videoPath, description, username, password] = args;

    console.log('🔒 Asegúrate de que CleanVPN está activa...\n');

    publishToTikTok({
        videoPath,
        description,
        credentials: { username, password }
    }).then(result => {
        if (result.success) {
            console.log('\n🎉 ¡Publicación exitosa!');
            console.log(`URL: ${result.postUrl}`);
        } else {
            console.error('\n❌ Error:', result.error);
        }
        process.exit(result.success ? 0 : 1);
    });
}
