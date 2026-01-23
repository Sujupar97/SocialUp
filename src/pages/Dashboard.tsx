import { motion } from 'framer-motion';
import {
    TrendingUp,
    Users,
    Video,
    Eye,
    Heart,
    MessageCircle,
    Share2,
    ArrowUpRight
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import './Dashboard.css';

// Mock data - will be replaced with real data from Supabase
const mockStats = {
    total_accounts: 12,
    active_accounts: 10,
    total_videos: 45,
    total_distributions: 540,
    total_views: 12500000,
    total_likes: 890000,
    total_comments: 45000,
    total_shares: 23000,
};

const statCards = [
    {
        label: 'Cuentas Activas',
        value: mockStats.active_accounts,
        total: mockStats.total_accounts,
        icon: Users,
        color: '#6366f1'
    },
    {
        label: 'Videos Subidos',
        value: mockStats.total_videos,
        icon: Video,
        color: '#8b5cf6'
    },
    {
        label: 'Distribuciones',
        value: mockStats.total_distributions,
        icon: Share2,
        color: '#f472b6'
    },
    {
        label: 'Vistas Totales',
        value: mockStats.total_views,
        icon: Eye,
        color: '#22c55e',
        format: true
    },
];

const engagementCards = [
    { label: 'Likes', value: mockStats.total_likes, icon: Heart, color: '#ef4444' },
    { label: 'Comentarios', value: mockStats.total_comments, icon: MessageCircle, color: '#3b82f6' },
    { label: 'Compartidos', value: mockStats.total_shares, icon: Share2, color: '#8b5cf6' },
];

function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

export const Dashboard: React.FC = () => {
    return (
        <div className="dashboard">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="page-title">Centro de Mando</h1>
                <p className="page-subtitle">Vista general del rendimiento de tus cuentas</p>
            </motion.div>

            {/* Stats Grid */}
            <div className="stats-grid">
                {statCards.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card variant="gradient" hover>
                            <div className="stat-card">
                                <div className="stat-icon" style={{ background: `${stat.color}20` }}>
                                    <stat.icon size={24} style={{ color: stat.color }} />
                                </div>
                                <div className="stat-info">
                                    <span className="stat-label">{stat.label}</span>
                                    <div className="stat-value-row">
                                        <span className="stat-value">
                                            {stat.format ? formatNumber(stat.value) : stat.value}
                                        </span>
                                        {stat.total && (
                                            <span className="stat-total">/ {stat.total}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="stat-trend positive">
                                    <TrendingUp size={16} />
                                    <span>+12%</span>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Engagement Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <Card>
                    <CardHeader
                        title="Engagement Total"
                        subtitle="Métricas de interacción agregadas de todas las cuentas"
                    />
                    <CardContent>
                        <div className="engagement-grid">
                            {engagementCards.map((item) => (
                                <div key={item.label} className="engagement-item">
                                    <div className="engagement-icon" style={{ background: `${item.color}15` }}>
                                        <item.icon size={20} style={{ color: item.color }} />
                                    </div>
                                    <div className="engagement-info">
                                        <span className="engagement-value">{formatNumber(item.value)}</span>
                                        <span className="engagement-label">{item.label}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="quick-actions"
            >
                <Card variant="glass">
                    <CardHeader
                        title="Acciones Rápidas"
                        subtitle="Accesos directos a funciones principales"
                    />
                    <CardContent>
                        <div className="actions-grid">
                            <a href="/upload" className="action-card">
                                <Video size={24} />
                                <span>Subir Video</span>
                                <ArrowUpRight size={16} className="action-arrow" />
                            </a>
                            <a href="/accounts" className="action-card">
                                <Users size={24} />
                                <span>Gestionar Cuentas</span>
                                <ArrowUpRight size={16} className="action-arrow" />
                            </a>
                            <a href="/distribution" className="action-card">
                                <Share2 size={24} />
                                <span>Ver Distribuciones</span>
                                <ArrowUpRight size={16} className="action-arrow" />
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default Dashboard;
