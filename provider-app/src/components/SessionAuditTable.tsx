import React, { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, MapPin, Ban, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../shared/pkce';

export interface SessionRecord {
  id: string;
  jti: string;
  userId: string | null;
  clientId: string;
  tokenContext: 'ISSUED_BY_US' | 'ACQUIRED_EXTERNAL';
  grantType: string;
  ipAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  expiresAt: string;
  webhookNotified: boolean;
  revokedAt: string | null;
  createdAt: string;
}

export const SessionAuditTable: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  

  const loadSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (jti: string) => {
    await fetch(`${API_BASE_URL}/sessions/${jti}/revoke`, { method: 'POST' });
    await loadSessions();
  };

  useEffect(() => {
    const init = async () =>{
        await loadSessions();
    }

    init();
    
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-lg">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-base">
            Auditoria de Sessoes e Blacklist Redis
          </h3>
        </div>
        <button
          onClick={loadSessions}
          className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2 px-2">JTI / Client</th>
              <th className="py-2 px-2">Contexto / Grant</th>
              <th className="py-2 px-2">Geo / IP</th>
              <th className="py-2 px-2">Webhook</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 px-2 text-right">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {sessions.map((s) => {
              const isExpired = new Date(s.expiresAt).getTime() <= currentTime;
              const isRevoked = Boolean(s.revokedAt);

              return (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-2">
                    <div className="text-slate-200 font-semibold">{s.clientId}</div>
                    <div className="text-slate-500 text-[11px]">{s.jti.slice(0, 16)}...</div>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="text-blue-400">{s.tokenContext}</span>
                    <div className="text-slate-400 text-[11px]">{s.grantType}</div>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1 text-slate-300">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      {s.latitude && s.longitude
                        ? `${Number(s.latitude).toFixed(3)}, ${Number(s.longitude).toFixed(3)}`
                        : 'Nao informado'}
                    </div>
                    <div className="text-slate-500 text-[11px]">{s.ipAddress || '127.0.0.1'}</div>
                  </td>
                  <td className="py-2.5 px-2">
                    {s.webhookNotified ? (
                      <span className="text-amber-400">Notificado</span>
                    ) : (
                      <span className="text-slate-500">Pendente</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {isRevoked ? (
                      <span className="bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded">
                        Revogado (Redis)
                      </span>
                    ) : isExpired ? (
                      <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                        Expirado
                      </span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> Ativo
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {!isRevoked && !isExpired && (
                      <button
                        onClick={() => revokeSession(s.jti)}
                        className="inline-flex items-center gap-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded transition cursor-pointer"
                      >
                        <Ban className="w-3 h-3" /> Revogar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-slate-500 font-sans">
                  Nenhuma sessao registrada no PostgreSQL/Redis ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SessionAuditTable;