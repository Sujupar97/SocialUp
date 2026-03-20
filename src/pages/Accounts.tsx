import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Check, X, Loader2, AlertCircle, Trash2, Zap, Youtube } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { getAccounts, toggleAccountStatus, deleteAccount } from '../services/accounts';
import { initiateTikTokAuth, handleAuthCallback } from '../services/tiktokAuth';
import { initiateYouTubeAuth, handleYouTubeCallback, isYouTubeCallback } from '../services/youtubeAuth';
import { ConnectionWizard, type ProxyConfig } from '../components/accounts/ConnectionWizard';
import { CloudBrowser } from '../components/accounts/CloudBrowser';
import { ProxyPoolStatus } from '../components/accounts/ProxyPoolStatus';
import { getAvailableProxies, buildProxyUrl } from '../services/proxyPool';
import { getWarmupDailyStats, triggerWarmup } from '../services/warmup';
import type { Account } from '../types';
import type { WarmupDailyStats } from '../types/warmup';
import './Accounts.css';

// ... (Icons remain same)
const TikTokIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

const InstagramIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
);

const YouTubeIcon = () => (
    <Youtube size={20} />
);

const PlatformIcon = ({ platform }: { platform: string }) => {
    switch (platform) {
        case 'tiktok': return <TikTokIcon />;
        case 'youtube': return <YouTubeIcon />;
        case 'instagram': return <InstagramIcon />;
        default: return <TikTokIcon />;
    }
};

