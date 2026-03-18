import React, { useState } from 'react';
import { Shield, Info, AlertTriangle, ArrowRight, Zap } from 'lucide-react';
import { Button } from '../ui';
import { motion } from 'framer-motion';
import './ConnectionWizard.css';

interface ConnectionWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (proxyConfig: ProxyConfig | null) => void;
    autoProxy?: ProxyConfig | null;
}

export interface ProxyConfig {
    url: string;
    username?: string;
    password?: string;
}

export const ConnectionWizard: React.FC<ConnectionWizardProps> = ({ isOpen, onClose, onConnect, autoProxy }) => {
    const [proxyUrl, setProxyUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [skipWarning, setSkipWarning] = useState(false);
    const [useAutoProxy, setUseAutoProxy] = useState(true);

    if (!isOpen) return null;

    const hasAutoProxy = !!autoProxy?.url;
    const effectiveProxy = hasAutoProxy && useAutoProxy ? autoProxy : null;

    const handleConnect = () => {
        // If using auto-proxy, use that
        if (effectiveProxy) {
            onConnect(effectiveProxy);
            return;
        }

        // Manual proxy flow
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
                    {hasAutoProxy ? (
                        <>
                            {/* Auto-proxy available */}
                            <motion.div
                                className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex gap-3 items-start"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <Zap size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm text-emerald-200 font-medium">
                                        Proxy asignado automáticamente
                                    </p>
                                    <p className="text-xs text-emerald-300/70 mt-1 font-mono">
                                        {autoProxy!.url}
                                    </p>
                                </div>
                            </motion.div>

                            <div className="flex items-center gap-2 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400">
                                    <input
                                        type="checkbox"
                                        checked={!useAutoProxy}
                                        onChange={() => setUseAutoProxy(!useAutoProxy)}
                                        className="accent-[#25F4EE]"
                                    />
                                    Usar proxy manual en su lugar
                                </label>
                            </div>

                            {!useAutoProxy && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                >
                                    {renderManualProxyForm()}
                                </motion.div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* No auto-proxy — original manual flow */}
                            <div className="wizard-info-box">
                                <Info size={18} className="text-[#25F4EE] flex-shrink-0 mt-1" />
                                <p className="wizard-info-text">
                                    Si conectas múltiples cuentas desde la misma IP, las plataformas podrían detectarlo como actividad sospechosa. Usa un proxy residencial para cada identidad.
                                </p>
                            </div>

                            {renderManualProxyForm()}

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
                        </>
                    )}
                </div>

                <div className="wizard-footer">
                    <Button variant="ghost" onClick={onClose} className="w-full">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConnect}
                        className={`w-full ${!effectiveProxy && !proxyUrl ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : ''}`}
                    >
                        {effectiveProxy
                            ? 'Conectar con Proxy'
                            : (!proxyUrl && skipWarning ? 'Continuar sin Proxy' : 'Guardar y Conectar')
                        }
                        <ArrowRight size={16} className="ml-2" />
                    </Button>
                </div>
            </motion.div>
        </div>
    );

    function renderManualProxyForm() {
        return (
            <>
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
            </>
        );
    }
};
