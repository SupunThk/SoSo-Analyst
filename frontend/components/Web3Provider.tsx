'use client';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum, base } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

export const wagmiConfig = getDefaultConfig({
  appName: 'SoSo Analyst',
  // Provide a valid Project ID so RainbowKit enables WalletConnect and Coinbase.
  // Without this, only MetaMask is available, causing the modal to be skipped.
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '3fcc6bba6f1de962d911bb5b5c3dba68',
  chains: [mainnet, polygon, optimism, arbitrum, base],
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
