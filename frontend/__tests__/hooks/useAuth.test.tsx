import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import * as api from '@/lib/api';
import * as session from '@/lib/session';

const wagmiMocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  requestWalletNonce: vi.fn(),
  verifyWalletSignature: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useAccount: wagmiMocks.useAccount,
}));

vi.mock('@/lib/session', () => ({
  clearStoredAuthSession: vi.fn(),
  loadStoredAuthSession: vi.fn(),
  saveStoredAuthSession: vi.fn(),
}));

const TestComponent = () => {
  const { walletAddress, handleWalletConnect, handleLogout } = useAuth();
  return (
    <div>
      <div data-testid="address">{walletAddress || 'none'}</div>
      <button 
        onClick={() => handleWalletConnect({ address: '0x123', signMessage: vi.fn().mockResolvedValue('sig') })}
        data-testid="connect-btn"
      >
        Connect
      </button>
      <button onClick={handleLogout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
};

describe('AuthProvider & useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wagmiMocks.useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
  });

  it('does not expose stored session until wallet is connected', async () => {
    vi.mocked(session.loadStoredAuthSession).mockReturnValue({
      success: true,
      walletAddress: '0xabc',
      token: 'test-token',
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('address')).toHaveTextContent('none');

    await waitFor(() => {
      expect(session.loadStoredAuthSession).toHaveBeenCalled();
    });

    expect(screen.getByTestId('address')).toHaveTextContent('none');
  });

  it('exposes stored session when the same wallet is connected', async () => {
    wagmiMocks.useAccount.mockReturnValue({
      address: '0xAbC',
      isConnected: true,
    });
    vi.mocked(session.loadStoredAuthSession).mockReturnValue({
      success: true,
      walletAddress: '0xabc',
      token: 'test-token',
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('address')).toHaveTextContent('0xabc');
    });
  });

  it('handles wallet connection successfully', async () => {
    wagmiMocks.useAccount.mockReturnValue({
      address: '0x123',
      isConnected: true,
    });
    vi.mocked(session.loadStoredAuthSession).mockReturnValue(null);
    vi.mocked(api.requestWalletNonce).mockResolvedValue({
      walletAddress: '0x123',
      message: 'sign this',
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });
    vi.mocked(api.verifyWalletSignature).mockResolvedValue({
      success: true,
      walletAddress: '0x123',
      token: 'new-token',
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('connect-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('address')).toHaveTextContent('0x123');
    });

    expect(api.requestWalletNonce).toHaveBeenCalledWith('0x123');
    expect(session.saveStoredAuthSession).toHaveBeenCalled();
  });
});
