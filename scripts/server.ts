/**
 * ContentHub - Local Automation Server
 * Servidor Express que maneja la orquestación automática
 * 
 * Este servidor:
 * 1. Recibe videos del frontend
 * 2. Los duplica con FFmpeg
 * 3. Genera descripciones con Gemini
 * 4. Publica en TikTok con Playwright
 */

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { duplicateVideo } from './video-processor';
import { generateDescriptions } from './description-generator';
import { publishToTikTok } from './tiktok-publisher';
import { TEST_ACCOUNTS, PATHS } from './config';
import 'dotenv/config';

const app = express();
const PORT = 3001;

// Configurar multer para uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, PATHS.uploads);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de video'));
        }
    },
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

app.use(cors());
app.use(express.json());

// Estado de los jobs
const jobs: Map<string, {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message: string;
    results: any[];
    createdAt: Date;
}> = new Map();

/**
 * POST /api/distribute
 * Endpoint principal para iniciar distribución
 */
app.post('/api/distribute', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se recibió ningún video' });
        }

        const { description, ctaType, ctaContent } = req.body;
        const videoPath = req.file.path;
        const jobId = `job_${Date.now()}`;

        // Crear job
        jobs.set(jobId, {
            id: jobId,
            status: 'pending',
            progress: 0,
            message: 'Iniciando procesamiento...',
            results: [],
            createdAt: new Date()
        });

        // Responder inmediatamente con el jobId
        res.json({
            success: true,
            jobId,
            message: 'Distribución iniciada. El proceso continuará en segundo plano.'
        });

        // Procesar en segundo plano
        processDistribution(jobId, videoPath, description || '', TEST_ACCOUNTS);

    } catch (error: any) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/status/:jobId
 * Obtener estado de un job
 */
app.get('/api/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job no encontrado' });
    }
    res.json(job);
});

/**
 * Procesa la distribución en segundo plano
 */
async function processDistribution(
    jobId: string,
    videoPath: string,
    description: string,
    accounts: typeof TEST_ACCOUNTS
) {
    const job = jobs.get(jobId)!;

    try {
        // Paso 1: Duplicar video
        job.status = 'processing';
        job.message = 'Duplicando video...';
        job.progress = 10;

        console.log(`\n📦 [${jobId}] Duplicando video...`);
        const duplicateResult = await duplicateVideo({
            inputPath: videoPath,
            outputDir: path.join(__dirname, PATHS.processed),
            copies: accounts.length
        });

        if (!duplicateResult.success) {
            throw new Error(`Error duplicando: ${duplicateResult.error}`);
        }

        job.progress = 30;
        job.message = `${duplicateResult.outputPaths.length} copias creadas. Generando descripciones...`;
        console.log(`✅ [${jobId}] ${duplicateResult.outputPaths.length} copias creadas`);

        // Paso 2: Generar descripciones
        console.log(`✨ [${jobId}] Generando descripciones con IA...`);
        const descriptionsResult = await generateDescriptions({
            baseDescription: description,
            copies: accounts.length,
            language: 'español'
        });

        if (!descriptionsResult.success) {
            throw new Error(`Error generando descripciones: ${descriptionsResult.error}`);
        }

        job.progress = 50;
        job.message = 'Descripciones generadas. Iniciando publicación en TikTok...';
        console.log(`✅ [${jobId}] ${descriptionsResult.descriptions.length} descripciones generadas`);

        // Paso 3: Publicar en cada cuenta
        const results: any[] = [];

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const uniqueVideoPath = duplicateResult.outputPaths[i];
            const uniqueDescription = descriptionsResult.descriptions[i] || description;

            job.message = `Publicando en @${account.username} (${i + 1}/${accounts.length})...`;
            job.progress = 50 + Math.round((i / accounts.length) * 45);

            console.log(`📤 [${jobId}] Publicando en @${account.username}...`);

            const publishResult = await publishToTikTok({
                videoPath: uniqueVideoPath,
                description: uniqueDescription,
                credentials: {
                    username: account.email,
                    password: account.password
                },
                sessionDir: path.join(__dirname, PATHS.sessions)
            });

            results.push({
                account: account.username,
                success: publishResult.success,
                postUrl: publishResult.postUrl,
                error: publishResult.error
            });

            if (publishResult.success) {
                console.log(`✅ [${jobId}] Publicado en @${account.username}`);
            } else {
                console.log(`❌ [${jobId}] Error en @${account.username}: ${publishResult.error}`);
            }

            // Delay entre publicaciones
            if (i < accounts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30 segundos
            }
        }

        // Finalizar
        job.status = 'completed';
        job.progress = 100;
        job.results = results;
        const successCount = results.filter(r => r.success).length;
        job.message = `Completado: ${successCount}/${accounts.length} publicaciones exitosas`;

        console.log(`\n🎉 [${jobId}] Distribución completada: ${successCount}/${accounts.length}`);

    } catch (error: any) {
        console.error(`❌ [${jobId}] Error:`, error.message);
        job.status = 'failed';
        job.message = error.message;
    }
}

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║          ContentHub Automation Server                        ║
╚══════════════════════════════════════════════════════════════╝

🚀 Servidor corriendo en: http://localhost:${PORT}

Endpoints:
  POST /api/distribute  - Iniciar distribución de video
  GET  /api/status/:id  - Consultar estado de un job

⚠️  Recuerda activar CleanVPN antes de distribuir!
  `);
});

export default app;
