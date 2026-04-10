/**
 * AI Browser Agent - Uses Gemini Vision to interact with web pages
 *
 * Instead of fragile CSS selectors, this agent:
 * 1. Takes a screenshot of the page
 * 2. Sends it to Gemini with a task description
 * 3. Gemini returns the action to take (click coordinates, type text, etc.)
 * 4. Agent executes the action via Playwright
 * 5. Repeat until task is complete
 *
 * This replaces all hardcoded selectors with AI-driven interaction.
 */

import { Page } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_CONFIG } from './config';
import 'dotenv/config';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface AgentAction {
    type: 'click' | 'type' | 'key' | 'select' | 'scroll' | 'wait' | 'done' | 'error';
    x?: number;
    y?: number;
    text?: string;
    description?: string;
    error?: string;
}

const genAI = new GoogleGenerativeAI(GEMINI_CONFIG.apiKey);

// gemini-2.5-flash: free tier = 5 req/min, so we pace at ~4 req/min (15s between steps)
const AI_MODEL = 'gemini-2.5-flash';

/**
 * Ask Gemini to analyze a screenshot and decide the next action.
 * Includes retry logic for rate limiting (429 errors).
 */
async function analyzeScreenshot(
    screenshotBase64: string,
    task: string,
    context: string,
    previousActions: string[]
): Promise<AgentAction> {
    const model = genAI.getGenerativeModel({ model: AI_MODEL });

    const historyText = previousActions.length > 0
        ? `\nPrevious actions taken:\n${previousActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
        : '';

    const prompt = `You are a browser automation agent. You are looking at a screenshot of a web page.

TASK: ${task}

CONTEXT: ${context}
${historyText}

Analyze the screenshot and decide the NEXT SINGLE action to take. Respond with ONLY a JSON object (no markdown, no backticks):

For clicking an element:
{"type": "click", "x": <pixel_x>, "y": <pixel_y>, "description": "what I'm clicking"}

For typing text into a FOCUSED field (use after clicking the field):
{"type": "type", "text": "<text to type>", "description": "what field I'm typing in"}

For pressing keyboard keys (useful for dropdowns, navigation, closing popups):
{"type": "key", "text": "<key name>", "description": "what this key press does"}
Valid keys: Tab, Enter, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Backspace, Delete

For scrolling down:
{"type": "scroll", "description": "scrolling to see more"}

For waiting (page is loading):
{"type": "wait", "description": "waiting for page to load"}

If the task is COMPLETE (success):
{"type": "done", "description": "what was accomplished"}

If there's an ERROR or the task cannot be completed:
{"type": "error", "error": "description of what went wrong"}

IMPORTANT RULES:
- Return ONLY the JSON object, nothing else
- Click coordinates must be in PIXELS relative to the screenshot
- Be precise with click coordinates - aim for the CENTER of buttons/fields
- For DROPDOWN MENUS: if clicking doesn't open them, try clicking the small arrow/chevron icon. If that doesn't work, try using keyboard: click the dropdown area first, then use ArrowDown/ArrowUp + Enter to select
- If you've tried clicking the same element 3+ times without success, try a DIFFERENT approach (keyboard, different coordinates, scroll first)
- If you need to type, first click the field, THEN in the next action type the text
- If you see a CAPTCHA, respond with: {"type": "error", "error": "captcha_detected"}
- If you see a phone verification prompt, respond with: {"type": "error", "error": "phone_verification_needed"}
- If you see an email verification code input and no code has been entered yet, respond with: {"type": "error", "error": "email_code_needed"}
- NEVER repeat the exact same action more than 3 times. If something isn't working, change your approach.`;

    // Retry up to 3 times with backoff for rate limiting
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = await model.generateContent([
                { text: prompt },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: screenshotBase64,
                    }
                }
            ]);

            const responseText = result.response.text().trim();

            // Extract JSON from response (handle cases where Gemini wraps in markdown)
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }

            const action = JSON.parse(jsonStr) as AgentAction;
            return action;
        } catch (err: any) {
            if (err.message?.includes('429') && attempt < 2) {
                const waitSec = 10 + attempt * 15; // 10s, 25s
                console.log(`[AIAgent] Rate limited — waiting ${waitSec}s before retry ${attempt + 2}/3...`);
                await sleep(waitSec * 1000);
                continue;
            }
            console.error(`[AIAgent] Gemini error: ${err.message?.substring(0, 300)}`);
            return { type: 'error', error: `Gemini API error: ${err.message?.substring(0, 300)}` };
        }
    }
    return { type: 'error', error: 'Gemini API: max retries exhausted' };
}

export interface AIAgentConfig {
    maxSteps: number;
    screenshotDelay: number; // ms to wait before taking screenshot
    actionDelay: number; // ms to wait between actions
    verbose: boolean;
}

const DEFAULT_CONFIG: AIAgentConfig = {
    maxSteps: 30,
    screenshotDelay: 3000,
    actionDelay: 10000, // 10s between steps = ~4 req/min (under 5/min free tier limit)
    verbose: true,
};

