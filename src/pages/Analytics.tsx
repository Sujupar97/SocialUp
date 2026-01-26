import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Heart, MessageCircle, Share2, TrendingUp, Video, Calendar, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import { formatNumber } from '../utils/helpers';
import { getDashboardStats } from '../services/analytics';
import type { DashboardStats } from '../types';
import './Analytics.css';

export const Analytics: React.FC = () => {
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
                console.error('Error loading analytics:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, []);

    // Calculated engagement rate (simple approximation)
    const totalInteractions = stats.total_likes + stats.total_comments + stats.total_shares;
    const engagementRate = stats.total_views > 0
        ? ((totalInteractions / stats.total_views) * 100).toFixed(2)
        : '0.00';

    if (loading) {
        return (
            <div className="analytics-page">
                <div className="loading-container">
                    <Loader2 className="spinning" size={40} />
                </div>
            </div>
        );
    }

    return (
        <div className="analytics-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="page-title">Analytics</h1>
                <p className="page-subtitle">Track your content performance and audience engagement</p>
            </motion.div>

            {/* Summary Cards */}
            <div className="analytics-summary">
                {[
                    { label: 'Total Views', value: stats.total_views, icon: Eye, color: '#22c55e' },
                    { label: 'Total Likes', value: stats.total_likes, icon: Heart, color: '#ef4444' },
                    { label: 'Comments', value: stats.total_comments, icon: MessageCircle, color: '#3b82f6' },
                    { label: 'Shares', value: stats.total_shares, icon: Share2, color: '#8b5cf6' },
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
                                <span className="engagement-value">{engagementRate}%</span>
                                <span className="engagement-label">Average Engagement Rate</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Content Performance - Simplified for now as we transition from mock data */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-6"
            >
                <Card>
                    <CardHeader
                        title="Recent Content Performance"
                        subtitle="Detailed post analytics coming soon"
                    />
                    <CardContent>
                        <div className="text-center py-8 text-gray-500">
                            <Video size={48} className="mx-auto mb-4 opacity-50" />
                            <p>Connect accounts and publish videos to see detailed performance data.</p>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default Analytics;

