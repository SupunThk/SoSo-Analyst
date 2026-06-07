# SoSo Analyst

SoSo Analyst is a professional AI-powered crypto research terminal. It allows users to ask natural-language questions about crypto markets and receive data-backed, analyst-grade answers.

## Features

- **AI agent loop**: Uses Google Gemini to decide which data to fetch based on user queries.
- **Real-time data**: Proxies SoSoValue API endpoints for market data, ETF flows, public company holdings, macro events, news, indices, and sector intelligence.
- **Trading terminal**: Includes charting, order book depth, recent trades, and technical indicators powered by `lightweight-charts`.
- **Wallet sessions**: Wallet signing verifies ownership for saved chat history without authorizing blockchain transactions.
- **Secure architecture**: API keys stay server-side. Backend routes include request validation, rate limits, CORS restrictions, and health checks.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS.
- **Backend**: Node.js, Express, MongoDB/Mongoose.
- **AI/Data**: Gemini, SoSoValue, SoDEX, Etherscan.
- **Deployment**: Vercel for frontend, Render for backend.

## Getting Started

### Prerequisites

- Node.js `20.9+`
- npm `10+`
- SoSoValue API key
- Google Gemini API key
- Etherscan API key for wallet portfolio analysis
- MongoDB connection string for saved chats
- WalletConnect project ID for wallet UI
- Optional SoDEX API key name for signed SoDEX actions

### Installation

```bash
npm run install:all
```

### Environment Variables

An example backend env file is provided at `backend/.env.example`. Frontend env vars are listed below.

#### Backend: `backend/.env`

```env
PORT=3001
NODE_ENV=development
SOSO_API_KEY=your_sosovalue_key
GEMINI_API_KEY=your_gemini_key
ETHERSCAN_API_KEY=your_etherscan_key
SODEX_API_KEY=your_sodex_api_key_name
MONGO_URI=your_mongodb_connection_string
CORS_ORIGIN=http://localhost:3000
SOSO_REQUEST_TIMEOUT_MS=15000
GEMINI_REQUEST_TIMEOUT_MS=60000
ETHERSCAN_REQUEST_TIMEOUT_MS=15000
OPENOCEAN_REQUEST_TIMEOUT_MS=15000
SODEX_REQUEST_TIMEOUT_MS=15000
SODEX_NETWORK=mainnet
SODEX_REST_BASE_URL=https://mainnet-gw.sodex.dev/api/v1
ETHERSCAN_CHAIN_IDS=1,8453,56,137,42161,10,43114
ETHERSCAN_TOKEN_TRANSFER_OFFSET=100
ETHERSCAN_TOKENS_PER_CHAIN=12
AGENT_RATE_LIMIT_PER_MINUTE=20
CHAT_RATE_LIMIT_PER_MINUTE=60
SYSTEM_PROMPT_VERSION=v3
GEMINI_TOOL_PAYLOAD_MAX_CHARS=12000
```

`ETHERSCAN_CHAIN_IDS` controls the EVM chains scanned for wallet portfolio analysis. Defaults cover Ethereum, Base, BNB Smart Chain, Polygon, Arbitrum, OP Mainnet, and Avalanche C-Chain. Some Etherscan V2 chains require a paid API tier; failed chains are reported in the portfolio response instead of failing the whole analysis.

#### Frontend: `frontend/.env.local`

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

### Development

Start both backend and frontend:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Backend health: `http://localhost:3001/health`
- Backend readiness: `http://localhost:3001/ready`

Wallet history requires signing a backend nonce in the browser wallet. Market analysis still works without a wallet, but saved sessions require `MONGO_URI` and a verified wallet session.

## Testing

```bash
npm test --prefix backend
npm run lint --prefix frontend
npm exec --prefix frontend tsc -- --noEmit
npm test --prefix frontend
npm run build --prefix frontend
```

## Deployment

Deploy this repo as two services:

- Backend: Render web service from `backend`
- Frontend: Vercel Next.js project from `frontend`

### 1. Preflight

Before deploying, verify the app locally:

```bash
npm test --prefix backend
npm run build --prefix frontend
```

Commit and push the repo to GitHub.

### 2. Backend On Render

The repo includes `render.yaml` at the root. It configures:

- Service name: `soso-analyst-backend`
- Runtime: Node
- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/health`

Recommended path:

1. Open Render Dashboard.
2. New -> Blueprint.
3. Connect the GitHub repo.
4. Select the root `render.yaml`.
5. Enter values for all `sync: false` secrets.

Required Render env vars:

```env
NODE_ENV=production
SOSO_API_KEY=your_sosovalue_key
GEMINI_API_KEY=your_gemini_key
ETHERSCAN_API_KEY=your_etherscan_key
SODEX_API_KEY=your_sodex_api_key_name
MONGO_URI=your_mongodb_connection_string
CORS_ORIGIN=https://your-vercel-app.vercel.app
```

The remaining non-secret production defaults are already in `render.yaml`, including request timeouts, SoDEX mainnet URL, Etherscan chain IDs, and rate limits. If you create the service manually instead of using the Blueprint, copy those values from `render.yaml`.

After deploy, verify:

```text
https://your-render-service.onrender.com/health
```

Expected healthy response:

```json
{
  "status": "ok"
}
```

If MongoDB is configured but unreachable, `/health` returns `503`. Use MongoDB Atlas for `MONGO_URI` and allow Render network access.

### 3. Frontend On Vercel

Create a separate Vercel project for the frontend:

1. Import the same GitHub repo in Vercel.
2. Set Root Directory to `frontend`.
3. Framework Preset: Next.js.
4. Build Command: `npm run build`.
5. Install Command: leave default, or set `npm install`.
6. Output Directory: leave default.

Set Vercel env vars:

```env
NEXT_PUBLIC_BACKEND_URL=https://your-render-service.onrender.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

`NEXT_PUBLIC_BACKEND_URL` is baked into the browser bundle at build time. If you change it, redeploy the Vercel project.

The current `frontend/vercel.json` contains a default backend URL:

```json
{
  "env": {
    "NEXT_PUBLIC_BACKEND_URL": "https://soso-analyst-backend.onrender.com"
  }
}
```

Update this value or override it in Vercel Project Settings if your Render service URL is different.

### 4. Final Wiring

After Vercel deploys, copy the production frontend URL and update Render:

```env
CORS_ORIGIN=https://your-vercel-app.vercel.app
```

Then restart/redeploy the Render backend.

Smoke test production:

1. Open the Vercel URL.
2. Confirm market dashboard panels load.
3. Ask a simple market question.
4. Connect wallet and sign the nonce disclaimer.
5. Confirm chat history saves and reloads.

### Production Notes

- Render free instances can sleep, causing slow first responses. Use a paid Render instance for smoother chat streaming.
- Do not expose backend secrets in Vercel. Only `NEXT_PUBLIC_*` values belong in the frontend.
- `CORS_ORIGIN` must exactly match the Vercel origin, including `https://` and no trailing slash.
- Preview deploys have different Vercel URLs. Add those origins to `CORS_ORIGIN` only if you need preview environments to call the production backend.

## Disclaimer

This project is for research purposes. Always verify financial data before making decisions.
