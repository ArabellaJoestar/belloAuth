import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Zap, Globe, Clock } from 'lucide-react';
import { API_BASE_URL } from '../shared/pkce';

export interface WebhookAlertItem {
  event: string;
  jti: string;
  clientId: string;
  userId: string | null;
  tokenContext: 'ISSUED_BY_US' | 'ACQUIRED_EXTERNAL';
  grantType: string;
  expiresAt: string;
  remainingSeconds: number;
  geolocation: {
    latitude: number | null;
    longitude: number | null;
  };
  timestamp: string;
}

export const WebhookMonitor: React.FC<{ title?: string }> = ({
  title = 'Monitor de Webhooks (Expiracao de Tokens)',
}) => {
  const [alerts, setAlerts] = useState<WebhookAlertItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/webhooks/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch {
      // Silencia erro de polling caso backend reinicie
    }
  },[]);

  const forceCronScan = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/webhooks/trigger-scan`, { method: 'POST' });
      await fetchAlerts();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () =>{
        await fetchAlerts();
    };

    init();
    
    const interval = setInterval(fetchAlerts, 4000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-base">{title}</h3>
          <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono">
            {alerts.length} alertas
          </span>
        </div>
        <button
          onClick={forceCronScan}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          {loading ? 'Varrendo...' : 'Forcar Varredura Cron'}
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          Nenhum alerta de expiracao disparado ainda. Gere um token com TTL curto (ex: 60s) para testar.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {alerts.map((item) => (
            <div
              key={`${item.jti}-${item.timestamp}`}
              className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-amber-400">
                  {item.event} | {item.clientId}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                    item.tokenContext === 'ISSUED_BY_US'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-purple-500/20 text-purple-300'
                  }`}
                >
                  {item.tokenContext}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-slate-400 font-mono">
                <span>JTI: {item.jti.slice(0, 14)}...</span>
                <span>Grant: {item.grantType}</span>
                <span className="flex items-center gap-1 text-rose-400">
                  <Clock className="w-3 h-3" /> Expira em {item.remainingSeconds}s
                </span>
                {item.geolocation?.latitude && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Globe className="w-3 h-3" />
                    {item.geolocation.latitude}, {item.geolocation.longitude}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WebhookMonitor;