#!/usr/bin/env npx ts-node
/**
 * ContentHub - Test Runner
 * Script para probar el flujo completo de distribución
 * 
 * Uso: npx ts-node test-distribution.ts <video_path> "<descripcion>"
 * 
 * ⚠️ ANTES DE EJECUTAR:
 * 1. Activa CleanVPN en tu Mac
 * 2. Selecciona un país (ej: Colombia)
 */

import { duplicateVideo } from './video-processor';
import { generateDescriptions } from './description-generator';
import { publishToTikTok } from './tiktok-publisher';
import { TEST_ACCOUNTS, PATHS } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Cargar variables de entorno
import 'dotenv/config';

async function runTest(videoPath: string, baseDescription: string) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           ContentHub - Prueba de Distribución                ║
╚══════════════════════════════════════════════════════════════╝

⚠️  VERIFICACIÓN PREVIA:
    ✓ ¿CleanVPN está activa? 
    ✓ ¿Seleccionaste un país?

Presiona Ctrl+C para cancelar si no está lista la VPN.
Continuando en 5 segundos...
  `);

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verificar que el video existe
    if (!fs.existsSync(videoPath)) {
        console.error(`❌ Video no encontrado: ${videoPath}`);
        process.exit(1);
    }

    const accountCount = TEST_ACCOUNTS.length;
    console.log(`\n📋 Configuración:`);
    console.log(`   Video: ${videoPath}`);
    console.log(`   Descripción: "${baseDescription.substring(0, 50)}..."`);
    console.log(`   Cuentas: ${accountCount}`);
    console.log('');

    // Paso 1: Duplicar video
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 PASO 1: Duplicando video...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const duplicateResult = await duplicateVideo({
        inputPath: videoPath,
        outputDir: PATHS.processed,
        copies: accountCount
    });

    if (!duplicateResult.success) {
        console.error(`❌ Error duplicando video: ${duplicateResult.error}`);
        process.exit(1);
    }
    console.log(`✅ ${duplicateResult.outputPaths.length} copias creadas\n`);

    // Paso 2: Generar descripciones
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ PASO 2: Generando descripciones con IA...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const descriptionsResult = await generateDescriptions({
        baseDescription,
        copies: accountCount,
        language: 'español'
    });

    if (!descriptionsResult.success) {
        console.error(`❌ Error generando descripciones: ${descriptionsResult.error}`);
        process.exit(1);
    }

    console.log(`✅ ${descriptionsResult.descriptions.length} descripciones generadas:`);
    descriptionsResult.descriptions.forEach((desc, i) => {
        console.log(`   ${i + 1}. ${desc.substring(0, 60)}...`);
    });
    console.log('');

    // Paso 3: Publicar en cada cuenta
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 PASO 3: Publicando en TikTok...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const results: { account: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
        const account = TEST_ACCOUNTS[i];
        const videoFile = duplicateResult.outputPaths[i];
        const description = descriptionsResult.descriptions[i];

        console.log(`\n📤 [${i + 1}/${accountCount}] Publicando en @${account.username}...`);
        console.log(`   Video: ${path.basename(videoFile)}`);

        const publishResult = await publishToTikTok({
            videoPath: videoFile,
            description,
            credentials: {
                username: account.email,
                password: account.password
            },
            sessionDir: PATHS.sessions
        });

        results.push({
            account: account.username,
            success: publishResult.success,
            error: publishResult.error
        });

        if (publishResult.success) {
            console.log(`   ✅ ¡Publicado exitosamente!`);
            if (publishResult.postUrl) {
                console.log(`   🔗 URL: ${publishResult.postUrl}`);
            }
        } else {
            console.log(`   ❌ Error: ${publishResult.error}`);
        }

        // Delay entre publicaciones
        if (i < TEST_ACCOUNTS.length - 1) {
            const delay = Math.floor(Math.random() * 20) + 30; // 30-50 segundos
            console.log(`   ⏳ Esperando ${delay}s antes de la siguiente cuenta...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    }

    // Resumen final
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMEN FINAL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const successCount = results.filter(r => r.success).length;
    console.log(`\nResultados: ${successCount}/${accountCount} exitosos\n`);

    results.forEach((r, i) => {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} @${r.account}: ${r.success ? 'Publicado' : r.error}`);
    });

    console.log('\n🎉 Prueba completada!');
}

// Main
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log(`
ContentHub - Test de Distribución
==================================

Uso: npx ts-node test-distribution.ts <video.mp4> "<descripción base>"

Ejemplo:
  npx ts-node test-distribution.ts ./mi_video.mp4 "Este es un video increíble sobre productividad"

⚠️ Recuerda activar CleanVPN antes de ejecutar!
  `);
    process.exit(0);
}

const [videoPath, description] = args;
runTest(videoPath, description).catch(console.error);
