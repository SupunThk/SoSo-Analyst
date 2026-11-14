const DEVELOPMENT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const isProduction = () => process.env.NODE_ENV === 'production';

// Origins the frontend is served from. Shared by CORS and wallet login, so a login
// message can only ever name a site we actually host.
const getAllowedOrigins = () => {
  const configured = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return [...new Set([...configured, ...(isProduction() ? [] : DEVELOPMENT_ORIGINS)])];
};

const isAllowedOrigin = (origin) => Boolean(origin) && getAllowedOrigins().includes(origin);

module.exports = { getAllowedOrigins, isAllowedOrigin };
