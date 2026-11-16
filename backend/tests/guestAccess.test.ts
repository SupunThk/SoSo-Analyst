import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import User from '../models/User.ts';
import { GUEST_LIMIT_MESSAGE, resetGuestQuotas, sessionOrGuest } from '../utils/guestAccess.ts';

const startApp = async () => {
  const app = express();
  app.use(express.json());
  app.post('/chat', sessionOrGuest, (req: any, res) => {
    if (req.body.fail) return res.status(400).json({ error: 'bad request' });
    res.json({ guest: Boolean(req.guest), walletAddress: req.body.walletAddress, chatId: req.body.chatId });
  });
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { server, url: `http://127.0.0.1:${server.address().port}/chat` };
};

const ask = (url, body = {}) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

afterEach(() => {
  delete process.env.GUEST_CHAT_DAILY_LIMIT;
  resetGuestQuotas();
});

describe('guest chat access', () => {
  it('lets signed-out visitors ask a few questions, stripped of wallet and chat IDs', async () => {
    process.env.GUEST_CHAT_DAILY_LIMIT = '2';
    const { server, url } = await startApp();
    try {
      const first = await ask(url, { walletAddress: '0xabc', chatId: 'someone-elses-chat' });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ guest: true, walletAddress: null, chatId: null });
      expect((await ask(url)).status).toBe(200);

      const third = await ask(url);
      expect(third.status).toBe(401);
      const body = (await third.json()) as any;
      expect(body.code).toBe('GUEST_LIMIT');
      expect(body.error).toBe(GUEST_LIMIT_MESSAGE);
    } finally {
      server.close();
    }
  });

  it('requires a session when guest access is off', async () => {
    process.env.GUEST_CHAT_DAILY_LIMIT = '0';
    const { server, url } = await startApp();
    try {
      expect((await ask(url)).status).toBe(401);
    } finally {
      server.close();
    }
  });

  it('does not count failed requests against the guest allowance', async () => {
    process.env.GUEST_CHAT_DAILY_LIMIT = '1';
    const { server, url } = await startApp();
    try {
      expect((await ask(url, { fail: true })).status).toBe(400);
      expect((await ask(url, { fail: true })).status).toBe(400);
      expect((await ask(url)).status).toBe(200);
    } finally {
      server.close();
    }
  });

  it('answers an expired or unknown token with 401 instead of guest mode', async () => {
    process.env.GUEST_CHAT_DAILY_LIMIT = '3';
    const original = User.findOne;
    (User as any).findOne = async () => null;
    const { server, url } = await startApp();
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer expired' }, body: '{}' });
      expect(response.status).toBe(401);
    } finally {
      (User as any).findOne = original;
      server.close();
    }
  });
});
