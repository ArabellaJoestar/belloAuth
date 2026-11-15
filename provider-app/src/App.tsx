import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  KeyRound,
  Mail,
  ShieldCheck,
  MapPin,
  ArrowRight,
  Lock,
  CheckCircle,
} from 'lucide-react';
import {
  API_BASE_URL,
  generatePkcePair,
  resolveBrowserGeolocation,
  type GeolocationCoords,
} from './shared/pkce';
import WebhookMonitor from './components/WebhookMonitor';
import SessionAuditTable from './components/SessionAuditTable';

const credentialsSchema = z.object({
  email: z.string().email('Informe um e-mail valido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

const twoFactorSchema = z.object({
  code: z.string().length(6, 'O codigo 2FA deve conter exatamente 6 digitos'),
});

const magicEmailSchema = z.object({
  email: z.string().email('Informe um e-mail valido para o Magic Link'),
});

export function App() {
  const searchParams = new URLSearchParams(window.location.search);

  const [clientId, setClientId] = useState(
    searchParams.get('client_id') || 'internal-spa-client',
  );
  const [redirectUri, setRedirectUri] = useState(
    searchParams.get('redirect_uri') || 'http://localhost:5174/callback',
  );
  const [codeChallenge, setCodeChallenge] = useState(
    searchParams.get('code_challenge') || '',
  );
  const [codeChallengeMethod] = useState<'S256' | 'plain'>(
    (searchParams.get('code_challenge_method') as 'S256' | 'plain') || 'S256',
  );
  const [oauthState] = useState(searchParams.get('state') || 'state_demo_xyz');

  const [activeTab, setActiveTab] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('dev@oauth.local');
  const [password, setPassword] = useState('Password@123');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [geoEnabled, setGeoEnabled] = useState(true);
  const [coords, setCoords] = useState<GeolocationCoords>({
    latitude: null,
    longitude: null,
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedRedirectUrl, setGeneratedRedirectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initParams = async () => {
      if (!codeChallenge) {
        const pkce = await generatePkcePair();
        setCodeChallenge(pkce.codeChallenge);
        sessionStorage.setItem('standalone_pkce_verifier', pkce.codeVerifier);
      }
      if (geoEnabled) {
        const resolved = await resolveBrowserGeolocation(true);
        setCoords(resolved);
      }
    };
    initParams();
  }, [codeChallenge, geoEnabled]);

  useEffect(() => {
    const magicToken = searchParams.get('magic_token');
    if (!magicToken) return;

    const verifyTokenFromUrl = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`${API_BASE_URL}/oauth/authorize/magic-link/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: magicToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Falha ao validar Magic Link.');
        }
        setStatusMessage('Magic Link autenticado com sucesso! Redirecionando...');
        setGeneratedRedirectUrl(data.redirectTo);
        setTimeout(() => {
          window.location.href = data.redirectTo;
        }, 1200);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Erro no Magic Link');
      } finally {
        setLoading(false);
      }
    };

    verifyTokenFromUrl();
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/oauth/authorize/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          clientId,
          redirectUri,
          codeChallenge,
          codeChallengeMethod,
          state: oauthState,
          geolocation: geoEnabled ? coords : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Erro ao autenticar');
      }

      if (data.requiresTwoFactor) {
        setChallengeId(data.challengeId);
        setStatusMessage(
          'Codigo 2FA enviado! Abra o Mailpit (http://localhost:8025) para visualizar os 6 digitos.',
        );
        return;
      }

      setGeneratedRedirectUrl(data.redirectTo);
      setStatusMessage('Authorization Code emitido com sucesso!');
      if (searchParams.get('client_id')) {
        setTimeout(() => {
          window.location.href = data.redirectTo;
        }, 1000);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha na requisicao');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsed = twoFactorSchema.safeParse({ code: twoFactorCode });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/oauth/authorize/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code: twoFactorCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Codigo 2FA incorreto');
      }

      setChallengeId(null);
      setGeneratedRedirectUrl(data.redirectTo);
      setStatusMessage('2FA confirmado! Authorization Code gerado.');
      if (searchParams.get('client_id')) {
        setTimeout(() => {
          window.location.href = data.redirectTo;
        }, 1000);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro na verificacao 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const parsed = magicEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/oauth/authorize/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          clientId,
          redirectUri,
          codeChallenge,
          codeChallengeMethod,
          state: oauthState,
          geolocation: geoEnabled ? coords : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Falha ao enviar Magic Link');
      }

      setStatusMessage(data.message);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro no envio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/40 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Micro-Frontend A: Identity Provider (OAuth 2.0 + PKCE)
              </h1>
              <p className="text-xs text-slate-400">
                Porta 5173 | Module Federation Remote | Login, 2FA e Magic Links
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <a
              href="http://localhost:8025"
              target="_blank"
              rel="noreferrer"
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-blue-400 transition"
            >
              Abrir Mailpit (Porta 8025)
            </a>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" />
                Autorizacao OAuth 2.0
              </h2>
              <span className="text-xs font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded">
                PKCE {codeChallengeMethod}
              </span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 font-mono">
              <div className="text-slate-400">
                Client ID: <span className="text-slate-200">{clientId}</span>
              </div>
              <div className="text-slate-400 truncate">
                Redirect URI: <span className="text-slate-200">{redirectUri}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="flex items-center gap-1 text-emerald-400">
                  <MapPin className="w-3.5 h-3.5" />
                  Geo: {geoEnabled && coords.latitude ? `${coords.latitude}, ${coords.longitude}` : 'Desativada'}
                </span>
                <button
                  type="button"
                  onClick={() => setGeoEnabled(!geoEnabled)}
                  className="text-[11px] underline text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {geoEnabled ? 'Ocultar Geo' : 'Permitir Geo'}
                </button>
              </div>
            </div>

            <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('password');
                  setChallengeId(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                  activeTab === 'password'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Credenciais + 2FA
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('magic');
                  setChallengeId(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                  activeTab === 'magic'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Magic Link (E-mail)
              </button>
            </div>

            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setEmail('dev@oauth.local');
                  setPassword('Password@123');
                }}
                className="flex-1 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 rounded py-1 px-2 text-slate-300 cursor-pointer"
              >
                Usar dev@oauth.local (Sem 2FA)
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('sec@oauth.local');
                  setPassword('Password@123');
                }}
                className="flex-1 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 rounded py-1 px-2 text-amber-300 cursor-pointer"
              >
                Usar sec@oauth.local (Com 2FA)
              </button>
            </div>

            {activeTab === 'password' && !challengeId && (
              <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  {loading ? 'Autenticando...' : 'Entrar e Emitir Authorization Code'}
                </button>
              </form>
            )}

            {activeTab === 'password' && challengeId && (
              <form onSubmit={handleVerify2FA} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-amber-300 mb-1">
                    Codigo 2FA de 6 digitos (Enviado para o Mailpit)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-3 py-2 text-center tracking-widest font-mono text-lg focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-2.5 rounded-lg text-sm transition cursor-pointer"
                >
                  {loading ? 'Validando 2FA...' : 'Confirmar Codigo 2FA'}
                </button>
              </form>
            )}

            {activeTab === 'magic' && (
              <form onSubmit={handleSendMagicLink} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    E-mail cadastrado
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  {loading ? 'Enviando...' : 'Enviar Magic Link por E-mail'}
                </button>
              </form>
            )}

            {errorMessage && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-lg">
                {errorMessage}
              </div>
            )}

            {statusMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs p-3 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  {statusMessage}
                </div>
                {generatedRedirectUrl && (
                  <div className="pt-1 border-t border-emerald-500/20">
                    <a
                      href={generatedRedirectUrl}
                      className="inline-flex items-center gap-1 text-emerald-200 underline break-all"
                    >
                      Ir para Callback da Aplicacao Cliente <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-6">
            <WebhookMonitor title="Monitor Global de Webhooks (Provider View)" />
            <SessionAuditTable />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;