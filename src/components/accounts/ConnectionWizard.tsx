import React, { useState } from 'react';
import { Shield, Info, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '../ui';
import { motion } from 'framer-motion';
import './ConnectionWizard.css';

interface ConnectionWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (proxyConfig: ProxyConfig | null) => void;
}

export interface ProxyConfig {
    url: string;
    username?: string;
    password?: string;
}

export const ConnectionWizard: React.FC<ConnectionWizardProps> = ({ isOpen, onClose, onConnect }) => {
    const [proxyUrl, setProxyUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [skipWarning, setSkipWarning] = useState(false);

    if (!isOpen) return null;

    const handleConnect = () => {
        if (!proxyUrl && !skipWarning) {
            setSkipWarning(true);
            return;
        }

        const config = proxyUrl ? { url: proxyUrl, username, password } : null;
        onConnect(config);
    };

    return (
        <div className="wizard-overlay" onClick={onClose}>
            <motion.div
                className="wizard-modal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={e => e.stopPropagation()}
            >
                <div className="wizard-header">
                    <div className="wizard-icon">
                        <Shield size={24} />
                    </div>
                    <h2 className="wizard-title">Configuración de Seguridad</h2>
                    <p className="wizard-description">
                        Para mantener tus cuentas seguras y evitar bloqueos, recomendamos asignar una IP única (Proxy) a cada cuenta.
                    </p>
                </div>

                <div className="wizard-form">
                    <div className="wizard-info-box">
                        <Info size={18} className="text-[#25F4EE] flex-shrink-0 mt-1" />
                        <p className="wizard-info-text">
                            Si conectas múltiples cuentas desde la misma IP, las plataformas podrían detectarlo como actividad sospechosa. Usa un proxy residencial para cada identidad.
                        </p>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Proxy URL / IP:Port</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="http://192.168.1.1:8080"
                            value={proxyUrl}
                            onChange={e => setProxyUrl(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Usuario (Opcional)</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="user123"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Contraseña (Opcional)</label>
                            <input
                                type="password"
                                className="form-input"
                                placeholder="••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {skipWarning && !proxyUrl && (
                        <motion.div
                            className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-3 items-start"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-200">
                                <strong>Precaución:</strong> Conectar sin proxy aumenta el riesgo de baneos si gestionas muchas cuentas. ¿Estás seguro?
                            </p>
                        </motion.div>
                    )}
                </div>

                <div className="wizard-footer">
                    <Button variant="ghost" onClick={onClose} className="w-full">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConnect}
                        className={`w-full ${!proxyUrl ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : ''}`}
                    >
                        {!proxyUrl && skipWarning ? 'Continuar sin Proxy' : 'Guardar y Conectar'}
                        <ArrowRight size={16} className="ml-2" />
                    </Button>
                </div>
            </motion.div>
        </div>
    );
};
