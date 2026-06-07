'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    if (walletAddress && authSession) {
      loadChats(walletAddress, authSession.token, handleLogout);
      return;
    }

    setChats([]);
    setIsChatsLoading(false);
    setActiveChatId(null);
    clearChat();
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

  const onAnalyzePortfolio = () => {
    const text = 'Analyze my portfolio — check my holdings, risk profile, and market fit.';
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

  return (
    <>
      {booting && <TerminalBoot onComplete={() => setBooting(false)} />}
      <div className="h-screen h-[100dvh] w-screen max-w-[100vw] bg-background overflow-hidden font-sans matrix-grid text-text-primary">
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