export const Accounts: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingAuth, setProcessingAuth] = useState(false);
    const [authPlatform, setAuthPlatform] = useState<string>('');
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [error, setError] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [showProxyWizard, setShowProxyWizard] = useState(false);
    const [autoProxy, setAutoProxy] = useState<ProxyConfig | null>(null);
    const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
    const [warmupStats, setWarmupStats] = useState<Record<string, WarmupDailyStats>>({});
    const menuRef = useRef<HTMLDivElement>(null);
    const [searchParams] = useSearchParams();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cargar cuentas y verificar callback de OAuth (TikTok o YouTube)
    useEffect(() => {
        const checkAuthAndLoad = async () => {
            const code = searchParams.get('code');
            const state = searchParams.get('state');

            if (code) {
                setProcessingAuth(true);
                window.history.replaceState({}, '', '/accounts');

                try {
                    if (isYouTubeCallback(searchParams)) {
                        setAuthPlatform('YouTube');
                        await handleYouTubeCallback(code, state || '');
                    } else {
                        setAuthPlatform('TikTok');
                        await handleAuthCallback(code);
                    }
                    await loadAccounts();
                } catch (err) {
                    setError(`Error conectando con ${authPlatform || 'la plataforma'}`);
                } finally {
                    setProcessingAuth(false);
                    setAuthPlatform('');
                }
            } else {
                await loadAccounts();
            }
        };

        checkAuthAndLoad();
    }, [searchParams]);

    const loadAccounts = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getAccounts();
            setAccounts(data);

            // Load warmup stats
            const stats = await getWarmupDailyStats();
            const statsMap: Record<string, WarmupDailyStats> = {};
            for (const s of stats) {
                statsMap[s.account_id] = s;
            }
            setWarmupStats(statsMap);
        } catch (err) {
            console.error('Error loading accounts:', err);
            setError('Error al cargar las cuentas');
        } finally {
            setLoading(false);
        }
    };

    const handleTriggerWarmup = async (accountId: string) => {
        const result = await triggerWarmup(accountId);
        if (result.success) {
            // Update stats to show running
            setWarmupStats(prev => ({
                ...prev,
                [accountId]: {
                    ...prev[accountId],
                    sessions_running: (prev[accountId]?.sessions_running || 0) + 1,
                },
            }));
        }
    };

    const handleConnectTikTok = async () => {
        // Try to auto-assign a proxy from the pool
        try {
            const available = await getAvailableProxies();
            if (available.length > 0) {
                const proxy = available[0];
                setAutoProxy({
                    url: buildProxyUrl(proxy),
                    username: proxy.username || undefined,
                    password: proxy.password || undefined,
                });
            } else {
                setAutoProxy(null);
            }
        } catch {
            setAutoProxy(null);
        }
        setShowProxyWizard(true);
    };

    const handleProxyConnect = (proxyConfig: ProxyConfig | null) => {
        setShowProxyWizard(false);
        initiateTikTokAuth(proxyConfig || undefined);
    };

    const handleConnectYouTube = () => {
        initiateYouTubeAuth();
    };

    const handleViewAccount = (account: Account) => {
        setViewingAccount(account);
        setOpenMenuId(null);
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            const updated = await toggleAccountStatus(id, !currentStatus);
            setAccounts(prev => prev.map(a => a.id === id ? updated : a));
        } catch (err) {
            console.error('Error toggling status:', err);
        }
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar esta cuenta?')) return;

        try {
            await deleteAccount(id);
            setAccounts(prev => prev.filter(a => a.id !== id));
            setOpenMenuId(null);
        } catch (err) {
            console.error('Error deleting account:', err);
            setError('Error al eliminar cuenta');
        }
    };

    if (loading && !processingAuth && accounts.length === 0) {
        return (
            <div className="accounts-page">
                <div className="loading-state">
                    <Loader2 size={40} className="spinning" />
                    <p>Cargando cuentas...</p>
                </div>
            </div>
        );
    }

    if (processingAuth) {
        return (
            <div className="accounts-page">
                <div className="loading-state">
                    <Loader2 size={40} className="spinning" />
                    <p>Conectando con {authPlatform || 'la plataforma'}...</p>
                    <span className="text-sm text-gray-500">Estamos intercambiando el token de seguridad</span>
                </div>
            </div>
        );
    }

    const filteredAccounts = platformFilter === 'all'
        ? accounts
        : accounts.filter(a => a.platform === platformFilter);

    return (
        <div className="accounts-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="page-header-content">
                    <div>
                        <h1 className="page-title">Gestión de Cuentas</h1>
                        <p className="page-subtitle">Administra tus cuentas conectadas de TikTok, YouTube e Instagram</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            leftIcon={<TikTokIcon />}
                            onClick={handleConnectTikTok}
                            className="btn-tiktok"
                        >
                            Conectar TikTok
                        </Button>
                        <Button
                            leftIcon={<YouTubeIcon />}
                            onClick={handleConnectYouTube}
                            style={{ background: '#FF0000', color: 'white', border: 'none' }}
                        >
                            Conectar YouTube
                        </Button>
                    </div>
                </div>
            </motion.div>

            {error && (
                <div className="error-banner">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            {/* Proxy Pool Status */}
            <ProxyPoolStatus />

            {/* Accounts Stats */}
            <motion.div
                className="accounts-stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="stat-pill">
                    <span className="stat-pill-value">{accounts.length}</span>
                    <span className="stat-pill-label">Cuentas Totales</span>
                </div>
                <div className="stat-pill active">
                    <span className="stat-pill-value">{accounts.filter(a => a.is_active).length}</span>
                    <span className="stat-pill-label">Activas</span>
                </div>
            </motion.div>

            {/* Platform Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['all', 'tiktok', 'youtube'].map(p => (
                    <button
                        key={p}
                        onClick={() => setPlatformFilter(p)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            border: platformFilter === p ? 'none' : '1px solid #2A2E35',
                            background: platformFilter === p ? (p === 'youtube' ? '#FF0000' : p === 'tiktok' ? '#25F4EE' : '#6366F1') : 'transparent',
                            color: platformFilter === p ? (p === 'tiktok' ? '#000' : '#fff') : '#9CA3AF',
                            fontSize: '13px',
                            cursor: 'pointer',
                            fontWeight: platformFilter === p ? 600 : 400,
                        }}
                    >
                        {p === 'all' ? `Todas (${accounts.length})` : p === 'tiktok' ? `TikTok (${accounts.filter(a => a.platform === 'tiktok').length})` : `YouTube (${accounts.filter(a => a.platform === 'youtube').length})`}
                    </button>
                ))}
            </div>

            {/* Accounts Grid */}
            <div className="accounts-grid">
                {filteredAccounts.map((account, index) => (
                    <motion.div
                        key={account.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + index * 0.05 }}
                    >
                        <Card hover>
                            <div className="account-card">
                                <div className="account-header">
                                    <div className="account-avatar">
                                        {account.profile_photo_url ? (
                                            <img src={account.profile_photo_url} alt={account.display_name || ''} />
                                        ) : (
                                            <span>{(account.display_name || account.username)[0].toUpperCase()}</span>
                                        )}
                                        <div className="platform-badge">
                                            <PlatformIcon platform={account.platform} />
                                        </div>
                                    </div>
                                    <div className="relative" ref={openMenuId === account.id ? menuRef : null}>
                                        <button
                                            className="account-menu"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(openMenuId === account.id ? null : account.id);
                                            }}
                                        >
                                            <MoreVertical size={18} />
                                        </button>
                                        <AnimatePresence>
                                            {openMenuId === account.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="absolute right-0 mt-2 w-48 bg-[#1A1D21] border border-[#2A2E35] rounded-lg shadow-lg z-50 overflow-hidden"
                                                >
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleViewAccount(account);
                                                        }}
                                                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#25F4EE]/10 hover:text-[#25F4EE] flex items-center gap-2 transition-colors border-b border-[#2A2E35]"
                                                    >
                                                        <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[10px]">●</span>
                                                        Ver Navegador Seguro
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteAccount(account.id);
                                                        }}
                                                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                        Desconectar Cuenta
                                                    </button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className="account-info">
                                    <h3 className="account-name">{account.display_name || account.username}</h3>
                                    <span className="account-username">@{account.username}</span>
                                    {account.bio && <p className="account-bio">{account.bio}</p>}
                                </div>

                                {/* Warmup Status */}
                                {warmupStats[account.id] && (
                                    <div className="account-warmup" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '12px', color: '#9CA3AF' }}>
                                        <Zap size={12} style={{ color: warmupStats[account.id].sessions_running > 0 ? '#FCD34D' : warmupStats[account.id].sessions_today >= 3 ? '#34D399' : '#6B7280' }} />
                                        <span>
                                            Warmup: {warmupStats[account.id].sessions_today}/3 hoy
                                            {warmupStats[account.id].sessions_running > 0 && ' (en curso...)'}
                                        </span>
                                        {warmupStats[account.id].sessions_today < 3 && warmupStats[account.id].sessions_running === 0 && (
                                            <button
                                                onClick={() => handleTriggerWarmup(account.id)}
                                                style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: '4px', background: '#25F4EE20', color: '#25F4EE', fontSize: '11px', border: 'none', cursor: 'pointer' }}
                                            >
                                                Iniciar
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="account-status">
                                    <button
                                        className={`status-badge ${account.is_active ? 'active' : 'inactive'}`}
                                        onClick={() => handleToggleStatus(account.id, account.is_active)}
                                    >
                                        {account.is_active ? (
                                            <>
                                                <Check size={14} />
                                                Activa
                                            </>
                                        ) : (
                                            <>
                                                <X size={14} />
                                                Inactiva
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}

                {filteredAccounts.length === 0 && accounts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="empty-state-card"
                    >
                        <Card>
                            <div className="empty-state-content">
                                <p>No hay cuentas de {platformFilter} conectadas.</p>
                            </div>
                        </Card>
                    </motion.div>
                )}

                {accounts.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="empty-state-card"
                    >
                        <Card>
                            <div className="empty-state-content">
                                <div className="empty-icon">
                                    <TikTokIcon />
                                </div>
                                <h3>No tienes cuentas conectadas</h3>
                                <p>Conecta tu primera cuenta de TikTok o YouTube para empezar a publicar automáticamente.</p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button onClick={handleConnectTikTok}>
                                        Conectar TikTok
                                    </Button>
                                    <Button onClick={handleConnectYouTube} style={{ background: '#FF0000', color: 'white', border: 'none' }}>
                                        Conectar YouTube
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </div>

            <ConnectionWizard
                isOpen={showProxyWizard}
                onClose={() => setShowProxyWizard(false)}
                onConnect={handleProxyConnect}
                autoProxy={autoProxy}
            />

            {viewingAccount && (
                <CloudBrowser
                    proxyUrl={viewingAccount.proxy_url || ''}
                    proxyUsername={viewingAccount.proxy_username || undefined}
                    proxyPassword={viewingAccount.proxy_password || undefined}
                    onClose={() => setViewingAccount(null)}
                />
            )}
        </div>
    );
};

export default Accounts;
