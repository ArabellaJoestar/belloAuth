import React, { useEffect, useState, Suspense } from 'react';
import { z } from 'zod';
import {
  Laptop,
  Server,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  Webhook,
  Key,
  CheckCircle2,
  AlertCircle,
  Send,
} from 'lucide-react';
import {
  API_BASE_URL,
  generatePkcePair,
  resolveBrowserGeolocation,
} from 'provider_app/pkce';

const RemoteWebhookMonitor = React.lazy(() => import('provider_app/WebhookMonitor'));
const RemoteSessionAuditTable = React.lazy(() => import('provider_app/SessionAuditTable'));

const PROVIDER_APP_URL = 'http://localhost:5173';
const CLIENT_CALLBACK_URL = 'http://localhost:5174/callback';

const webhookConfigSchema = z.object({
  clientId: z.string().min(1),
  webhookUrl: z.string().url('A rota de Webhook deve ser uma URL valida (http/https)'),
});

const externalAcquireSchema = z.object({
  providerTokenUrl: z.string().url('URL do provedor externo invalida'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  webhookCallbackUrl: z.string().url('URL de callback do webhook invalida'),
  ttlOverrideSeconds: z.coerce.number().int().min(30).max(3600),
});

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  jti: string;
}

export function App() {
  const [activeMode, setActiveMode] = useState<'spa' | 'external'>('spa');
  const [ttlSeconds, setTtlSeconds] = useState<number>(90);

  const [authCode, setAuthCode] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('code');
  });
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [userInfoResult, setUserInfoResult] = useState<Record<string, unknown> | null>(null);

  const [extClientId, setExtClientId] = useState('external-partner-client');
  const [extClientSecret, setExtClientSecret] = useState('external-secret-key-2026');
  const [extProviderUrl, setExtProviderUrl] = useState(`${API_BASE_URL}/oauth/token`);
  const [webhookTargetUrl, setWebhookTargetUrl] = useState(
    `${API_BASE_URL}/webhooks/receiver`,
  );
  const [outboundResult, setOutboundResult] = useState<Record<string, unknown> | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(() => {
    const hasCode = new URLSearchParams(window.location.search).has('code');
    return hasCode
      ? 'Authorization Code capturado na URL de Callback! Clique em "Trocar Code por JWT (PKCE)" ou aguarde a troca automatica.'
      : null;
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('code')) {
      window.history.replaceState({}, document.title, '/callback');
    }
  }, []);

  const startOAuthPkceRedirect = async () => {
    setErrorMsg(null);
    const pkce = await generatePkcePair();
    sessionStorage.setItem('oauth_pkce_verifier', pkce.codeVerifier);

    const state = `st_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem('oauth_state', state);

    const authUrl = new URL(PROVIDER_APP_URL);
    authUrl.searchParams.set('client_id', 'internal-spa-client');
    authUrl.searchParams.set('redirect_uri', CLIENT_CALLBACK_URL);
    authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
    authUrl.searchParams.set('state', state);

    window.location.href = authUrl.toString();
  };

  const exchangeCodeForToken = async () => {
    if (!authCode) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const codeVerifier = sessionStorage.getItem('oauth_pkce_verifier');
    if (!codeVerifier) {
      setErrorMsg(
        'code_verifier nao encontrado no sessionStorage. Inicie o fluxo pelo botao de redirecionamento PKCE.',
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: 'internal-spa-client',
          code: authCode,
          redirect_uri: CLIENT_CALLBACK_URL,
          code_verifier: codeVerifier,
          ttl_override_seconds: ttlSeconds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Falha na troca do Authorization Code');
      }

      setTokenData(data);
      setAuthCode(null);
      setStatusMsg(
        `Token JWT emitido via PKCE com TTL de ${ttlSeconds}s! O Cron Job disparara alerta quando restarem menos de 180s.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao trocar token');
    } finally {
      setLoading(false);
    }
  };

  const rotateRefreshToken = async () => {
    if (!tokenData?.refresh_token) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: 'internal-spa-client',
          refresh_token: tokenData.refresh_token,
          ttl_override_seconds: ttlSeconds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Falha ao rotacionar Refresh Token');
      }

      setTokenData(data);
      setStatusMsg('Refresh Token rotacionado! Sessao anterior enviada para a Blacklist do Redis.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro no Refresh Token');
    } finally {
      setLoading(false);
    }
  };

  const testProtectedUserInfo = async () => {
    if (!tokenData?.access_token) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/oauth/userinfo`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Token rejeitado pelo Guard');
      }
      setUserInfoResult(data);
      setStatusMsg('Acesso autorizado pelo OAuthJwtGuard (Token ativo e fora da Blacklist).');
    } catch (err) {
      setUserInfoResult(null);
      setErrorMsg(err instanceof Error ? err.message : 'Acesso negado');
    } finally {
      setLoading(false);
    }
  };

  const requestClientCredentialsToken = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setLoading(true);

    try {
      const coords = await resolveBrowserGeolocation(true);
      const res = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: extClientId,
          client_secret: extClientSecret,
          webhook_url: webhookTargetUrl,
          ttl_override_seconds: ttlSeconds,
          geolocation: coords,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Falha no Client Credentials');
      }

      setTokenData(data);
      setStatusMsg(
        `Token M2M (Client Credentials) emitido no contexto ISSUED_BY_US com TTL de ${ttlSeconds}s.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro na requisicao M2M');
    } finally {
      setLoading(false);
    }
  };

  const triggerOutboundTokenAcquisition = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const parsed = externalAcquireSchema.safeParse({
      providerTokenUrl: extProviderUrl,
      clientId: extClientId,
      clientSecret: extClientSecret,
      webhookCallbackUrl: webhookTargetUrl,
      ttlOverrideSeconds: ttlSeconds,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const coords = await resolveBrowserGeolocation(true);
      const res = await fetch(`${API_BASE_URL}/oauth/external/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed.data,
          geolocation: coords,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Falha ao adquirir token externo');
      }

      setOutboundResult(data);
      setStatusMsg(
        'Nosso Backend requisitou um token externo e o cadastrou sob monitoramento (contexto ACQUIRED_EXTERNAL).',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro na aquisicao externa');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWebhookRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const parsed = webhookConfigSchema.safeParse({
      clientId: extClientId,
      webhookUrl: webhookTargetUrl,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/oauth/clients/webhook`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Erro ao atualizar rota de webhook');
      }

      setStatusMsg(`Rota de Webhook atualizada para ${data.webhookUrl} no client ${data.clientId}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao salvar webhook');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600/20 border border-purple-500/40 rounded-xl">
              <Laptop className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Micro-Frontend B: Client Application & External API Simulator
              </h1>
              <p className="text-xs text-slate-400">
                Porta 5174 | Module Federation Host (Consumindo componentes da Porta 5173)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span>TTL dos Tokens (Teste de Webhook):</span>
              <input
                type="number"
                min={30}
                max={3600}
                value={ttlSeconds}
                onChange={(e) => setTtlSeconds(Number(e.target.value))}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-center font-mono text-amber-400"
              />
              <span className="font-mono text-slate-500">seg</span>
            </label>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveMode('spa')}
                className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition cursor-pointer ${activeMode === 'spa'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                Cliente Interno (SPA PKCE)
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('external')}
                className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition cursor-pointer ${activeMode === 'external'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Server className="w-3.5 h-3.5" />
                API Externa & Webhooks
              </button>
            </div>

            {activeMode === 'spa' && (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Key className="w-4 h-4 text-purple-400" />
                    Passo 1: Redirecionamento OAuth 2.0 + PKCE
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Gera o par criptografico S256 usando o modulo federado do Provider e redireciona para a tela de login na porta 5173.
                  </p>
                  <button
                    type="button"
                    onClick={startOAuthPkceRedirect}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    Autenticar no Identity Provider (Porta 5173)
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>

                {authCode && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
                    <div className="text-xs text-amber-300 font-mono break-all">
                      Code Recebido: {authCode}
                    </div>
                    <button
                      type="button"
                      onClick={exchangeCodeForToken}
                      disabled={loading}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-2 rounded-lg text-xs transition cursor-pointer"
                    >
                      {loading
                        ? 'Trocando Code...'
                        : 'Passo 2: Trocar Code por JWT + Refresh Token'}
                    </button>
                  </div>
                )}

                {tokenData && (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-400">
                        Sessao Autenticada
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        JTI: {tokenData.jti.slice(0, 12)}...
                      </span>
                    </div>

                    <div className="text-[11px] font-mono bg-slate-900 p-2 rounded border border-slate-800 break-all text-slate-300">
                      Bearer {tokenData.access_token.slice(0, 48)}...
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={testProtectedUserInfo}
                        disabled={loading}
                        className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Testar /oauth/userinfo
                      </button>

                      {tokenData.refresh_token && (
                        <button
                          type="button"
                          onClick={rotateRefreshToken}
                          disabled={loading}
                          className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Rotacionar Refresh
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {userInfoResult && (
                  <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                    {JSON.stringify(userInfoResult, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeMode === 'external' && (
              <div className="space-y-5">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                    1. Requisicao M2M Inbound (Client Credentials)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Simula uma aplicacao parceira requisitando um token diretamente da nossa API sem intervencao de usuario.
                  </p>
                  <button
                    type="button"
                    onClick={requestClientCredentialsToken}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 rounded-lg text-xs transition cursor-pointer"
                  >
                    Emitir Token Client Credentials (ISSUED_BY_US)
                  </button>
                </div>

                <form
                  onSubmit={triggerOutboundTokenAcquisition}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                    2. Aquisicao Outbound (Nosso Backend Requisitando Token Externo)
                  </h3>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Endpoint OAuth do Provedor Externo
                    </label>
                    <input
                      type="text"
                      value={extProviderUrl}
                      onChange={(e) => setExtProviderUrl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Client ID</label>
                      <input
                        type="text"
                        value={extClientId}
                        onChange={(e) => setExtClientId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Client Secret
                      </label>
                      <input
                        type="password"
                        value={extClientSecret}
                        onChange={(e) => setExtClientSecret(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Adquirir Token Externo (ACQUIRED_EXTERNAL)
                  </button>
                </form>

                {outboundResult && (
                  <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-blue-300 overflow-x-auto">
                    {JSON.stringify(outboundResult, null, 2)}
                  </pre>
                )}

                <form
                  onSubmit={handleUpdateWebhookRoute}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Webhook className="w-3.5 h-3.5" />
                    3. Configurar Rota de Alerta do Webhook
                  </h3>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      URL de Destino para Alerta de Expiracao
                    </label>
                    <input
                      type="text"
                      value={webhookTargetUrl}
                      onChange={(e) => setWebhookTargetUrl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium py-2 rounded-lg text-xs transition cursor-pointer"
                  >
                    Salvar Rota de Webhook no Client
                  </button>
                </form>
              </div>
            )}

            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {statusMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs p-3 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-6">
            <Suspense
              fallback={
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-xs text-slate-400">
                  Carregando modulo federado WebhookMonitor da porta 5173...
                </div>
              }
            >
              <RemoteWebhookMonitor title="Alertas de Expiracao Recebidos (Componente Federado)" />
            </Suspense>

            <Suspense
              fallback={
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-xs text-slate-400">
                  Carregando modulo federado SessionAuditTable da porta 5173...
                </div>
              }
            >
              <RemoteSessionAuditTable />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;