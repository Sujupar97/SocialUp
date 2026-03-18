import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { getProxyPoolStats, type ProxyPoolStats } from '../../services/proxyPool';
import { supabase } from '../../services/supabase';

export const ProxyPoolStatus: React.FC = () => {
    const [stats, setStats] = useState<ProxyPoolStats | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await getProxyPoolStats();
            setStats(data);
        } catch {
            // Pool table might not exist yet
            setStats(null);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('proxy-sync', {
                body: { provider: 'webshare' }
            });

            if (error) throw error;

            setSyncResult(`${data.upserted} proxies sincronizados`);
            await loadStats();
        } catch (err: any) {
            setSyncResult(`Error: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    // Don't render if pool is empty and no stats
    if (!stats || stats.total === 0) {
        return (
            <motion.div
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-[#2A2E35] bg-[#13151A]/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
            >
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Globe size={16} />
                    <span>Sin proxies configurados</span>
                </div>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1 text-xs text-[#25F4EE] hover:text-[#25F4EE]/80 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Sincronizando...' : 'Sincronizar Webshare'}
                </button>
                {syncResult && (
                    <span className="text-xs text-gray-400 ml-2">{syncResult}</span>
                )}
            </motion.div>
        );
    }

    return (
        <motion.div
            className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#2A2E35] bg-[#13151A]/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm">
                    <Globe size={16} className="text-[#25F4EE]" />
                    <span className="text-gray-400">Proxies:</span>
                    <span className="text-white font-medium">{stats.total}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                    <Wifi size={14} className="text-emerald-400" />
                    <span className="text-emerald-400">{stats.available} libres</span>
                </div>
                {stats.assigned > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-blue-400">{stats.assigned} asignados</span>
                    </div>
                )}
                {stats.unhealthy > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                        <WifiOff size={14} className="text-red-400" />
                        <span className="text-red-400">{stats.unhealthy} caídos</span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                {syncResult && (
                    <span className="text-xs text-gray-400">{syncResult}</span>
                )}
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1 text-xs text-[#25F4EE] hover:text-[#25F4EE]/80 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
            </div>
        </motion.div>
    );
};
