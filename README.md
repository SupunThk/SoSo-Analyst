# SoSo Analyst 🤖📈

SoSo Analyst is a professional AI-powered crypto research terminal. It allows users to ask natural language questions about crypto markets and receive data-backed, analyst-grade answers.

## Features
- **AI Agent Loop**: Uses Google Gemini 2.0 Flash to decide which data to fetch based on user queries.
- **Real-time Data**: Proxies 30+ SoSoValue API endpoints for live market data, ETF flows, and public company holdings.
- **Terminal Aesthetic**: A clean, dark-themed UI designed for professional researchers.
- **Secure Architecture**: All API keys are kept server-side in the Node.js/Express backend.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, TypeScript.
- **Backend**: Node.js, Express, Axios, @google/generative-ai.
- **Deployment**: Vercel (Frontend), Render (Backend).

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [SoSoValue API Key](https://sosovalue.com/api)
- [Google Gemini API Key](https://aistudio.google.com/)

### Installation
1. Clone the repository.
2. Run the install script:
   ```bash
   npm run install:all
   ```

### Environment Variables

#### Backend (`/backend/.env`)
```env
PORT=3001
SOSO_API_KEY=your_sosovalue_key
GEMINI_API_KEY=your_gemini_key
BACKEND_URL=http://localhost:3001
```

#### Frontend (`/frontend/.env.local`)
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### Development
Start both backend and frontend concurrently:
```bash
npm run dev
```

## Deployment

### Backend (Render)
- Deploy the `/backend` directory.
- Use the `render.yaml` configuration.
- Set `SOSO_API_KEY` and `GEMINI_API_KEY` in Render dashboard.

### Frontend (Vercel)
- Deploy the `/frontend` directory.
- Set `NEXT_PUBLIC_BACKEND_URL` to your Render service URL.

---

*Note: This project is for research purposes. Always verify financial data.*
"# SoSo-Analyst" 
