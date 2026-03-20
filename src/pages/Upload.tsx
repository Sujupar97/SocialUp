import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload as UploadIcon, Video, X, MessageSquare, AtSign, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardContent, Button } from '../components/ui';
import { CTA_TYPES, AUTOMATION_SERVER } from '../utils/constants';
import { supabase } from '../services/supabase';
import type { Platform } from '../types/account';
import './Upload.css';

type CTAType = 'first_comment' | 'keyword_response' | null;
type JobStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

interface JobState {
    id: string | null;
    status: JobStatus;
    progress: number;
    message: string;
    results: { account: string; success: boolean; error?: string }[];
}

interface PlatformOption {
    id: Platform;
    label: string;
    icon: string;
    color: string;
    activeColor: string;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
    {
        id: 'tiktok',
        label: 'TikTok',
        icon: '♪',
        color: 'rgba(0, 0, 0, 0.3)',
        activeColor: 'linear-gradient(135deg, #00f2ea, #ff0050)',
    },
    {
        id: 'youtube',
        label: 'YouTube Shorts',
        icon: '▶',
        color: 'rgba(255, 0, 0, 0.2)',
        activeColor: 'linear-gradient(135deg, #FF0000, #cc0000)',
    },
    {
        id: 'instagram',
        label: 'Instagram Reels',
        icon: '📷',
        color: 'rgba(225, 48, 108, 0.2)',
        activeColor: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)',
    },
];

