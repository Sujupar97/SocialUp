import React from 'react';
import { motion } from 'framer-motion';
import './Card.css';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'glass' | 'gradient';
    hover?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    variant = 'default',
    hover = false,
    padding = 'md',
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            whileHover={hover ? { y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' } : undefined}
            className={`card card-${variant} card-padding-${padding} ${className}`}
        >
            {children}
        </motion.div>
    );
};

interface CardHeaderProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle, action }) => {
    return (
        <div className="card-header">
            <div className="card-header-text">
                <h3 className="card-title">{title}</h3>
                {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
            {action && <div className="card-header-action">{action}</div>}
        </div>
    );
};

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = ''
}) => {
    return <div className={`card-content ${className}`}>{children}</div>;
};

export default Card;
