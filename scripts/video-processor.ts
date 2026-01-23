/**
 * ContentHub - Video Processor
 * Duplica videos con FFmpeg para crear copias únicas
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface ProcessOptions {
    inputPath: string;
    outputDir: string;
    copies: number;
}

interface ProcessResult {
    success: boolean;
    outputPaths: string[];
    error?: string;
}

/**
 * Genera copias únicas de un video usando FFmpeg
 * Cada copia tiene:
 * - Ruido imperceptible diferente
 * - Metadata único
 * - Bitrate ligeramente variable
 */
export async function duplicateVideo(options: ProcessOptions): Promise<ProcessResult> {
    const { inputPath, outputDir, copies } = options;
    const outputPaths: string[] = [];

    // Verificar que el archivo existe
    if (!fs.existsSync(inputPath)) {
        return { success: false, outputPaths: [], error: `Input file not found: ${inputPath}` };
    }

    // Crear directorio de salida si no existe
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        for (let i = 0; i < copies; i++) {
            const uniqueId = uuidv4().slice(0, 8);
            const timestamp = Date.now();
            const outputFileName = `video_${uniqueId}_${timestamp}.mp4`;
            const outputPath = path.join(outputDir, outputFileName);

            // Parámetros variables para cada copia
            const noiseLevel = 1 + (i * 0.5); // 1, 1.5, 2, 2.5...
            const bitrate = 2000 + (i * 100); // 2000k, 2100k, 2200k...

            const ffmpegCommand = `ffmpeg -i "${inputPath}" \
        -vf "noise=c0s=${noiseLevel}:c0f=u" \
        -metadata title="ContentHub_${uniqueId}" \
        -metadata creation_time="${new Date().toISOString()}" \
        -metadata comment="Unique copy ${i + 1}" \
        -b:v ${bitrate}k \
        -y \
        "${outputPath}"`;

            console.log(`Processing copy ${i + 1}/${copies}...`);
            await execAsync(ffmpegCommand);
            outputPaths.push(outputPath);
            console.log(`✅ Copy ${i + 1} created: ${outputFileName}`);
        }

        return { success: true, outputPaths };
    } catch (error: any) {
        return { success: false, outputPaths, error: error.message };
    }
}

// Función para obtener información del video
export async function getVideoInfo(inputPath: string): Promise<{ duration: number; size: number } | null> {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration,size -of json "${inputPath}"`
        );
        const info = JSON.parse(stdout);
        return {
            duration: parseFloat(info.format.duration),
            size: parseInt(info.format.size)
        };
    } catch {
        return null;
    }
}

// CLI para testing
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: npx ts-node video-processor.ts <input.mp4> <copies>');
        process.exit(1);
    }

    const inputPath = args[0];
    const copies = parseInt(args[1]) || 2;
    const outputDir = path.join(path.dirname(inputPath), 'processed');

    duplicateVideo({ inputPath, outputDir, copies })
        .then(result => {
            if (result.success) {
                console.log('\n🎉 All copies created successfully!');
                result.outputPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
            } else {
                console.error('❌ Error:', result.error);
            }
        });
}
