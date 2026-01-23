import { motion } from 'framer-motion';
import { Eye, Heart, MessageCircle, Share2, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import { formatNumber, calculateEngagementRate } from '../utils/helpers';
import './Analytics.css';

// Mock data
const mockAccountStats = [
    {
        id: '1',
        username: 'julianparra_01',
        views: 2500000,
        likes: 180000,
        comments: 12000,
        shares: 5600,
        posts: 45
    },
    {
        id: '2',
        username: 'julianparra_02',
        views: 1800000,
        likes: 145000,
        comments: 9500,
        shares: 4200,
        posts: 42
    },
    {
        id: '3',
        username: 'julianparra_03',
        views: 2100000,
        likes: 160000,
        comments: 11000,
        shares: 4800,
        posts: 43
    },
];

export const Analytics: React.FC = () => {
    const totals = mockAccountStats.reduce((acc, stat) => ({
        views: acc.views + stat.views,
        likes: acc.likes + stat.likes,
        comments: acc.comments + stat.comments,
        shares: acc.shares + stat.shares,
        posts: acc.posts + stat.posts,
    }), { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 });

    const avgEngagement = calculateEngagementRate(
        totals.likes, totals.comments, totals.shares, totals.views
    );

    return (
        <div className="analytics-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="page-title">Estadísticas</h1>
                <p className="page-subtitle">Análisis de rendimiento de todas tus cuentas</p>
            </motion.div>

            {/* Summary Cards */}
            <div className="analytics-summary">
                {[
                    { label: 'Vistas Totales', value: totals.views, icon: Eye, color: '#22c55e' },
                    { label: 'Likes Totales', value: totals.likes, icon: Heart, color: '#ef4444' },
                    { label: 'Comentarios', value: totals.comments, icon: MessageCircle, color: '#3b82f6' },
                    { label: 'Compartidos', value: totals.shares, icon: Share2, color: '#8b5cf6' },
                ].map((item, index) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card variant="gradient" hover>
                            <div className="summary-card">
                                <div className="summary-icon" style={{ background: `${item.color}15` }}>
                                    <item.icon size={22} style={{ color: item.color }} />
                                </div>
                                <div className="summary-info">
                                    <span className="summary-value">{formatNumber(item.value)}</span>
                                    <span className="summary-label">{item.label}</span>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Engagement Rate */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <Card variant="glass">
                    <CardContent>
                        <div className="engagement-highlight">
                            <div className="engagement-icon">
                                <TrendingUp size={28} />
                            </div>
                            <div className="engagement-data">
                                <span className="engagement-value">{avgEngagement.toFixed(2)}%</span>
                                <span className="engagement-label">Tasa de Engagement Promedio</span>
                            </div>
                            <div className="engagement-trend positive">
                                +2.5% vs semana anterior
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Per Account Stats */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <Card>
                    <CardHeader
                        title="Rendimiento por Cuenta"
                        subtitle="Estadísticas detalladas de cada cuenta conectada"
                    />
                    <CardContent className="no-padding">
                        <div className="analytics-table">
                            <div className="table-header">
                                <span>Cuenta</span>
                                <span>Vistas</span>
                                <span>Likes</span>
                                <span>Comentarios</span>
                                <span>Compartidos</span>
                                <span>Engagement</span>
                            </div>
                            {mockAccountStats.map((stat, index) => {
                                const engagement = calculateEngagementRate(
                                    stat.likes, stat.comments, stat.shares, stat.views
                                );

                                return (
                                    <motion.div
                                        key={stat.id}
                                        className="table-row"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.6 + index * 0.1 }}
                                    >
                                        <span className="account-cell">
                                            <div className="account-avatar-sm">
                                                {stat.username[0].toUpperCase()}
                                            </div>
                                            @{stat.username}
                                        </span>
                                        <span className="metric-cell">
                                            <Eye size={14} />
                                            {formatNumber(stat.views)}
                                        </span>
                                        <span className="metric-cell">
                                            <Heart size={14} />
                                            {formatNumber(stat.likes)}
                                        </span>
                                        <span className="metric-cell">
                                            <MessageCircle size={14} />
                                            {formatNumber(stat.comments)}
                                        </span>
                                        <span className="metric-cell">
                                            <Share2 size={14} />
                                            {formatNumber(stat.shares)}
                                        </span>
                                        <span className="engagement-cell">
                                            {engagement.toFixed(2)}%
                                        </span>
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

export default Analytics;
