import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MoreVertical, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { getAccounts, toggleAccountStatus } from '../services/accounts';
import { initiateTikTokAuth, handleAuthCallback } from '../services/tiktokAuth';
import type { Account } from '../types';
import './Accounts.css';

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

export const Accounts: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingAuth, setProcessingAuth] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();

    // Cargar cuentas y verificar callback de OAuth
    useEffect(() => {
        const checkAuthAndLoad = async () => {
            const code = searchParams.get('code');
            // const state = searchParams.get('state'); // TODO: Validar state posteriormente

            if (code) {
                setProcessingAuth(true);
                // Limpiar URL
                window.history.replaceState({}, '', '/accounts');

                try {
                    await handleAuthCallback(code);
                    // Recargar cuentas después de la autenticación exitosa
                    await loadAccounts();
                } catch (err) {
                    setError('Error conectando con TikTok');
                } finally {
                    setProcessingAuth(false);
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
        } catch (err) {
            console.error('Error loading accounts:', err);
            setError('Error al cargar las cuentas');
        } finally {
            setLoading(false);
        }
    };

    const handleConnectTikTok = () => {
        initiateTikTokAuth();
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            const updated = await toggleAccountStatus(id, !currentStatus);
            setAccounts(prev => prev.map(a => a.id === id ? updated : a));
        } catch (err) {
            console.error('Error toggling status:', err);
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
                    <p>Conectando con TikTok...</p>
                    <span className="text-sm text-gray-500">Estamos intercambiando el token de seguridad</span>
                </div>
            </div>
        );
    }

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
                        <p className="page-subtitle">Administra tus cuentas conectadas de TikTok e Instagram</p>
                    </div>
                    <Button
                        leftIcon={<TikTokIcon />}
                        onClick={handleConnectTikTok}
                        className="btn-tiktok"
                    >
                        Conectar TikTok
                    </Button>
                </div>
            </motion.div>

            {error && (
                <div className="error-banner">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

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

            {/* Accounts Grid */}
            <div className="accounts-grid">
                {accounts.map((account, index) => (
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
                                            {account.platform === 'tiktok' ? <TikTokIcon /> : <InstagramIcon />}
                                        </div>
                                    </div>
                                    <button className="account-menu">
                                        <MoreVertical size={18} />
                                    </button>
                                </div>

                                <div className="account-info">
                                    <h3 className="account-name">{account.display_name || account.username}</h3>
                                    <span className="account-username">@{account.username}</span>
                                    {account.bio && <p className="account-bio">{account.bio}</p>}
                                </div>

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
                                <p>Conecta tu primera cuenta de TikTok para empezar a publicar automáticamente.</p>
                                <Button onClick={handleConnectTikTok}>
                                    Conectar Ahora
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default Accounts;