export interface AIAgentResult {
    success: boolean;
    steps: number;
    actions: string[];
    error?: string;
    finalUrl?: string;
}

/**
 * Run an AI-driven browser task.
 * The agent takes screenshots and uses Gemini to decide what to do.
 */
export async function runAIAgent(
    page: Page,
    task: string,
    context: string = '',
    config: Partial<AIAgentConfig> = {}
): Promise<AIAgentResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const actions: string[] = [];
    let lastClickTarget = '';

    for (let step = 0; step < cfg.maxSteps; step++) {
        // Wait for page to settle
        await sleep(cfg.screenshotDelay);

        // Take screenshot
        const screenshot = await page.screenshot({ type: 'png' });
        const base64 = screenshot.toString('base64');

        if (cfg.verbose) {
            console.log(`[AIAgent] Step ${step + 1}/${cfg.maxSteps} — analyzing page...`);
        }

        // Ask Gemini what to do
        const action = await analyzeScreenshot(base64, task, context, actions);

        if (cfg.verbose) {
            console.log(`[AIAgent] Action: ${JSON.stringify(action)}`);
        }

        // Execute the action
        switch (action.type) {
            case 'click': {
                if (action.x !== undefined && action.y !== undefined) {
                    // Add slight human randomness to click position
                    const offsetX = humanDelay(-3, 3);
                    const offsetY = humanDelay(-3, 3);
                    await page.mouse.click(action.x + offsetX, action.y + offsetY);
                    lastClickTarget = action.description || `(${action.x}, ${action.y})`;
                    actions.push(`Clicked: ${lastClickTarget}`);
                    await sleep(humanDelay(500, 1000));
                }
                break;
            }

            case 'type': {
                if (action.text) {
                    // Type with human-like speed
                    await page.keyboard.type(action.text, { delay: humanDelay(40, 100) });
                    const masked = action.text.includes('@') ? action.text : action.text.substring(0, 4) + '****';
                    actions.push(`Typed: "${masked}" in ${action.description || lastClickTarget}`);
                    await sleep(humanDelay(300, 600));
                }
                break;
            }

            case 'key': {
                if (action.text) {
                    await page.keyboard.press(action.text);
                    actions.push(`Key pressed: ${action.text} — ${action.description || ''}`);
                    await sleep(humanDelay(300, 600));
                }
                break;
            }

            case 'select': {
                actions.push(`Selected: ${action.description || 'option'}`);
                break;
            }

            case 'scroll': {
                await page.mouse.wheel(0, 300);
                actions.push(`Scrolled down`);
                await sleep(humanDelay(500, 1000));
                break;
            }

            case 'wait': {
                actions.push(`Waiting: ${action.description || 'page loading'}`);
                await sleep(3000);
                break;
            }

            case 'done': {
                actions.push(`Done: ${action.description}`);
                if (cfg.verbose) {
                    console.log(`[AIAgent] Task complete: ${action.description}`);
                }
                return {
                    success: true,
                    steps: step + 1,
                    actions,
                    finalUrl: page.url(),
                };
            }

            case 'error': {
                actions.push(`Error: ${action.error}`);
                if (cfg.verbose) {
                    console.log(`[AIAgent] Error: ${action.error}`);
                }
                return {
                    success: false,
                    steps: step + 1,
                    actions,
                    error: action.error,
                    finalUrl: page.url(),
                };
            }
        }

        // Delay between actions
        await sleep(cfg.actionDelay);
    }

    return {
        success: false,
        steps: cfg.maxSteps,
        actions,
        error: 'Max steps reached without completing task',
        finalUrl: page.url(),
    };
}

/**
 * Convenience: Run a multi-phase task.
 * Each phase is a separate AI agent call with its own task description.
 * Useful for signup flows: phase1=fill form, phase2=enter code, phase3=set profile
 */
export async function runMultiPhaseTask(
    page: Page,
    phases: { task: string; context: string; maxSteps?: number }[],
    config: Partial<AIAgentConfig> = {}
): Promise<AIAgentResult> {
    const allActions: string[] = [];
    let totalSteps = 0;

    for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        console.log(`\n[AIAgent] === Phase ${i + 1}/${phases.length}: ${phase.task.substring(0, 60)}... ===`);

        const result = await runAIAgent(page, phase.task, phase.context, {
            ...config,
            maxSteps: phase.maxSteps || config.maxSteps || 15,
        });

        allActions.push(...result.actions);
        totalSteps += result.steps;

        if (!result.success) {
            return {
                success: false,
                steps: totalSteps,
                actions: allActions,
                error: `Phase ${i + 1} failed: ${result.error}`,
                finalUrl: result.finalUrl,
            };
        }
    }

    return {
        success: true,
        steps: totalSteps,
        actions: allActions,
        finalUrl: page.url(),
    };
}
