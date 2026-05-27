'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { AuthSession, WalletConnection } from '@/lib/types';
import {
  clearStoredAuthSession,
  loadStoredAuthSession,
  saveStoredAuthSession,
} from '@/lib/session';
import { requestWalletNonce, verifyWalletSignature } from '@/lib/api';

interface AuthContextType {
  walletAddress: string | null;
  authSession: AuthSession | null;
  handleWalletConnect: (connection: WalletConnection, onSuccess?: (address: string, token: string) => void) => Promise<void>;
  handleLogout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isActiveSession = (session: AuthSession | null) =>
  Boolean(session && new Date(session.expiresAt) > new Date());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const { address: connectedAddress, isConnected } = useAccount();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = loadStoredAuthSession();
      if (!session) return;

      setAuthSession(session);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const handleWalletConnect = useCallback(async (
    connection: WalletConnection,
    onSuccess?: (address: string, token: string) => void
  ) => {
    const existingSessionValid =
      authSession?.walletAddress.toLowerCase() === connection.address.toLowerCase() &&
      new Date(authSession.expiresAt) > new Date();

    if (existingSessionValid) {
      onSuccess?.(authSession.walletAddress, authSession.token);
      return;
    }

    try {
      const nonce = await requestWalletNonce(connection.address);
      const signature = await connection.signMessage(nonce.message);
      const session = await verifyWalletSignature(nonce.walletAddress, signature);
      setAuthSession(session);
      saveStoredAuthSession(session);
      onSuccess?.(session.walletAddress, session.token);
    } catch (err) {
      console.error("Auth failed:", err);
      setAuthSession(null);
      clearStoredAuthSession();
      throw err;
    }
  }, [authSession]);

  const handleLogout = useCallback(() => {
    setAuthSession(null);
    clearStoredAuthSession();
  }, []);

  const walletAddress =
    isActiveSession(authSession) &&
    isConnected &&
    connectedAddress &&
    authSession?.walletAddress.toLowerCase() === connectedAddress.toLowerCase()
      ? authSession.walletAddress
      : null;

  const exposedAuthSession =
    walletAddress && authSession?.walletAddress.toLowerCase() === walletAddress.toLowerCase()
      ? authSession
      : null;

  return (
    <AuthContext.Provider value={{ walletAddress, authSession: exposedAuthSession, handleWalletConnect, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
