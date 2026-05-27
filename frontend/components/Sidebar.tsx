'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatSession {
  _id: string;
  title: string;
  updatedAt: string;
}

interface SidebarProps {
  isOpen: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat?: (chatId: string) => void;
  onAnalyzePortfolio?: () => void;
  onOpenManual?: () => void;
  walletAddress: string | null;
  isChatsLoading?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isMobileOpen,
  onCloseMobile,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onAnalyzePortfolio,
  onOpenManual,
  walletAddress,
  isChatsLoading,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Escape key closes mobile sidebar
  useEffect(() => {
    if (!isMobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobileOpen, onCloseMobile]);

  if (!isOpen) return null;

  const sidebarContent = (
    <div
      className={`glass-panel flex flex-col h-full border-r border-border/90 overflow-hidden shrink-0 z-20 transition-[width] duration-300 ease-in-out md:shadow-[6px_0_40px_rgba(0,0,0,0.55)] ${
        isMinimized ? 'w-16' : 'w-64'
      }`}
    >
      {/* Sidebar Header & Toggle */}
      <div className={`flex items-center p-4 border-b border-border ${isMinimized ? 'justify-center' : 'justify-between'}`}>
        {!isMinimized && (
          <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase">
            SESSIONS
          </span>
        )}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          type="button"
          className="text-text-secondary hover:text-accent-green transition-colors font-mono text-xs hidden md:block"
          title={isMinimized ? 'Expand Sidebar' : 'Minimize Sidebar'}
          aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isMinimized ? '[>]' : '[<]'}
        </button>
        {/* Close button for mobile */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="text-text-secondary hover:text-accent-green transition-colors font-mono text-xs md:hidden"
            title="Close Sidebar"
            aria-label="Close sessions sidebar"
          >
            [✕]
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-b border-border">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile?.();
          }}
          disabled={!walletAddress}
          className={`w-full flex items-center ${isMinimized ? 'justify-center px-0' : 'justify-between px-4'} py-3 border border-accent-green/30 bg-accent-green/5 hover:bg-accent-green/10 hover:border-accent-green/60 transition-all rounded-sm disabled:opacity-50 disabled:cursor-not-allowed group`}
          title="New Terminal Session"
          aria-label="New terminal session"
        >
          {!isMinimized && (
            <span className="text-xs font-mono font-bold text-accent-green tracking-widest uppercase group-hover:text-white transition-colors">
              [NEW TERMINAL]
            </span>
          )}
          <span className="text-accent-green font-mono">+</span>
        </button>

