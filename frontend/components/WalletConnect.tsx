'use client';

import React, { useCallback, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { WalletConnection } from '@/lib/types';
import toast from 'react-hot-toast';

interface WalletConnectProps {
  onConnect: (connection: WalletConnection) => void | Promise<void>;
  walletAddress: string | null;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ onConnect, walletAddress }) => {
  const { address, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticatedWalletMatches =
    walletAddress && address && walletAddress.toLowerCase() === address.toLowerCase();

  const handleSignIn = useCallback(async () => {
    if (!address || !connector || isAuthenticating) {
      return;
    }

    setIsAuthenticating(true);
    try {
      await onConnect({
        address,
        signMessage: async (message: string) => {
          return await signMessageAsync({ message, account: address, connector });
        }
      });
      toast.success('Wallet signed in');
    } catch (err: unknown) {
      console.error("Auth error", err);
      const errorName = err instanceof Error ? err.name : '';
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorName === 'UserRejectedRequestError' || errorMessage.includes('User rejected')) {
        toast.error('Signature request rejected');
      } else {
        toast.error('Authentication failed');
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, connector, isAuthenticating, onConnect, signMessageAsync]);

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === 'authenticated');

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="flex items-center justify-center px-2.5 sm:px-4 py-1.5 bg-accent-green text-[#030503] hover:bg-accent-green/92 transition-all rounded-md cursor-pointer shadow-[0_0_22px_rgba(0,255,157,0.18)] hover:shadow-[0_0_32px_rgba(0,255,157,0.28)]"
            >
              <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase">
                CONNECT WALLET
              </span>
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="flex items-center justify-center px-2.5 sm:px-4 py-1.5 border border-red-500/45 bg-red-500/[0.08] text-red-400 transition-all rounded-md cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase">
                WRONG NETWORK
              </span>
            </button>
          );
        }

        if (!authenticatedWalletMatches) {
          return (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={openAccountModal}
                className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 border border-accent-amber/30 bg-accent-amber/[0.06] rounded-md cursor-pointer hover:bg-accent-amber/[0.1] transition-colors"
                aria-label="Connected wallet account"
                title="Connected wallet account"
              >
                <div className="w-1.5 h-1.5 bg-accent-amber rounded-full shadow-[0_0_8px_rgba(245,166,35,0.55)]" />
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-accent-amber tracking-widest uppercase">
                  {account.displayName}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthenticating || !address || !connector}
                className="flex items-center justify-center px-2.5 sm:px-4 py-1.5 bg-accent-green text-[#030503] hover:bg-accent-green/92 transition-all rounded-md cursor-pointer shadow-[0_0_22px_rgba(0,255,157,0.18)] hover:shadow-[0_0_32px_rgba(0,255,157,0.28)] disabled:opacity-60 disabled:cursor-wait"
                aria-label="Sign in with connected wallet"
                title="Sign in with connected wallet"
              >
                <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase">
                  {isAuthenticating ? 'SIGNING...' : 'SIGN IN'}
                </span>
              </button>
            </div>
          );
        }

        return (
          <div className="flex gap-2">
            <button
              onClick={openAccountModal}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 border border-accent-green/35 bg-accent-green/[0.08] rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_20px_rgba(0,0,0,0.35)] cursor-pointer hover:bg-accent-green/[0.12] transition-colors"
            >
              <div className="w-1.5 h-1.5 bg-accent-green rounded-full shadow-[0_0_8px_rgba(0,255,157,0.6)] animate-pulse" />
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-accent-green tracking-widest uppercase">
                {account.displayName}
              </span>
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default WalletConnect;
