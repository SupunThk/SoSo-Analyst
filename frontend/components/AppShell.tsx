'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import LiveTicker from '@/components/LiveTicker';
import Sidebar from '@/components/Sidebar';
import SystemManualModal from '@/components/SystemManualModal';
import MobileNav from '@/components/MobileNav';
import TerminalBoot from '@/components/TerminalBoot';
import { useAuth } from '@/hooks/useAuth';
import { useTerminalStore, WELCOME_MESSAGE } from '@/store/useTerminalStore';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const { walletAddress, authSession, handleWalletConnect, handleLogout } = useAuth();
  
  const {
    chats, activeChatId, setActiveChatId, setChats, setIsChatsLoading, loadChats, handleDeleteChat, isChatsLoading,
    setMessages, clearChat, loadSession,
    setInput, addCommand, handleSubmit
  } = useTerminalStore();

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    useTerminalStore.setState({ persistedMessageCount: 0 });
    setMessages([WELCOME_MESSAGE]);
    if (pathname !== '/') {
      router.push('/');
    }
  }, [setActiveChatId, setMessages, pathname, router]);

  const handleClear = useCallback(() => {
    handleNewChat();
  }, [handleNewChat]);

  useEffect(() => {
    const openManual = () => setIsManualOpen(true);
    window.addEventListener('soso:open-manual', openManual);
    return () => window.removeEventListener('soso:open-manual', openManual);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        handleClear();
      }
      if (e.key === 'Escape') {
        if (isManualOpen) {
          setIsManualOpen(false);
        } else if (isMobileSidebarOpen) {
          setIsMobileSidebarOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClear, isManualOpen, isMobileSidebarOpen]);

  const prevAuthRef = useRef({ wallet: walletAddress, token: authSession?.token });

  useEffect(() => {
    const currentWallet = walletAddress;
    const currentToken = authSession?.token;
    
    if (currentWallet && currentToken) {
      loadChats(currentWallet, currentToken, handleLogout);
      prevAuthRef.current = { wallet: currentWallet, token: currentToken };
      return;
    }

    if (prevAuthRef.current.wallet === currentWallet && prevAuthRef.current.token === currentToken) {
      return;
    }

    setChats([]);
    setIsChatsLoading(false);
    setActiveChatId(null);
    clearChat();
    prevAuthRef.current = { wallet: currentWallet, token: currentToken };
  }, [walletAddress, authSession, loadChats, handleLogout, setChats, setIsChatsLoading, setActiveChatId, clearChat]);

  const onWalletConnect = (conn: import('@/lib/types').WalletConnection) => handleWalletConnect(conn);

  const onSelectChat = (chatId: string) => {
    if (authSession) {
      loadSession(chatId, authSession.token, setActiveChatId);
      if (pathname !== '/') {
        router.push('/');
      }
    }
  };

  const onDeleteChat = (chatId: string) => {
    handleDeleteChat(chatId, authSession, handleNewChat);
  };

  const runQuery = (text: string) => {
    if (useTerminalStore.getState().isThinking) return;
    setInput('');
    addCommand(text);
    handleSubmit(
      text, 
      walletAddress, 
      authSession, 
      activeChatId, 
      setActiveChatId, 
      () => { if (walletAddress && authSession) loadChats(walletAddress, authSession.token, handleLogout); }
    );
    if (pathname !== '/') {
      router.push('/');
    }
  };

  // Pages outside the terminal (e.g. Perps Radar) hand questions to the chat.
  const runQueryRef = useRef(runQuery);
  useEffect(() => {
    runQueryRef.current = runQuery;
  });
  useEffect(() => {
    const handler = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query;
      if (typeof query === 'string' && query.trim()) runQueryRef.current(query);
    };
    window.addEventListener('soso:run-query', handler);
    return () => window.removeEventListener('soso:run-query', handler);
  }, []);

  const onAnalyzePortfolio = () => runQuery('Analyze my portfolio — check my holdings, risk profile, and market fit.');

  return (
    <>
      {booting &&<TerminalBoot onComplete={() => setBooting(false)} />}
      <div className="h-screen h-[100dvh] w-screen max-w-[100vw] bg-background overflow-hidden font-sans matrix-grid text-text-primary flex flex-col">
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 min-w-0 w-full max-w-full flex flex-col h-full max-h-full relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="shrink-0 z-20">
          <Header
            onOpenManual={() => setIsManualOpen(true)}
            onConnectWallet={onWalletConnect}
            walletAddress={walletAddress}
            onToggleMobileSidebar={pathname === '/' ? () => setIsMobileSidebarOpen((prev) => !prev) : undefined}
            mobileSidebarOpen={isMobileSidebarOpen}
          />
          <div className={pathname === '/' ? 'block' : 'hidden'}>
            <LiveTicker />
          </div>
        </div>

        <div className="flex-1 min-h-0 relative z-10 flex overflow-hidden">
          {pathname === '/' && (
            <Sidebar
              isOpen={true}
              isMobileOpen={isMobileSidebarOpen}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
              chats={chats}
              activeChatId={activeChatId}
              onSelectChat={onSelectChat}
              onNewChat={handleNewChat}
              onDeleteChat={onDeleteChat}
              onAnalyzePortfolio={onAnalyzePortfolio}
              onOpenManual={() => setIsManualOpen(true)}
              onRunQuery={runQuery}
              walletAddress={walletAddress}
              isChatsLoading={isChatsLoading}
            />
          )}

          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>
        </div>

        <MobileNav />

        {/* CRT Overlays */}
        <div className="crt-overlay pointer-events-none fixed inset-0 z-50" />
        <div className="crt-vignette pointer-events-none fixed inset-0 z-50" />

        <SystemManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      </main>
      </div>
    </>
  );
}
