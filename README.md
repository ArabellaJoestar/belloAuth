# Documentação Técnica — Ecossistema OAuth 2.0 & Module Federation

## 1. Visão Geral da Arquitetura

Este projeto implementa um ecossistema de autenticação e autorização **OAuth 2.0** de papel duplo (*Dual-Context Identity Architecture*), projetado com foco em segurança, superfície mínima de dependências externas e alta disponibilidade de sessão.

### Papéis do Sistema
1. **Identity Provider (Contexto Inbound — `ISSUED_BY_US`):** Fornece telas de autenticação, validação de múltiplos fatores (2FA), links de acesso sem senha (*Magic Links*), emissão de códigos de autorização com desafio **PKCE (S256)**, concessão de tokens M2M (*Client Credentials*) e rotação de *Refresh Tokens*.
2. **External Consumer (Contexto Outbound — `ACQUIRED_EXTERNAL`):** Atua como cliente ativo requisitando tokens OAuth 2.0 de provedores externos, registrando a sessão localmente e monitorando o tempo de vida do token adquirido.
3. **Motor Passivo de Webhooks:** Um *Cron Job* varre periodicamente as sessões ativas (tanto emitidas internamente quanto adquiridas externamente) e dispara alertas assinados via **HMAC-SHA256** para rotas configuráveis sempre que um token entra na janela de expiração iminente.

---

## 2. Stack Tech

### Backend (`/backend` — Porta `:3000`)
* **Core:** NestJS (`@latest`) + TypeScript (`@latest`) configurado com `spec: false` no `nest-cli.json`.
* **Validação de Dados e Ambiente:** Zod (`v4`) acoplado via `ZodValidationPipe` e validação na inicialização do `ConfigModule`.
* **Persistência Relacional Agnóstica:** TypeORM (`@latest`). As entidades utilizam tipos universais (`varchar`, `boolean`, `simple-json`, `timestamp`, `decimal`) para permitir a troca transparente entre PostgreSQL, MySQL, MariaDB ou SQLite.
* **Gerenciamento de Sessão e Blacklist:** Redis (`ioredis`) como fonte em memória para tokens ativos, desafios 2FA/PKCE/Magic Links e revogação instantânea (*JWT Blacklisting* por `jti`).
* **Criptografia Nativa:** Uso exclusivo do módulo nativo `node:crypto` (`scryptSync`, `timingSafeEqual`, `createHash`, `createHmac`, `randomBytes`), eliminando dependências C++ externas.
* **Comunicação Transacional:** Nodemailer integrado ao servidor SMTP (Mailpit em ambiente de desenvolvimento).

### Micro-Frontends (`/provider-app` na Porta `5173` e `/client-app` na Porta `5174`)
* **Core:** React 19 + Vite 6 + TypeScript.
* **Estilização:** Tailwind CSS (`v4`) integrado nativamente via `@tailwindcss/vite`.
* **Arquitetura Federada:** `@originjs/vite-plugin-federation`.
  * **`provider-app` (Remote):** Renderiza a interface do provedor de identidade e expõe em tempo de execução os módulos `./pkce`, `./WebhookMonitor` e `./SessionAuditTable` através do manifesto `remoteEntry.js`.
  * **`client-app` (Host):** Consome os módulos remotos do `provider-app` e simula tanto uma SPA interna (fluxo *Authorization Code + PKCE*) quanto uma aplicação parceira externa (*Client Credentials* e aquisição *Outbound*).

---

## 3. Guia de Setup e Execução Local

### 3.1. Pré-requisitos
* **Node.js** (versão 20 LTS ou superior)
* **Docker** e **Docker Compose**

### 3.2. Subindo a Infraestrutura (PostgreSQL, Redis e Mailpit)
Na pasta `backend/`, certifique-se de que o arquivo `.env` está configurado conforme o modelo abaixo:

~~~env
NODE_ENV=development
PORT=3000

DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=oauth_user
DB_PASSWORD=oauth_password
DB_DATABASE=oauth_db
DB_SYNCHRONIZE=true

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=super_secret_key_change_in_production_min_32_chars
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=604800
WEBHOOK_EXPIRATION_THRESHOLD_SECONDS=180

SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM="OAuth Provider <noreply@oauth.local>"

PROVIDER_FRONTEND_URL=http://localhost:5173
~~~

Inicie os containers Docker:

~~~bash
docker compose up -d
~~~

* **PostgreSQL:** Porta `5432`
* **Redis:** Porta `6379`
* **Mailpit (Interface Web de E-mails 2FA / Magic Link):** `http://localhost:8025`

### 3.3. Instalando pré-requisitos do backend
~~~bash
npm install
~~~

### 3.4. Instalando pré-requisitos dos Micro-Frontends
O `provider-app` atua como *Remote* no Module Federation e precisa expor o artefato `dist/assets/remoteEntry.js`:

~~~bash
cd provider-app
npm install
~~~

~~~bash
cd client-app
npm install
~~~

### 3.4. Executando o API e Micro-Frontends
O script foi feito para facilitar o setup da aplicação a nível do ambiente de desenvolvimento, entretanto caso seja desejável realizar um setup individual, o comando a seguir deve ser executado dentro das pastas referentes:

~~~bash
npm run start:dev
~~~

Para o setup automatizado de todo o ambiente de desenvolvimento esse script deve ser executado:

~~~bash
# Terminal 1 - Backend (Porta 3000)
# Terminal 2 - Provider App (Porta 5173)
# Terminal 3 - Client App (Porta 5174)
.\start.dev.ps1
~~~

---

## 4. Referência de Endpoints da API

| Método | Rota | Descrição | Autenticação |
| :--- | :--- | :--- | :--- |
| `POST` | `/users/register` | Cria uma nova conta de usuário com hash `scrypt` | Pública |
| `PATCH` | `/users/:id/2fa` | Ativa ou desativa a verificação em duas etapas (2FA) | Pública / Admin |
| `GET` | `/oauth/clients` | Lista todos os clientes OAuth registrados | Pública / Admin |
| `PATCH` | `/oauth/clients/webhook` | Atualiza a URL de destino do Webhook de um cliente | Pública / Admin |
| `POST` | `/oauth/authorize/login` | Valida credenciais, registra geolocalização e emite `code` ou desafio 2FA | Pública |
| `POST` | `/oauth/authorize/verify-2fa` | Valida o código de 6 dígitos no Redis e emite o `authorization_code` | Pública |
| `POST` | `/oauth/authorize/magic-link` | Envia e-mail com token único de acesso rápido | Pública |
| `POST` | `/oauth/authorize/magic-link/verify` | Consome o token do Magic Link e emite o `authorization_code` | Pública |
| `POST` | `/oauth/token` | Troca `authorization_code` (PKCE), `client_credentials` ou `refresh_token` por JWT | Credenciais do Client |
| `POST` | `/oauth/external/acquire` | Requisita token de API externa e registra monitoramento no Cron de Webhook | Interna / Backend |
| `GET` | `/oauth/userinfo` | Retorna o payload da sessão validando assinatura JWT e Blacklist do Redis | `Bearer <JWT>` |
| `GET` | `/sessions` | Lista o histórico de auditoria de sessões com IP e geolocalização | Pública / Admin |
| `POST` | `/sessions/:jti/revoke` | Revoga imediatamente um token inserindo seu `jti` na Blacklist do Redis | Pública / Admin |
| `POST` | `/webhooks/receiver` | Rota receptora padrão para testes de alertas de expiração | Assinatura HMAC |
| `GET` | `/webhooks/alerts` | Lista os últimos alertas de expiração disparados pelo Cron Job | Pública |

---

## 5. Guia de Acoplamento em Outros Projetos

Esta seção descreve como acoplar qualquer aplicação externa ao ecossistema OAuth 2.0.

