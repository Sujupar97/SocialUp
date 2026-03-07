import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Command, X } from 'lucide-react';
import { Button } from '../ui';
import './CloudBrowser.css';

interface CloudBrowserProps {
    proxyUrl: string;
    proxyUsername?: string;
    proxyPassword?: string;
    onClose: () => void;
}

export const CloudBrowser: React.FC<CloudBrowserProps> = ({ proxyUrl, proxyUsername, proxyPassword, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'CONNECTING' | 'READY' | 'ERROR'>('CONNECTING');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Fixed resolution for the browser
    const VIEWPORT_WIDTH = 1280;
    const VIEWPORT_HEIGHT = 720;

    useEffect(() => {
        const wsUrl = import.meta.env.VITE_BROWSER_SERVER_WS || '';
        if (!wsUrl) {
            setErrorMsg('Browser server URL not configured. Set VITE_BROWSER_SERVER_WS in .env');
            setStatus('ERROR');
            return;
        }
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to Cloud Browser Server');
            // Send Init Config
            ws.send(JSON.stringify({
                type: 'INIT',
                proxyUrl,
                proxyUsername,
                proxyPassword
            }));
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'FRAME') {
                const img = new Image();
                img.onload = () => {
                    const ctx = canvasRef.current?.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
                    }
                };
                img.src = 'data:image/jpeg;base64,' + msg.data;
            } else if (msg.type === 'READY') {
                setStatus('READY');
            } else if (msg.type === 'ERROR') {
                setErrorMsg(msg.message);
                setStatus('ERROR');
            }
        };

        ws.onerror = (err) => {
            console.error('WebSocket Error:', err);
            // Don't show error immediately on simple disconnects, wait for close or timeout
        };

        ws.onclose = () => {
            console.log('Disconnected');
            if (status !== 'ERROR') {
                setErrorMsg('Conexión cerrada por el servidor.');
                setStatus('ERROR');
            }
        };

        return () => {
            ws.close();
        };
    }, [proxyUrl, proxyUsername, proxyPassword]);

    // Input Handling - Precise Mapping
    const getScaledCoordinates = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        // Calculate scale factor
        const scaleX = VIEWPORT_WIDTH / rect.width;
        const scaleY = VIEWPORT_HEIGHT / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        return { x, y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!wsRef.current || status !== 'READY') return;
        const coords = getScaledCoordinates(e);
        if (!coords) return;

        wsRef.current.send(JSON.stringify({
            type: 'MOUSE',
            data: { type: 'mouseMoved', x: coords.x, y: coords.y }
        }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!wsRef.current || status !== 'READY') return;
        const coords = getScaledCoordinates(e);
        if (!coords) return;

        wsRef.current.send(JSON.stringify({
            type: 'MOUSE',
            data: { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 }
        }));
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!wsRef.current || status !== 'READY') return;
        const coords = getScaledCoordinates(e);
        if (!coords) return;

        wsRef.current.send(JSON.stringify({
            type: 'MOUSE',
            data: { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 }
        }));
    };

    // We need a way to capture keys. For now, we can only capture if canvas is focused.
    // A better approach for full input capture involves a hidden textarea, but let's stick to simple keys for now.
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!wsRef.current || status !== 'READY') return;
        wsRef.current.send(JSON.stringify({
            type: 'KEY',
            data: { type: 'keyDown', text: e.key }
        }));
    };

    return (
        <div className="cloud-browser-overlay">
            <div className="cloud-browser-wrapper">
                {/* Header */}
                <div className="browser-header">
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E]"></div>
                            <div className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E24]"></div>
                            <div className="w-3 h-3 rounded-full bg-[#28C840] border border-[#1AAB29]"></div>
                        </div>
                        <div className="bg-[#1A1D21] px-4 py-1.5 rounded-md text-xs text-gray-400 flex items-center gap-2 border border-[#2A2E35] min-w-[200px] justify-center">
                            <div className={`w-2 h-2 rounded-full ${status === 'READY' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-yellow-500'}`}></div>
                            {status === 'READY' ? 'Navegación Segura Activa' : 'Estableciendo Túnel...'}
                        </div>
                    </div>

                    <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/10">
                        <X size={18} />
                    </Button>
                </div>

                {/* Viewport Container - Fixed Aspect Ratio */}
                <div className="browser-content">
                    {status === 'CONNECTING' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090b] z-10 transition-opacity duration-300">
                            <Loader2 size={48} className="spinning text-[#25F4EE] mb-6" />
                            <h3 className="text-white text-xl font-medium tracking-tight">Iniciando Navegador Remoto</h3>
                            <p className="text-gray-500 text-sm mt-3">Configurando proxy residencial y abriendo sesión...</p>
                        </div>
                    )}

                    {status === 'ERROR' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090b] z-20 p-8 text-center">
                            <div className="bg-red-500/10 p-6 rounded-full mb-6 ring-1 ring-red-500/20">
                                <Command size={48} className="text-red-500" />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-3">Error de Conexión</h3>
                            <p className="text-gray-400 mb-8 max-w-md leading-relaxed">
                                {errorMsg || 'No se pudo establecer conexión con el servidor de navegadores.'}
                            </p>
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                className="px-8 py-6 text-base bg-[#27272a] hover:bg-[#3f3f46] text-white border-none"
                            >
                                Cerrar Ventana
                            </Button>
                        </div>
                    )}

                    {/* Canvas Wrapper for Aspect Ratio */}
                    <div className="relative w-full h-full flex items-center justify-center bg-black">
                        <canvas
                            ref={canvasRef}
                            width={VIEWPORT_WIDTH}
                            height={VIEWPORT_HEIGHT}
                            className="max-w-full max-h-full object-contain cursor-none outline-none shadow-2xl"
                            style={{ aspectRatio: '16/9' }}
                            onMouseMove={handleMouseMove}
                            onMouseDown={handleMouseDown}
                            onMouseUp={handleMouseUp}
                            tabIndex={0}
                            onKeyDown={handleKeyDown}
                        />

                        {/* Custom Cursor Overlay */}
                        {status === 'READY' && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100">
                                {/* Optional: Render custom cursor if needed, but 'cursor-none' hides default */}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
