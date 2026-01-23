import React from 'react';
import { motion } from 'framer-motion';
import './Button.css';

interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children: React.ReactNode;
    disabled?: boolean;
    className?: string;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    style?: React.CSSProperties;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    className = '',
    onClick,
    type = 'button',
    style,
}) => {
    return (
        <motion.button
            whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
            whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
            className={`btn btn-${variant} btn-${size} ${className}`}
            disabled={disabled || isLoading}
            onClick={onClick}
            type={type}
            style={style}
        >
            {isLoading ? (
                <span className="btn-spinner" />
            ) : (
                <>
                    {leftIcon && <span className="btn-icon-left">{leftIcon}</span>}
                    <span>{children}</span>
                    {rightIcon && <span className="btn-icon-right">{rightIcon}</span>}
                </>
            )}
        </motion.button>
    );
};

export default Button;