### 5.1. Acoplando um Frontend Externo (SPA / Mobile com PKCE)
Para autenticar qualquer SPA externa contra este Identity Provider:

1. **Gere o par PKCE (`code_verifier` e `code_challenge` em SHA-256 Base64URL)** no cliente antes do redirecionamento e armazene o `code_verifier` no `sessionStorage`.
2. **Redirecione o navegador do usuário** para a tela do Provider (`http://localhost:5173`):
   ~~~text
   http://localhost:5173/?client_id=SEU_CLIENT_ID&redirect_uri=SUA_URL_CALLBACK&code_challenge=DESAFIO_S256&code_challenge_method=S256&state=VALOR_CSRF
   ~~~
3. **Capture o `code` na sua rota de Callback** quando o Provider redirecionar de volta:
   ~~~text
   https://sua-app.com/callback?code=CODIGO_GERADO&state=VALOR_CSRF
   ~~~
4. **Efetue o POST para `/oauth/token`** enviando o `code_verifier` original:
   ~~~typescript
   const response = await fetch('http://localhost:3000/oauth/token', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       grant_type: 'authorization_code',
       client_id: 'internal-spa-client',
       code: authorizationCode,
       redirect_uri: 'http://localhost:5174/callback',
       code_verifier: sessionStorage.getItem('oauth_pkce_verifier'),
     }),
   });
   const { access_token, refresh_token } = await response.json();
   ~~~

### 5.2. Acoplando um Microsserviço / API Externa (Server-to-Server)
Para comunicação máquina-a-máquina sem interface de usuário, utilize o fluxo `client_credentials`:

~~~typescript
const response = await fetch('http://localhost:3000/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'client_credentials',
    client_id: 'external-partner-client',
    client_secret: 'external-secret-key-2026',
    webhook_url: 'https://api-parceira.com/webhooks/token-expiring',
  }),
});
const { access_token, expires_in, jti } = await response.json();
~~~

### 5.3. Recebendo e Validando o Webhook de Expiração no Sistema Cliente
Quando um token atingir o limiar configurado em `WEBHOOK_EXPIRATION_THRESHOLD_SECONDS`, o backend enviará um `POST` para a `webhook_url` cadastrada contendo o cabeçalho `X-Webhook-Signature`.

Exemplo de middleware/controller em Node.js na aplicação cliente para validar a autenticidade do alerta e renovar o token automaticamente:

~~~typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
~~~

Payload entregue pelo Webhook:
~~~json
{
  "event": "token.expiring_soon",
  "jti": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "clientId": "external-partner-client",
  "userId": null,
  "tokenContext": "ISSUED_BY_US",
  "grantType": "client_credentials",
  "expiresAt": "2026-11-08T21:15:00.000Z",
  "remainingSeconds": 142,
  "geolocation": {
    "latitude": -8.047562,
    "longitude": -34.876964
  },
  "timestamp": "2026-11-08T21:12:38.000Z"
}
~~~

### 5.4. Acoplando a outro Banco de Dados Relacional (MySQL / MariaDB)
Como as entidades foram construídas de forma agnóstica:
1. Instale o driver correspondente no backend (`npm install mysql2`).
2. Altere as variáveis no arquivo `.env`:
   ~~~env
   DB_TYPE=mysql
   DB_PORT=3306
   ~~~
3. Nenhuma alteração nas entidades `User`, `OAuthClient` ou `SessionAudit` é necessária.

### 5.5. Consumindo os Componentes Federados em Outro Host Vite
Qualquer outra aplicação React + Vite pode importar os monitores e o gerador PKCE adicionando o `provider_app` nos `remotes` do `vite.config.ts`:

~~~typescript
federation({
  name: 'novo_host',
  remotes: {
    provider_app: 'http://localhost:5173/assets/remoteEntry.js',
  },
  shared: ['react', 'react-dom', 'lucide-react', 'zod'],
})
~~~