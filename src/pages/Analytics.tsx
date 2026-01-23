import { motion } from 'framer-motion';
import { Eye, Heart, MessageCircle, Share2, TrendingUp, Video, Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui';
import { formatNumber } from '../utils/helpers';
import './Analytics.css';

// Simplified data for TikTok approval (single account view)
const contentStats = {
    totalViews: 45200,
    totalLikes: 3890,
    totalComments: 245,
    totalShares: 89,
    postsThisMonth: 8,
    avgEngagement: 8.37
};

const recentPosts = [
    { id: 1, title: 'Morning Routine Tips', views: 12400, likes: 980, date: '2 days ago' },
    { id: 2, title: 'Product Review', views: 8900, likes: 720, date: '4 days ago' },
    { id: 3, title: 'Travel Vlog', views: 15200, likes: 1240, date: '1 week ago' },
];

export const Analytics: React.FC = () => {
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
                    { label: 'Total Views', value: contentStats.totalViews, icon: Eye, color: '#22c55e' },
                    { label: 'Total Likes', value: contentStats.totalLikes, icon: Heart, color: '#ef4444' },
                    { label: 'Comments', value: contentStats.totalComments, icon: MessageCircle, color: '#3b82f6' },
                    { label: 'Shares', value: contentStats.totalShares, icon: Share2, color: '#8b5cf6' },
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
                                <span className="engagement-value">{contentStats.avgEngagement}%</span>
                                <span className="engagement-label">Average Engagement Rate</span>
                            </div>
                            <div className="engagement-trend positive">
                                +2.5% vs last week
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Content Performance */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <Card>
                    <CardHeader
                        title="Recent Content Performance"
                        subtitle="See how your latest posts are performing"
                    />
                    <CardContent className="no-padding">
                        <div className="analytics-table">
                            <div className="table-header">
                                <span>Content</span>
                                <span>Views</span>
                                <span>Likes</span>
                                <span>Posted</span>
                            </div>
                            {recentPosts.map((post, index) => (
                                <motion.div
                                    key={post.id}
                                    className="table-row"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.6 + index * 0.1 }}
                                >
                                    <span className="account-cell">
                                        <div className="account-avatar-sm" style={{ background: '#8b5cf6' }}>
                                            <Video size={14} />
                                        </div>
                                        {post.title}
                                    </span>
                                    <span className="metric-cell">
                                        <Eye size={14} />
                                        {formatNumber(post.views)}
                                    </span>
                                    <span className="metric-cell">
                                        <Heart size={14} />
                                        {formatNumber(post.likes)}
                                    </span>
                                    <span className="metric-cell">
                                        <Calendar size={14} />
                                        {post.date}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default Analytics;