        {walletAddress && !isMinimized && (
          <button
            type="button"
            onClick={() => {
              onAnalyzePortfolio?.();
              onCloseMobile?.();
            }}
            className="w-full mt-2 flex items-center justify-between px-4 py-3 border border-accent-amber/30 bg-accent-amber/5 hover:bg-accent-amber/10 hover:border-accent-amber/60 transition-all rounded-sm group"
            title="Analyze Your Portfolio"
            aria-label="Analyze portfolio"
          >
            <span className="text-xs font-mono font-bold text-accent-amber tracking-widest uppercase group-hover:text-white transition-colors">
              [ANALYZE PORTFOLIO]
            </span>
            <span className="text-accent-amber font-mono">💼</span>
          </button>
        )}
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {!walletAddress ? (
          /* ── Polished Empty State ── */
          <div className="flex flex-col items-center justify-center mt-8 px-3">
            {isMinimized ? (
              <span className="text-[10px] font-mono text-text-secondary">!</span>
            ) : (
              <>
                {/* Wallet icon */}
                <div className="wallet-icon-pulse mb-4">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-accent-green/50">
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
                  </svg>
                </div>
                <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase text-center mb-2">
                  NO WALLET CONNECTED
                </span>
                <p className="text-[9px] font-mono text-text-secondary/60 text-center leading-relaxed mb-4">
                  Connect your wallet to save sessions, track history, and rate responses.
                </p>

                {/* Divider */}
                <div className="w-full border-t border-border my-3" />

                {/* Featured Queries */}
                <span className="text-[8px] font-mono text-text-secondary/50 tracking-widest uppercase w-full mb-2">
                  ▸ QUICK COMMANDS
                </span>
                {[
                  { icon: '📊', text: 'BTC vs ETH' },
                  { icon: '💹', text: 'ETF Flows' },
                  { icon: '🔥', text: 'Sector Spotlight' },
                ].map((q) => (
                  <div
                    key={q.text}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-mono text-text-secondary/50 border border-border/50 rounded-sm mb-1"
                  >
                    <span className="text-xs">{q.icon}</span>
                    <span className="tracking-tight">{q.text}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : isChatsLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`w-full ${isMinimized ? 'h-8' : 'h-14'} bg-[#060A06] border border-border/40 rounded-sm animate-pulse`} />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="text-center mt-10 px-2">
            <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase">
              {isMinimized ? '0' : 'NO ACTIVE SESSIONS'}
            </span>
          </div>
        ) : (
          <motion.div 
            initial="hidden" 
            animate="visible" 
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
              hidden: {}
            }}
            className="flex flex-col space-y-2"
          >
            <AnimatePresence>
            {chats.map((chat) => (
              <motion.div 
                key={chat._id} 
                className="relative group"
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  visible: { opacity: 1, x: 0 }
                }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectChat(chat._id);
                    onCloseMobile?.();
                  }}
                  className={`w-full ${isMinimized ? 'text-center p-2' : 'text-left p-3 pr-8'} rounded-sm border transition-all ${
                    activeChatId === chat._id
                      ? 'bg-accent-green/10 border-accent-green/50'
                      : 'bg-transparent border-transparent hover:bg-white/5'
                  }`}
                  title={isMinimized ? chat.title : undefined}
                >
                  <div className={`text-xs font-mono text-white mb-1 ${isMinimized ? 'truncate text-center' : 'truncate'}`}>
                    {isMinimized ? chat.title.substring(0, 2).toUpperCase() : chat.title}
                  </div>
                  {!isMinimized && (
                    <div className="text-[9px] font-mono text-text-secondary">
                      {new Date(chat.updatedAt).toLocaleDateString()}
                    </div>
                  )}
                </button>
                
                {!isMinimized && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === chat._id ? null : chat._id);
                      }}
                      className="text-text-secondary hover:text-white p-1"
                      aria-label={`Options for ${chat.title}`}
                      aria-expanded={openMenuId === chat._id}
                      aria-haspopup="menu"
                    >
                      ⋮
                    </button>
                  </div>
                )}
                
                {openMenuId === chat._id && !isMinimized && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setOpenMenuId(null)} 
                    />
                    <div
                      className="absolute right-2 top-10 bg-[#060A06] border border-border z-30 rounded-sm shadow-[0_4px_30px_rgba(0,0,0,0.6)] py-1"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation(); 
                          if (onDeleteChat) onDeleteChat(chat._id); 
                          setOpenMenuId(null); 
                        }}
                        className="text-[10px] font-mono font-bold text-accent-amber hover:bg-white/5 px-4 py-2 w-full text-left tracking-widest uppercase transition-colors"
                      >
                        DELETE
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Footer — System Manual on mobile + branding */}
      <div className={`border-t border-border bg-[#020302]`}>
        {/* System Manual link (shown on mobile sidebar) */}
        {onOpenManual && (
          <button
            type="button"
            onClick={() => {
              onOpenManual();
              onCloseMobile?.();
            }}
            className="w-full md:hidden flex items-center gap-2 px-4 py-3 border-b border-border text-accent-green/80 hover:text-accent-green hover:bg-accent-green/5 transition-colors"
            aria-label="Open system manual"
          >
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase">
              [SYSTEM MANUAL]
            </span>
          </button>
        )}
        <div className={`p-4 flex items-center ${isMinimized ? 'justify-center' : 'justify-start'}`}>
          <div className={`flex items-center ${isMinimized ? 'justify-center' : 'gap-2'}`} title="System Online">
            <div className="w-1.5 h-1.5 bg-accent-green rounded-full shadow-[0_0_8px_rgba(0,255,157,0.6)] shrink-0" />
            {!isMinimized && (
              <span className="text-[9px] font-mono text-text-secondary uppercase tracking-[0.2em]">
                System Online
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm sidebar-backdrop-enter"
            onClick={onCloseMobile}
            aria-hidden
          />
          {/* Sidebar panel */}
          <div
            id="sessions-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="Saved sessions"
            className="relative z-10 sidebar-mobile-enter"
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
