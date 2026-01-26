import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import { getVideoCopies } from '../services/content';
import type { VideoCopy } from '../types';
import './Distribution.css';

const statusConfig = {
    pending: { icon: Clock, color: '#f59e0b', label: 'Pendiente' },
    publishing: { icon: Loader2, color: '#3b82f6', label: 'Publicando' },
    published: { icon: CheckCircle, color: '#22c55e', label: 'Publicado' },
    failed: { icon: XCircle, color: '#ef4444', label: 'Fallido' },
};

export const Distribution: React.FC = () => {
    const [distributions, setDistributions] = useState<VideoCopy[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getVideoCopies();
                setDistributions(data);
            } catch (error) {
                console.error('Error loading distributions:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const stats = {
        total: distributions.length,
        published: distributions.filter(d => d.status === 'published').length,
        publishing: distributions.filter(d => d.status === 'publishing').length,
        pending: distributions.filter(d => d.status === 'pending').length,
        failed: distributions.filter(d => d.status === 'failed').length,
    };

    if (loading) {
        return (
            <div className="distribution-page">
                <div className="loading-container">
                    <Loader2 className="spinning" size={40} />
                </div>
            </div>
        );
    }

    return (
        <div className="distribution-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="page-title">Estado de Distribución</h1>
                <p className="page-subtitle">Monitorea el progreso de tus publicaciones</p>
            </motion.div>

            {/* Progress Bar */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card>
                    <CardContent>
                        <div className="distribution-progress">
                            <div className="progress-header">
                                <span className="progress-title">Progreso General</span>
                                <span className="progress-count">{stats.published}/{stats.total} completados</span>
                            </div>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill published"
                                    style={{ width: stats.total > 0 ? `${(stats.published / stats.total) * 100}%` : '0%' }}
                                />
                                <div
                                    className="progress-fill publishing"
                                    style={{ width: stats.total > 0 ? `${(stats.publishing / stats.total) * 100}%` : '0%' }}
                                />
                            </div>
                            <div className="progress-legend">
                                <span className="legend-item published">
                                    <span className="legend-dot" />
                                    Publicados ({stats.published})
                                </span>
                                <span className="legend-item publishing">
                                    <span className="legend-dot" />
                                    En progreso ({stats.publishing})
                                </span>
                                <span className="legend-item pending">
                                    <span className="legend-dot" />
                                    Pendientes ({stats.pending})
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Distribution List */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Card>
                    <CardHeader
                        title="Detalle de Distribuciones"
                        subtitle="Lista de todas las copias de video y su estado"
                    />
                    <CardContent className="no-padding">
                        <div className="distribution-list">
                            {distributions.length === 0 ? (
                                <div className="empty-distributions">
                                    <p>No hay distribuciones registradas aún.</p>
                                </div>
                            ) : (
                                distributions.map((dist, index) => {
                                    const config = statusConfig[dist.status] || statusConfig.pending;
                                    const StatusIcon = config.icon;

                                    return (
                                        <motion.div
                                            key={dist.id}
                                            className="distribution-item"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.3 + index * 0.1 }}
                                        >
                                            <div className="dist-account">
                                                <div className="dist-avatar">
                                                    {dist.account?.username?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <div className="dist-account-info">
                                                    <span className="dist-username">@{dist.account?.username || 'Desconocido'}</span>
                                                    <span className="dist-platform">{dist.account?.platform || 'tiktok'}</span>
                                                </div>
                                            </div>

                                            <div className="dist-description">
                                                {dist.generated_description ||
                                                    <span className="pending-text">Generando descripción...</span>
                                                }
                                            </div>

                                            <div className="dist-status" style={{ color: config.color }}>
                                                <StatusIcon
                                                    size={18}
                                                    className={dist.status === 'publishing' ? 'spinning' : ''}
                                                />
                                                <span>{config.label}</span>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default Distribution;
