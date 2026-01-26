import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    TrendingUp,
    Video,
    Eye,
    Heart,
    MessageCircle,
    Share2,
    ArrowUpRight,
    Calendar,
    Clock
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import './Dashboard.css';

// Demo data for TikTok approval
const mockStats = {
    total_videos: 8,
    scheduled_posts: 3,
    total_views: 45200,
    total_likes: 3890,
    total_comments: 245,
    total_shares: 89,
};

const statCards = [
    {
        label: 'Videos Publicados',
        value: mockStats.total_videos,
        icon: Video,
        color: '#8b5cf6'
    },
    {
        label: 'Programados',
        value: mockStats.scheduled_posts,
        icon: Calendar,
        color: '#6366f1'
    },
    {
        label: 'Vistas Totales',
        value: mockStats.total_views,
        icon: Eye,
        color: '#22c55e',
        format: true
    },
    {
        label: 'Me Gusta',
        value: mockStats.total_likes,
        icon: Heart,
        color: '#ef4444',
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
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        // Si detectamos un código de auth en la raíz (redirección de TikTok),
        // lo pasamos a la página de cuentas que maneja el proceso
        if (searchParams.get('code')) {
            navigate({
                pathname: '/accounts',
                search: searchParams.toString()
            });
        }
    }, [searchParams, navigate]);

    return (
        <div className="dashboard">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Manage and track your TikTok content performance</p>
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
                        title="Content Engagement"
                        subtitle="Track how your audience interacts with your content"
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
                        title="Quick Actions"
                        subtitle="Get started with content creation"
                    />
                    <CardContent>
                        <div className="actions-grid">
                            <a href="/upload" className="action-card">
                                <Video size={24} />
                                <span>Create Post</span>
                                <ArrowUpRight size={16} className="action-arrow" />
                            </a>
                            <a href="/analytics" className="action-card">
                                <TrendingUp size={24} />
                                <span>View Analytics</span>
                                <ArrowUpRight size={16} className="action-arrow" />
                            </a>
                            <a href="/upload" className="action-card">
                                <Clock size={24} />
                                <span>Schedule Content</span>
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
