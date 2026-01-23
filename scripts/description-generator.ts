/**
 * ContentHub - Description Generator
 * Genera descripciones únicas usando Gemini AI
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Soporta ambos nombres de variable para flexibilidad
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

interface GenerateOptions {

    baseDescription: string;
    copies: number;
    niche?: string;
    language?: string;
}

interface GenerateResult {
    success: boolean;
    descriptions: string[];
    error?: string;
}

/**
 * Genera múltiples variaciones de una descripción para TikTok
 */
export async function generateDescriptions(options: GenerateOptions): Promise<GenerateResult> {
    const { baseDescription, copies, niche = 'general', language = 'español' } = options;

    if (!GEMINI_API_KEY) {
        return { success: false, descriptions: [], error: 'Gemini API key not configured' };
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

        const prompt = `Genera exactamente ${copies} variaciones diferentes de la siguiente descripción para TikTok.

DESCRIPCIÓN BASE:
"${baseDescription}"

REQUISITOS PARA CADA VARIACIÓN:
1. Mantén el mensaje principal y la intención
2. Usa emojis diferentes en cada una (2-4 emojis por descripción)
3. Varía el orden de las frases
4. Cambia algunas palabras por sinónimos
5. Incluye 3-5 hashtags relevantes al final (pueden variar entre descripciones)
6. Máximo 150 caracteres por descripción (sin contar hashtags)
7. El idioma debe ser ${language}
8. El nicho/tema es: ${niche}

FORMATO DE RESPUESTA:
Devuelve SOLO un JSON array con las descripciones, sin explicaciones adicionales.
Ejemplo: ["descripción 1...", "descripción 2...", "descripción 3..."]

IMPORTANTE: El JSON debe ser válido y parseable.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Extraer el JSON del response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            return { success: false, descriptions: [], error: 'Could not parse AI response as JSON' };
        }

        const descriptions = JSON.parse(jsonMatch[0]) as string[];

        if (descriptions.length !== copies) {
            console.warn(`Warning: Requested ${copies} descriptions but got ${descriptions.length}`);
        }

        return { success: true, descriptions };
    } catch (error: any) {
        return { success: false, descriptions: [], error: error.message };
    }
}

// CLI para testing
if (require.main === module) {
    const testDescription = process.argv[2] || 'Este es un video increíble sobre productividad';
    const copies = parseInt(process.argv[3]) || 2;

    console.log(`Generating ${copies} descriptions for: "${testDescription}"\n`);

    generateDescriptions({
        baseDescription: testDescription,
        copies,
        niche: 'productividad',
        language: 'español'
    }).then(result => {
        if (result.success) {
            console.log('✅ Generated descriptions:\n');
            result.descriptions.forEach((desc, i) => {
                console.log(`${i + 1}. ${desc}\n`);
            });
        } else {
            console.error('❌ Error:', result.error);
        }
    });
}
