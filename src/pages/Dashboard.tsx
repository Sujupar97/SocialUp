import { useEffect, useState } from 'react';
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
    Clock,
    Loader2
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import { getDashboardStats } from '../services/analytics';
import type { DashboardStats } from '../types';
import './Dashboard.css';

function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

export const Dashboard: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [stats, setStats] = useState<DashboardStats>({
        total_accounts: 0,
        active_accounts: 0,
        total_videos: 0,
        total_distributions: 0,
        total_views: 0,
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Auth redirection handling
        if (searchParams.get('code')) {
            navigate({
                pathname: '/accounts',
                search: searchParams.toString()
            });
            return;
        }

        // Fetch real dashboard stats
        const loadStats = async () => {
            try {
                const data = await getDashboardStats();
                setStats(data || {
                    total_accounts: 0,
                    active_accounts: 0,
                    total_videos: 0,
                    total_distributions: 0,
                    total_views: 0,
                    total_likes: 0,
                    total_comments: 0,
                    total_shares: 0,
                });
            } catch (error) {
                console.error('Error loading dashboard stats:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, [searchParams, navigate]);

    const statCards = [
        {
            label: 'Videos Publicados',
            value: stats.total_distributions, // Using distributions as proxy for published
            icon: Video,
            color: '#8b5cf6'
        },
        {
            label: 'Cuentas Activas',
            value: stats.active_accounts,
            icon: Calendar, // Using Calendar icon for now, or maybe Users
            color: '#6366f1'
        },
        {
            label: 'Vistas Totales',
            value: stats.total_views,
            icon: Eye,
            color: '#22c55e',
            format: true
        },
        {
            label: 'Me Gusta',
            value: stats.total_likes,
            icon: Heart,
            color: '#ef4444',
            format: true
        },
    ];

    const engagementCards = [
        { label: 'Likes', value: stats.total_likes, icon: Heart, color: '#ef4444' },
        { label: 'Comentarios', value: stats.total_comments, icon: MessageCircle, color: '#3b82f6' },
        { label: 'Compartidos', value: stats.total_shares, icon: Share2, color: '#8b5cf6' },
    ];

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Loader2 className="spinning" size={40} />
            </div>
        );
    }

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
                                {/* Trend removed as we don't calculate it yet */}
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
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default Dashboard;
