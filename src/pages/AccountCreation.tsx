import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Copy, Globe, Clock, Mail, UserPlus, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
    startManualCreation,
    completeManualCreation,
    cancelManualCreation,
    getEmailInbox,
    type ManualCreationSession,
    type EmailCode,
} from '../services/accountCreation';
import './AccountCreation.css';

type PageState = 'idle' | 'starting' | 'active' | 'completing' | 'completed' | 'error';

export const AccountCreation: React.FC = () => {
    const [state, setState] = useState<PageState>('idle');
    const [platform, setPlatform] = useState<string>('tiktok');
    const [session, setSession] = useState<ManualCreationSession | null>(null);
    const [codes, setCodes] = useState<EmailCode[]>([]);
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [copiedField, setCopiedField] = useState('');
    const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes in seconds
    const startTimeRef = useRef<number>(0);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // Cancel on page unload
    useEffect(() => {
        const handleUnload = () => {
            if (session?.accountId && state === 'active') {
                navigator.sendBeacon(
                    `${session.liveViewUrl ? '' : ''}`,
                    // Can't reliably cancel on unload — account will be cleaned up by timeout
                );
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [session, state]);

    // Email inbox polling
    useEffect(() => {
        if (state === 'active' && session?.email) {
            const poll = async () => {
                const inbox = await getEmailInbox(session.email);
                setCodes(inbox);
            };
            poll(); // immediate first call
            pollingRef.current = setInterval(poll, 5000);
            return () => {
                if (pollingRef.current) clearInterval(pollingRef.current);
            };
        }
    }, [state, session?.email]);

    // Session timer
    useEffect(() => {
        if (state === 'active') {
            startTimeRef.current = Date.now();
            timerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                const remaining = Math.max(0, 30 * 60 - elapsed);
                setTimeLeft(remaining);
                if (remaining === 0) {
                    setState('error');
                    setError('La sesion ha expirado (30 minutos). Inicia una nueva.');
                }
            }, 1000);
            return () => {
                if (timerRef.current) clearInterval(timerRef.current);
            };
        }
    }, [state]);

    const handleStart = useCallback(async () => {
        setState('starting');
        setError('');
        try {
            const result = await startManualCreation(platform);
            setSession(result);
            setState('active');
            setTimeLeft(30 * 60);
        } catch (err: any) {
            setError(err.message);
            setState('error');
        }
    }, [platform]);

    const handleComplete = useCallback(async () => {
        if (!session || !username.trim()) return;
        setState('completing');
        try {
            await completeManualCreation(session.accountId, username.trim());
            setState('completed');
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        } catch (err: any) {
            setError(err.message);
            setState('error');
        }
    }, [session, username]);

    const handleCancel = useCallback(async () => {
        if (!session) return;
        try {
            await cancelManualCreation(session.accountId);
        } catch { /* best effort */ }
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setSession(null);
        setCodes([]);
        setUsername('');
        setState('idle');
    }, [session]);

    const handleReset = useCallback(() => {
        setSession(null);
        setCodes([]);
        setUsername('');
        setError('');
        setState('idle');
    }, []);

    const copyToClipboard = useCallback((text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(''), 2000);
    }, []);

    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatTimestamp = (ts: string): string => {
        const d = new Date(ts);
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // ========================================
    // IDLE STATE
    // ========================================
    if (state === 'idle') {
        return (
            <div className="creation-page">
                <div className="creation-header">
                    <h1>Crear Cuenta</h1>
                </div>
                <div className="idle-container">
                    <UserPlus size={48} style={{ color: 'var(--color-primary)' }} />
                    <h2>Crear Nueva Cuenta</h2>
                    <p>
                        Se abrira un navegador cloud con proxy residencial donde podras crear la cuenta manualmente.
                        El sistema captura automaticamente las credenciales y los codigos de verificacion por email.
                    </p>
                    <div className="creation-controls">
                        <select className="platform-select" value={platform} onChange={e => setPlatform(e.target.value)}>
                            <option value="tiktok">TikTok</option>
                            <option value="instagram">Instagram</option>
                            <option value="youtube">YouTube</option>
                        </select>
                        <button className="btn btn-primary" onClick={handleStart}>
                            Iniciar Creacion
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========================================
    // STARTING STATE
    // ========================================
    if (state === 'starting') {
        return (
            <div className="creation-page">
                <div className="creation-header">
                    <h1>Crear Cuenta</h1>
                </div>
                <div className="loading-overlay">
                    <div className="spinner" />
                    <p>Iniciando sesion de navegador con proxy residencial...</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
                        Esto puede tardar 15-30 segundos
                    </p>
                </div>
            </div>
        );
    }

    // ========================================
    // ERROR STATE
    // ========================================
    if (state === 'error') {
        return (
            <div className="creation-page">
                <div className="creation-header">
                    <h1>Crear Cuenta</h1>
                </div>
                <div className="idle-container">
                    <XCircle size={48} style={{ color: 'var(--color-error)' }} />
                    <h2>Error</h2>
                    <p style={{ color: 'var(--color-error)' }}>{error}</p>
                    <button className="btn btn-primary" onClick={handleReset}>
                        Intentar de Nuevo
                    </button>
                </div>
            </div>
        );
    }

    // ========================================
    // COMPLETED STATE
    // ========================================
    if (state === 'completed') {
        return (
            <div className="creation-page">
                <div className="creation-header">
                    <h1>Crear Cuenta</h1>
                </div>
                <div className="success-container">
                    <CheckCircle className="success-icon" />
                    <h2>Cuenta Creada Exitosamente</h2>
                    <p>
                        <strong>@{username}</strong> ({platform}) ha sido registrada y esta lista para warmup y publicacion.
                    </p>
                    <button className="btn btn-primary" onClick={handleReset}>
                        Crear Otra Cuenta
                    </button>
                </div>
            </div>
        );
    }

    // ========================================
    // ACTIVE STATE (two-panel workspace)
    // ========================================
    const timerClass = timeLeft < 60 ? 'timer danger' : timeLeft < 300 ? 'timer warning' : 'timer';

    return (
        <div className="creation-page">
            <div className="creation-header">
                <h1>Crear Cuenta — {platform.charAt(0).toUpperCase() + platform.slice(1)}</h1>
                <div className="creation-controls">
                    <span className={timerClass}>
                        <Clock size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {formatTime(timeLeft)}
                    </span>
                    <button className="btn btn-ghost" onClick={handleCancel} style={{ color: 'var(--color-error)' }}>
                        Cancelar
                    </button>
                </div>
            </div>

            <div className="creation-workspace">
                {/* Left panel: Live View */}
                <div className="live-view-panel">
                    <div className="panel-header">
                        <Globe size={14} />
                        Navegador Cloud — Proxy Residencial
                    </div>
                    {session?.liveViewUrl ? (
                        <iframe
                            className="live-view-iframe"
                            src={session.liveViewUrl}
                            allow="clipboard-read; clipboard-write"
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                        />
                    ) : (
                        <div className="loading-overlay">
                            <Loader2 size={24} className="spinner" />
                            <p>Cargando navegador...</p>
                        </div>
                    )}
                </div>

                {/* Right panel: Data + Inbox + Status + Completion */}
                <div className="side-panel">
                    {/* Credentials */}
                    <div className="credential-card">
                        <h3>Datos de la Cuenta</h3>
                        <div className="credential-row">
                            <span className="credential-label">Email</span>
                            <span className="credential-value">{session?.email}</span>
                            <button
                                className={`copy-btn ${copiedField === 'email' ? 'copied' : ''}`}
                                onClick={() => session && copyToClipboard(session.email, 'email')}
                            >
                                {copiedField === 'email' ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                        </div>
                        <div className="credential-row">
                            <span className="credential-label">Password</span>
                            <span className="credential-value">{session?.password}</span>
                            <button
                                className={`copy-btn ${copiedField === 'password' ? 'copied' : ''}`}
                                onClick={() => session && copyToClipboard(session.password, 'password')}
                            >
                                {copiedField === 'password' ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                        </div>
                    </div>

                    {/* Email Inbox */}
                    <div className="inbox-card">
                        <h3>
                            <Mail size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Bandeja de Email
                        </h3>
                        {codes.length === 0 ? (
                            <div className="inbox-empty">
                                Esperando codigos de verificacion...
                                <br />
                                <span style={{ fontSize: '0.7rem' }}>(se actualiza cada 5 segundos)</span>
                            </div>
                        ) : (
                            codes.map((c, i) => (
                                <div key={i} className="inbox-item">
                                    <div>
                                        <div className="inbox-code">{c.code}</div>
                                        <div className="inbox-time">{formatTimestamp(c.received_at)}</div>
                                    </div>
                                    <button
                                        className={`copy-btn ${copiedField === `code-${i}` ? 'copied' : ''}`}
                                        onClick={() => copyToClipboard(c.code, `code-${i}`)}
                                    >
                                        {copiedField === `code-${i}` ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Session Status */}
                    <div className="status-card">
                        <div className="status-row">
                            <span className="status-label">Proxy</span>
                            <span className="status-value">{session?.proxyIp || 'Sin proxy'}</span>
                        </div>
                        <div className="status-row">
                            <span className="status-label">Estado</span>
                            <span className="status-value">
                                <span className={`status-dot ${timeLeft > 0 ? 'active' : 'expired'}`} />
                                {timeLeft > 0 ? 'Activa' : 'Expirada'}
                            </span>
                        </div>
                    </div>

                    {/* Completion */}
                    <div className="completion-card">
                        <h3>Finalizar Creacion</h3>
                        <input
                            className="username-input"
                            type="text"
                            placeholder="Username de la cuenta creada"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleComplete}
                            disabled={!username.trim() || state === 'completing'}
                            style={{ width: '100%' }}
                        >
                            {state === 'completing' ? (
                                <>
                                    <Loader2 size={16} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={16} style={{ marginRight: 6 }} />
                                    Cuenta Creada
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
