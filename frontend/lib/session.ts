import { AuthSession } from './types';

const AUTH_SESSION_STORAGE_KEY = 'soso_auth_session';

const isValidSession = (value: unknown): value is AuthSession => {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AuthSession>;
  return (
    session.success === true &&
    typeof session.walletAddress === 'string' &&
    typeof session.token === 'string' &&
    typeof session.expiresAt === 'string' &&
    new Date(session.expiresAt) > new Date()
  );
};

export const loadStoredAuthSession = (): AuthSession | null => {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || 'null');
    if (isValidSession(parsed)) return parsed;
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }

  return null;
};

export const saveStoredAuthSession = (session: AuthSession) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearStoredAuthSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
};
