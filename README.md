# SoSo Analyst 🤖📈

SoSo Analyst is a professional AI-powered crypto research terminal. It allows users to ask natural language questions about crypto markets and receive data-backed, analyst-grade answers.

## Features
- **AI Agent Loop**: Uses Google Gemini 2.5 Flash to decide which data to fetch based on user queries.
- **Real-time Data**: Proxies 30+ SoSoValue API endpoints for live market data, ETF flows, and public company holdings.
- **Trading Terminal**: A fully-fledged charting interface with real-time Order Book depth, live recent trades feed, and interactive technical indicators (Volume, Moving Averages) powered by `lightweight-charts` and WebSocket streams.
- **Terminal Aesthetic**: A clean, dark-themed UI designed for professional researchers.
- **Secure Architecture**: API keys stay server-side, chat history uses signed wallet sessions, and backend routes include request validation/rate limiting.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), Tailwind CSS, TypeScript.
- **Deployment**: Vercel (Frontend), Render (Backend).

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.9+)
- [SoSoValue API Key](https://sosovalue.com/api)
- [Google Gemini API Key](https://aistudio.google.com/)
- [Etherscan API Key](https://etherscan.io/apis) for wallet portfolio analysis
- SoDEX API key name for signed SoDEX actions; public SoDEX reads use the documented REST API

### Installation
1. Clone the repository.
2. Run the install script:
   ```bash
   npm run install:all
   ```

### Environment Variables
Example files are provided at `/backend/.env.example` and `/frontend/.env.local.example`.

#### Backend (`/backend/.env`)
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
```

`ETHERSCAN_CHAIN_IDS` controls the EVM chains scanned for wallet portfolio analysis. Defaults cover Ethereum, Base, BNB Smart Chain, Polygon, Arbitrum, OP Mainnet, and Avalanche C-Chain. Some Etherscan V2 chains require a paid API tier; failed chains are reported in the portfolio response instead of failing the whole analysis.

#### Frontend (`/frontend/.env.local`)
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### Development
Start both backend and frontend concurrently:
```bash
npm run dev
```

Wallet history requires signing a backend nonce in the browser wallet. Market analysis still works without a wallet, but saved sessions require `MONGO_URI` and a verified wallet session.

Health endpoints:
- `GET /health` returns liveness plus MongoDB readiness and responds `503` when a configured database is disconnected.
- `GET /ready` returns readiness for deploy and uptime monitors.

## Deployment

### Backend (Render)
- Deploy with the root `render.yaml`; it points Render at the `/backend` directory.
- Use the `render.yaml` configuration.
- Set `SOSO_API_KEY`, `GEMINI_API_KEY`, `ETHERSCAN_API_KEY`, `MONGO_URI`, and `CORS_ORIGIN` in the Render dashboard.
- In production, the backend fails fast if required secrets or `CORS_ORIGIN` are missing.

### Frontend (Vercel)
- Deploy the `/frontend` directory.
- Set `NEXT_PUBLIC_BACKEND_URL` to your Render service URL.

---

*Note: This project is for research purposes. Always verify financial data.*
"# SoSo-Analyst" 
