/**
 * ContentHub - Main Orchestrator
 * Orquesta todo el flujo: duplicación → descripciones → publicación
 */

import { duplicateVideo, getVideoInfo } from './video-processor';
import { generateDescriptions } from './description-generator';
import { publishToTikTok } from './tiktok-publisher';
import * as fs from 'fs';
import * as path from 'path';

interface Account {
    id: string;
    username: string;
    password: string;
}

interface DistributeOptions {
    videoPath: string;
    baseDescription: string;
    accounts: Account[];
    outputDir?: string;
}

interface DistributeResult {
    success: boolean;
    results: {
        accountId: string;
        accountUsername: string;
        videoPath: string;
        description: string;
        status: 'pending' | 'processing' | 'published' | 'failed';
        postUrl?: string;
        error?: string;
    }[];
}

/**
 * Distribuye un video a múltiples cuentas de TikTok
 */
export async function distributeVideo(options: DistributeOptions): Promise<DistributeResult> {
    const { videoPath, baseDescription, accounts, outputDir = './processed' } = options;
    const results: DistributeResult['results'] = [];

    console.log('📋 ContentHub - Iniciando distribución');
    console.log(`   Video: ${videoPath}`);
    console.log(`   Cuentas: ${accounts.length}`);
    console.log('');

    // Paso 1: Obtener info del video
    console.log('📊 Analizando video...');
    const videoInfo = await getVideoInfo(videoPath);
    if (!videoInfo) {
        return {
            success: false, results: [{
                accountId: '',
                accountUsername: '',
                videoPath,
                description: '',
                status: 'failed',
                error: 'Could not analyze video'
            }]
        };
    }
    console.log(`   Duración: ${Math.round(videoInfo.duration)}s`);
    console.log(`   Tamaño: ${Math.round(videoInfo.size / 1024 / 1024)}MB\n`);

    // Paso 2: Duplicar video
    console.log('🔄 Duplicando video...');
    const duplicateResult = await duplicateVideo({
        inputPath: videoPath,
        outputDir,
        copies: accounts.length
    });

    if (!duplicateResult.success) {
        return {
            success: false, results: [{
                accountId: '',
                accountUsername: '',
                videoPath,
                description: '',
                status: 'failed',
                error: duplicateResult.error
            }]
        };
    }
    console.log(`   ✅ ${duplicateResult.outputPaths.length} copias creadas\n`);

    // Paso 3: Generar descripciones
    console.log('✨ Generando descripciones con IA...');
    const descriptionsResult = await generateDescriptions({
        baseDescription,
        copies: accounts.length,
        language: 'español'
    });

    if (!descriptionsResult.success) {
        return {
            success: false, results: [{
                accountId: '',
                accountUsername: '',
                videoPath,
                description: '',
                status: 'failed',
                error: descriptionsResult.error
            }]
        };
    }
    console.log(`   ✅ ${descriptionsResult.descriptions.length} descripciones generadas\n`);

    // Paso 4: Publicar en cada cuenta
    console.log('🚀 Iniciando publicación en TikTok...\n');

    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const uniqueVideoPath = duplicateResult.outputPaths[i];
        const description = descriptionsResult.descriptions[i] || baseDescription;

        console.log(`📤 [${i + 1}/${accounts.length}] Publicando en @${account.username}...`);

        const publishResult = await publishToTikTok({
            videoPath: uniqueVideoPath,
            description,
            credentials: {
                username: account.username,
                password: account.password
            }
        });

        results.push({
            accountId: account.id,
            accountUsername: account.username,
            videoPath: uniqueVideoPath,
            description,
            status: publishResult.success ? 'published' : 'failed',
            postUrl: publishResult.postUrl,
            error: publishResult.error
        });

        if (publishResult.success) {
            console.log(`   ✅ Publicado exitosamente\n`);
        } else {
            console.log(`   ❌ Error: ${publishResult.error}\n`);
        }

        // Delay entre publicaciones para parecer más humano
        if (i < accounts.length - 1) {
            const delaySeconds = Math.floor(Math.random() * 30) + 30; // 30-60 segundos
            console.log(`   ⏳ Esperando ${delaySeconds}s antes de la siguiente publicación...\n`);
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }
    }

    const successCount = results.filter(r => r.status === 'published').length;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Resumen: ${successCount}/${accounts.length} publicaciones exitosas`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
        success: successCount === accounts.length,
        results
    };
}

// CLI entry point
if (require.main === module) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           ContentHub - Sistema de Distribución               ║
╚══════════════════════════════════════════════════════════════╝

Este script:
1. Duplica tu video (creando copias únicas)
2. Genera descripciones únicas con IA
3. Publica automáticamente en cada cuenta de TikTok

Uso: npx ts-node orchestrator.ts <video_path> <descripcion_base>
  `);

    const videoPath = process.argv[2];
    const baseDescription = process.argv[3];

    if (!videoPath || !baseDescription) {
        console.log('Ejemplo:');
        console.log('npx ts-node orchestrator.ts ./mi_video.mp4 "Este es un video increíble"');
        process.exit(1);
    }

    console.log('Las cuentas se cargan desde Supabase.\n');
    console.log('Conecta cuentas reales via OAuth antes de ejecutar.\n');
}
