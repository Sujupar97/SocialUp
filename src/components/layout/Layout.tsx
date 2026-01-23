import { NavLink, Outlet, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    Upload,
    BarChart3,
    Settings,
    Zap
} from 'lucide-react';
import './Layout.css';

// Simplified navigation for TikTok approval
const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/upload', icon: Upload, label: 'Create Post' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export const MainLayout: React.FC = () => {
    return (
        <div className="layout">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <motion.div
                        className="logo"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                        <div className="logo-icon">
                            <Zap size={24} />
                        </div>
                        <span className="logo-text">SocialUp</span>
                    </motion.div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item, index) => (
                        <motion.div
                            key={item.path}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <NavLink
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.label}</span>
                            </NavLink>
                        </motion.div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <NavLink to="/settings" className="nav-item">
                        <Settings size={20} />
                        <span>Configuración</span>
                    </NavLink>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <Outlet />

                {/* Legal Footer */}
                <footer className="legal-footer">
                    <Link to="/terms">Terms of Service</Link>
                    <span className="footer-divider">•</span>
                    <Link to="/privacy">Privacy Policy</Link>
                    <span className="footer-divider">•</span>
                    <span className="footer-copyright">© 2026 SocialUp</span>
                </footer>
            </main>
        </div>
    );
};

export default MainLayout;

