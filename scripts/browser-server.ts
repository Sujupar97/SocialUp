
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import puppeteer from 'puppeteer';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3001;

// Store active sessions if needed, though for now simple 1:1 WS connection is enough
// Map<string, Browser> ...

wss.on('connection', async (ws: WebSocket, req) => {
    console.log('New Client Connected');

    // Parse query params for config
    // url: connection url (e.g. ws://localhost:3001?proxy=...&username=...)
    // BUT basic auth or query params are visible. Ideally passed in first message?
    // Let's use query params for MVP simplicity or a secure token.
    // For now: first message from client must be "CONFIG"

    let browser: any = null;
    let page: any = null;
    let client: any = null; // CDP Session

    ws.on('message', async (message) => {
        try {
            const msg = JSON.parse(message.toString());

            if (msg.type === 'INIT') {
                await handleInit(msg, ws);
            } else if (msg.type === 'MOUSE') {
                if (client) {
                    await client.send('Input.dispatchMouseEvent', msg.data);
                }
            } else if (msg.type === 'KEY') {
                if (client) {
                    await client.send('Input.dispatchKeyEvent', msg.data);
                }
            } else if (msg.type === 'SCROLL') {
                if (client) {
                    // Synthetic scroll via wheel event
                    await client.send('Input.dispatchMouseEvent', {
                        type: 'mouseWheel',
                        x: msg.data.x,
                        y: msg.data.y,
                        deltaX: msg.data.deltaX,
                        deltaY: msg.data.deltaY
                    });
                }
            } else if (msg.type === 'NAVIGATE') {
                if (page) {
                    await page.goto(msg.url);
                }
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', async () => {
        console.log('Client Disconnected. Closing Browser.');
        if (browser) await browser.close();
    });

    async function handleInit(config: any, socket: WebSocket) {
        console.log('Initializing Browser Session for:', config.proxyUrl || 'Direct Connection');

        try {
            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1280,720',
                '--disable-infobars',
                '--hide-scrollbars'
            ];

            if (config.proxyUrl) {
                launchArgs.push(`--proxy-server=${config.proxyUrl}`);
            }

            browser = await puppeteer.launch({
                headless: true, // "new" is deprecated, true is the standard for new headless
                args: launchArgs,
                ignoreDefaultArgs: ['--enable-automation']
            });

            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });

            // Apply Proxy Auth if needed
            if (config.proxyUsername && config.proxyPassword) {
                await page.authenticate({
                    username: config.proxyUsername,
                    password: config.proxyPassword
                });
            }

            // Go to initial page (Target Platform)
            // If proxy is active, maybe checkip first or go straight to TikTok
            const targetUrl = 'https://www.tiktok.com/login';
            console.log(`Navigating to ${targetUrl}...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle2' });

            // Start CDP Session for Screencast
            client = await page.target().createCDPSession();
            console.log('Starting CDP Screencast...');

            await client.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 80,
                maxWidth: 1280,
                maxHeight: 720,
                everyNthFrame: 1
            });

            client.on('Page.screencastFrame', async (frameObj: any) => {
                const { data, sessionId, metadata } = frameObj;
                try {
                    // Send frame data
                    socket.send(JSON.stringify({
                        type: 'FRAME',
                        data: data,
                        metadata: metadata
                    }));

                    // Ack frame
                    await client.send('Page.screencastFrameAck', { sessionId });
                } catch (e) {
                    // Client might have closed
                }
            });

            console.log('Browser Started & Streaming');
            // Allow a small delay for first frame, then ready
            setTimeout(() => {
                socket.send(JSON.stringify({ type: 'READY' }));
            }, 500);

        } catch (err) {
            console.error('Failed to launch browser:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            socket.send(JSON.stringify({ type: 'ERROR', message: errorMessage }));
            socket.close();
        }
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'ContentHub Browser Manager' });
});

server.listen(PORT, () => {
    console.log(`Browser Manager running on http://localhost:${PORT}`);
    console.log(`WebSocket Endpoint: ws://localhost:${PORT}`);
});