export const Upload: React.FC = () => {
    const [dragActive, setDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [ctaType, setCtaType] = useState<CTAType>(null);
    const [ctaText, setCtaText] = useState('');
    const [keywordTrigger, setKeywordTrigger] = useState('');
    const [autoResponse, setAutoResponse] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
    const [accountCounts, setAccountCounts] = useState<Record<Platform, number>>({ tiktok: 0, youtube: 0, instagram: 0 });
    const [job, setJob] = useState<JobState>({
        id: null,
        status: 'idle',
        progress: 0,
        message: '',
        results: []
    });

    const inputRef = useRef<HTMLInputElement>(null);

    // Load account counts per platform
    useEffect(() => {
        const loadCounts = async () => {
            try {
                const { data, error } = await supabase
                    .from('accounts')
                    .select('platform')
                    .eq('is_active', true);

                if (error || !data) return;

                const counts: Record<Platform, number> = { tiktok: 0, youtube: 0, instagram: 0 };
                for (const row of data) {
                    if (row.platform in counts) {
                        counts[row.platform as Platform]++;
                    }
                }
                setAccountCounts(counts);

                // Auto-select platforms that have accounts
                const active = (Object.keys(counts) as Platform[]).filter(p => counts[p] > 0);
                setSelectedPlatforms(active);
            } catch (err) {
                console.error('Error loading account counts:', err);
            }
        };
        loadCounts();
    }, []);

    // Polling para actualizar estado del job
    useEffect(() => {
        if (!job.id || job.status === 'completed' || job.status === 'failed') return;

        const interval = setInterval(async () => {
            try {
                const response = await fetch(`${AUTOMATION_SERVER}/api/status/${job.id}`);
                if (response.ok) {
                    const data = await response.json();
                    setJob(prev => ({
                        ...prev,
                        status: data.status,
                        progress: data.progress,
                        message: data.message,
                        results: data.results || []
                    }));
                }
            } catch (error) {
                console.error('Error polling status:', error);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [job.id, job.status]);

    const togglePlatform = (platform: Platform) => {
        setSelectedPlatforms(prev =>
            prev.includes(platform)
                ? prev.filter(p => p !== platform)
                : [...prev, platform]
        );
    };

    const totalAccounts = selectedPlatforms.reduce((sum, p) => sum + accountCounts[p], 0);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('video/')) {
            setSelectedFile(file);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const handleSubmit = async () => {
        if (!selectedFile || selectedPlatforms.length === 0) return;

        setJob({ id: null, status: 'uploading', progress: 0, message: 'Subiendo video...', results: [] });

        try {
            const formData = new FormData();
            formData.append('video', selectedFile);
            formData.append('description', description);
            formData.append('ctaType', ctaType || '');
            formData.append('ctaContent', ctaType === 'first_comment' ? ctaText : autoResponse);
            formData.append('platforms', JSON.stringify(selectedPlatforms));

            const response = await fetch(`${AUTOMATION_SERVER}/api/distribute`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Error al iniciar distribución');
            }

            const data = await response.json();

            setJob(prev => ({
                ...prev,
                id: data.jobId,
                status: 'processing',
                message: 'Procesando...'
            }));

        } catch (error: any) {
            console.error('Error:', error);
            setJob(prev => ({
                ...prev,
                status: 'failed',
                message: error.message || 'Error de conexión. ¿Está el servidor de automatización corriendo?'
            }));
        }
    };

    const resetForm = () => {
        setSelectedFile(null);
        setDescription('');
        setCtaType(null);
        setCtaText('');
        setKeywordTrigger('');
        setAutoResponse('');
        setJob({ id: null, status: 'idle', progress: 0, message: '', results: [] });
    };


    return (
        <div className="upload-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="page-title">Subir Video</h1>
                <p className="page-subtitle">Sube un video para distribuirlo a todas tus cuentas</p>
            </motion.div>

            <div className="upload-grid">
                {/* Upload Zone */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card>
                        <CardHeader
                            title="Video"
                            subtitle="Arrastra o selecciona el video a distribuir"
                        />
                        <CardContent>
                            <input
                                ref={inputRef}
                                type="file"
                                accept="video/*"
                                onChange={handleFileChange}
                                className="hidden-input"
                                id="video-upload"
                            />

                            <AnimatePresence mode="wait">
                                {!selectedFile ? (
                                    <motion.label
                                        key="dropzone"
                                        htmlFor="video-upload"
                                        className={`dropzone ${dragActive ? 'active' : ''}`}
                                        onDragEnter={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDragOver={handleDrag}
                                        onDrop={handleDrop}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <div className="dropzone-icon">
                                            <UploadIcon size={32} />
                                        </div>
                                        <span className="dropzone-text">
                                            Arrastra un video aquí o <span className="highlight">selecciona un archivo</span>
                                        </span>
                                        <span className="dropzone-hint">MP4, MOV, AVI hasta 500MB</span>
                                    </motion.label>
                                ) : (
                                    <motion.div
                                        key="preview"
                                        className="file-preview"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                    >
                                        <div className="file-info">
                                            <div className="file-icon">
                                                <Video size={24} />
                                            </div>
                                            <div className="file-details">
                                                <span className="file-name">{selectedFile.name}</span>
                                                <span className="file-size">
                                                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                                                </span>
                                            </div>
                                        </div>
                                        <button className="remove-file" onClick={handleRemoveFile}>
                                            <X size={18} />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Description */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card>
                        <CardHeader
                            title="Descripción"
                            subtitle="Escribe una descripción para tu publicación"
                        />
                        <CardContent>
                            <textarea
                                className="description-input"
                                placeholder="Escribe la descripción de tu video. Agrega hashtags relevantes para aumentar el alcance..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={5}
                            />
                            <div className="description-footer">
                                <span className="char-count">{description.length} / 2200 caracteres</span>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Platform Selector */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                >
                    <Card>
                        <CardHeader
                            title="Plataformas"
                            subtitle="Selecciona en qué plataformas publicar"
                        />
                        <CardContent>
                            <div className="platform-selector">
                                {PLATFORM_OPTIONS.map((platform) => {
                                    const count = accountCounts[platform.id];
                                    const isSelected = selectedPlatforms.includes(platform.id);
                                    const isDisabled = count === 0;

                                    return (
                                        <button
                                            key={platform.id}
                                            className={`platform-toggle ${isSelected ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                                            onClick={() => !isDisabled && togglePlatform(platform.id)}
                                            disabled={isDisabled}
                                            style={isSelected ? { background: platform.activeColor } : undefined}
                                        >
                                            <span className="platform-icon">{platform.icon}</span>
                                            <span className="platform-name">{platform.label}</span>
                                            <span className="platform-count">
                                                {count > 0 ? `${count} cuenta${count !== 1 ? 's' : ''}` : 'Sin cuentas'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {totalAccounts > 0 && (
                                <p className="platform-summary">
                                    Se publicará en <strong>{totalAccounts} cuenta{totalAccounts !== 1 ? 's' : ''}</strong> en {selectedPlatforms.length} plataforma{selectedPlatforms.length !== 1 ? 's' : ''}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Call to Action */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card>
                        <CardHeader
                            title="Call to Action"
                            subtitle="Configura la acción que deseas que realicen los usuarios"
                        />
                        <CardContent>
                            <div className="cta-options">
                                <button
                                    className={`cta-option ${ctaType === CTA_TYPES.FIRST_COMMENT ? 'active' : ''}`}
                                    onClick={() => setCtaType(ctaType === CTA_TYPES.FIRST_COMMENT ? null : CTA_TYPES.FIRST_COMMENT)}
                                >
                                    <MessageSquare size={20} />
                                    <span>Primer Comentario</span>
                                    <p>Nosotros publicamos el primer comentario con un enlace</p>
                                </button>

                                <button
                                    className={`cta-option ${ctaType === CTA_TYPES.KEYWORD_RESPONSE ? 'active' : ''}`}
                                    onClick={() => setCtaType(ctaType === CTA_TYPES.KEYWORD_RESPONSE ? null : CTA_TYPES.KEYWORD_RESPONSE)}
                                >
                                    <AtSign size={20} />
                                    <span>Respuesta a Keyword</span>
                                    <p>Responde automáticamente cuando comenten una palabra clave</p>
                                </button>
                            </div>

                            <AnimatePresence>
                                {ctaType === CTA_TYPES.FIRST_COMMENT && (
                                    <motion.div
                                        className="cta-config"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <label className="input-label">Texto del Comentario</label>
                                        <textarea
                                            className="cta-input"
                                            placeholder="Escribe el comentario que se publicará automáticamente..."
                                            value={ctaText}
                                            onChange={(e) => setCtaText(e.target.value)}
                                            rows={3}
                                        />
                                    </motion.div>
                                )}

                                {ctaType === CTA_TYPES.KEYWORD_RESPONSE && (
                                    <motion.div
                                        className="cta-config"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <div className="input-group">
                                            <label className="input-label">Palabra Clave</label>
                                            <input
                                                type="text"
                                                className="cta-text-input"
                                                placeholder="Ej: INFO, QUIERO, LINK"
                                                value={keywordTrigger}
                                                onChange={(e) => setKeywordTrigger(e.target.value)}
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Respuesta Automática (DM)</label>
                                            <textarea
                                                className="cta-input"
                                                placeholder="Mensaje que se enviará por DM cuando comenten la palabra clave..."
                                                value={autoResponse}
                                                onChange={(e) => setAutoResponse(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Progress & Submit */}
            <motion.div
                className="upload-actions"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                {job.status === 'idle' && (
                    <>
                        <Button
                            size="lg"
                            leftIcon={<Send size={20} />}
                            onClick={handleSubmit}
                            disabled={!selectedFile || !description || selectedPlatforms.length === 0}
                        >
                            {selectedPlatforms.length === 0
                                ? 'Selecciona una plataforma'
                                : `Publicar en ${selectedPlatforms.length} plataforma${selectedPlatforms.length !== 1 ? 's' : ''} (${totalAccounts} cuenta${totalAccounts !== 1 ? 's' : ''})`
                            }
                        </Button>
                        <span className="upload-hint">
                            {selectedPlatforms.length > 0
                                ? `Tu video se publicará en: ${selectedPlatforms.map(p => PLATFORM_OPTIONS.find(o => o.id === p)?.label).join(', ')}`
                                : 'Selecciona al menos una plataforma para publicar'
                            }
                        </span>
                    </>
                )}

                {(job.status === 'uploading' || job.status === 'processing') && (
                    <Card variant="glass">
                        <CardContent>
                            <div className="progress-container">
                                <div className="progress-header">
                                    <Loader2 className="spin" size={24} />
                                    <span className="progress-title">Publicando...</span>
                                </div>
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar-fill"
                                        style={{ width: `${job.progress}%` }}
                                    />
                                </div>
                                <p className="progress-message">{job.message}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {job.status === 'completed' && (
                    <Card variant="glass">
                        <CardContent>
                            <div className="result-container success">
                                <CheckCircle size={32} className="result-icon" />
                                <h3>¡Distribución Completada!</h3>
                                <p>{job.message}</p>
                                {job.results.length > 0 && (
                                    <div className="results-list">
                                        {job.results.map((r, i) => (
                                            <div key={i} className={`result-item ${r.success ? 'success' : 'failed'}`}>
                                                <span>@{r.account}</span>
                                                <span>{r.success ? '✅ Publicado' : `❌ ${r.error}`}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <Button onClick={resetForm} style={{ marginTop: '1rem' }}>
                                    Subir Otro Video
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {job.status === 'failed' && (
                    <Card variant="glass">
                        <CardContent>
                            <div className="result-container error">
                                <AlertCircle size={32} className="result-icon" />
                                <h3>Error en la Distribución</h3>
                                <p>{job.message}</p>
                                <div className="error-help">
                                    <p><strong>Verifica que:</strong></p>
                                    <ul>
                                        <li>El servidor de automatización esté corriendo</li>
                                        <li>La variable VITE_AUTOMATION_SERVER esté configurada en .env</li>
                                        <li>Las cuentas estén conectadas vía OAuth</li>
                                    </ul>
                                </div>
                                <Button onClick={resetForm} variant="secondary" style={{ marginTop: '1rem' }}>
                                    Intentar de Nuevo
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </motion.div>
        </div>
    );
};

export default Upload;
