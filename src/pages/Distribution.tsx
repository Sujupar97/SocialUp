import { motion } from 'framer-motion';
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import type { VideoCopy } from '../types';
import './Distribution.css';

// Mock data
const mockDistributions: VideoCopy[] = [
    {
        id: '1',
        video_id: 'v1',
        account_id: 'a1',
        copy_filename: 'video_01_a1_1705312200.mp4',
        storage_path: '/videos/copies/video_01_a1_1705312200.mp4',
        generated_description: 'Descubre cómo transformar tu vida con estos tips 🚀 #emprendimiento #exito',
        status: 'published',
        published_at: '2024-01-15T10:30:00Z',
        external_post_id: '7326485920',
        error_message: null,
        created_at: '2024-01-15T10:00:00Z',
        account: {
            username: 'julianparra_01',
            platform: 'tiktok',
            profile_photo_url: null,
        },
    },
    {
        id: '2',
        video_id: 'v1',
        account_id: 'a2',
        copy_filename: 'video_01_a2_1705312201.mp4',
        storage_path: '/videos/copies/video_01_a2_1705312201.mp4',
        generated_description: 'Los secretos del éxito que nadie te cuenta 💡 #motivacion #crecimiento',
        status: 'publishing',
        published_at: null,
        external_post_id: null,
        error_message: null,
        created_at: '2024-01-15T10:00:00Z',
        account: {
            username: 'julianparra_02',
            platform: 'tiktok',
            profile_photo_url: null,
        },
    },
    {
        id: '3',
        video_id: 'v1',
        account_id: 'a3',
        copy_filename: 'video_01_a3_1705312202.mp4',
        storage_path: '/videos/copies/video_01_a3_1705312202.mp4',
        generated_description: null,
        status: 'pending',
        published_at: null,
        external_post_id: null,
        error_message: null,
        created_at: '2024-01-15T10:00:00Z',
        account: {
            username: 'julianparra_03',
            platform: 'tiktok',
            profile_photo_url: null,
        },
    },
];

const statusConfig = {
    pending: { icon: Clock, color: '#f59e0b', label: 'Pendiente' },
    publishing: { icon: Loader2, color: '#3b82f6', label: 'Publicando' },
    published: { icon: CheckCircle, color: '#22c55e', label: 'Publicado' },
    failed: { icon: XCircle, color: '#ef4444', label: 'Fallido' },
};

export const Distribution: React.FC = () => {
    const stats = {
        total: mockDistributions.length,
        published: mockDistributions.filter(d => d.status === 'published').length,
        publishing: mockDistributions.filter(d => d.status === 'publishing').length,
        pending: mockDistributions.filter(d => d.status === 'pending').length,
        failed: mockDistributions.filter(d => d.status === 'failed').length,
    };

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
                                    style={{ width: `${(stats.published / stats.total) * 100}%` }}
                                />
                                <div
                                    className="progress-fill publishing"
                                    style={{ width: `${(stats.publishing / stats.total) * 100}%` }}
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
                            {mockDistributions.map((dist, index) => {
                                const config = statusConfig[dist.status];
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
                                                {dist.account?.username[0].toUpperCase()}
                                            </div>
                                            <div className="dist-account-info">
                                                <span className="dist-username">@{dist.account?.username}</span>
                                                <span className="dist-platform">{dist.account?.platform}</span>
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
                            })}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default Distribution;
