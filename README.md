# LogiTrack

Sistema de gestão logística com painéis web para **admin**, **gestor** e **motorista**.

## Pré-requisitos

- Node.js 20+

## Executar localmente

```bash
npm install
npm run dev
```

O app sobe em `http://localhost:3000` (API REST + frontend na mesma porta).

## Build de produção (local)

```bash
npm run build
npm start
```

## Deploy (Vercel + Railway)

### 1. Backend — Railway

1. Crie um projeto em [railway.app](https://railway.app) apontando para este repositório.
2. O `railway.toml` já configura build e start.
3. Variáveis de ambiente (opcional):
   - `DATABASE_PATH=/data/logistic.db` — se usar volume persistente
4. **Recomendado:** adicione um **Volume** montado em `/data` para o SQLite não perder dados entre redeploys.
5. Após o deploy, copie a URL pública da API (ex: `https://logitrack-api.up.railway.app`).

### 2. Frontend — Vercel

1. Importe o repositório em [vercel.com](https://vercel.com).
2. Framework: **Vite** | Build: `npm run build` | Output: `dist`
3. Adicione a variável de ambiente:

| Variável | Valor |
|----------|-------|
| `VITE_API_URL` | URL do Railway (sem `/` no final) |
| `VITE_WS_URL` | Mesma URL do Railway (para notificações do motorista) |

4. Deploy. A URL da Vercel é a que os usuários acessam.

### Banco limpo

O deploy inicia **sem OS, rotas ou checklists**. Apenas as 3 contas de acesso abaixo são criadas automaticamente.

## Usuários de acesso

| E-mail | Senha | Papel |
|--------|-------|-------|
| `admin@logitrack.com` | `admin123` | admin |
| `gestor@logitrack.com` | `gestor123` | gestor |
| `motorista@logitrack.com` | `123456` | motorista |

## Estrutura

- `server.ts` — API Express, SQLite, WebSocket e servidor Vite
- `src/` — frontend React (painel admin/gestor + interface motorista web)
- `vercel.json` — configuração do frontend na Vercel
- `railway.toml` — configuração do backend no Railway
