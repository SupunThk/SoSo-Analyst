import rateLimit, { MemoryStore } from 'express-rate-limit';
import { findSessionForRequest } from './auth.ts';

// Signed-out visitors may run a few chat questions per day before being asked
// to sign in, so first-time users see a real answer instead of a lock screen.
// GUEST_CHAT_DAILY_LIMIT=0 turns guest access off.
export const GUEST_LIMIT_MESSAGE =
  'You have used your free guest questions for today. Sign in with your wallet to keep going (valid wallet session is required).';

const guestDailyLimit = () => {
  const raw = process.env.GUEST_CHAT_DAILY_LIMIT;
  if (raw === undefined || raw === '') return 3;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 3;
};

// Created once at startup; the limit is read per request so it follows env.
// Only answered questions count: handlers set res.locals.requestFailed when
// a request errors (SSE errors still return HTTP 200).
const guestStore = new MemoryStore();

/** Clears every visitor's guest count (used by tests). */
export const resetGuestQuotas = () => guestStore.resetAll();

const guestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  store: guestStore,
  limit: () => guestDailyLimit(),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipFailedRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode < 400 && !res.locals?.requestFailed,
  handler: (req, res) => res.status(401).json({ error: GUEST_LIMIT_MESSAGE, message: GUEST_LIMIT_MESSAGE, code: 'GUEST_LIMIT' })
});

// Requests with a bearer token must carry a valid session (an expired token
// gets the usual 401 so the app asks the user to sign in again). Requests
// without one are guests: wallet and chat IDs are stripped (no portfolio
// tools, nothing saved) and counted against the per-IP daily allowance.
export const sessionOrGuest = async (req, res, next) => {
  if (req.get('authorization')) {
    try {
      const session = await findSessionForRequest(req);
      if (!session) {
        return res.status(401).json({ error: 'Valid wallet session is required.' });
      }
      req.auth = session;
      return next();
    } catch (error) {
      console.error('Session auth error:', error);
      return res.status(500).json({ error: 'Failed to authenticate session.' });
    }
  }

  if (guestDailyLimit() === 0) {
    return res.status(401).json({ error: 'Valid wallet session is required.' });
  }

  req.guest = true;
  if (req.body && typeof req.body === 'object') {
    req.body.walletAddress = null;
    req.body.chatId = null;
  }
  return guestLimiter(req, res, next);
};
