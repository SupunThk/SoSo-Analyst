'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import { QUICK_PROMPTS } from '@/lib/quickPrompts';

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
  onRunQuery?: (query: string) => void;
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
  onRunQuery,
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

  if (!isOpen && !isMobileOpen) return null;

  const sidebarContent = (
    <div
      className={`glass-panel flex flex-col h-full border-r border-border/90 overflow-hidden shrink-0 z-20 transition-[width] duration-300 ease-in-out md:shadow-[6px_0_40px_rgba(0,0,0,0.55)] ${
        isMinimized ? 'w-16' : 'w-[272px]'
      }`}
    >
      {/* New chat + collapse */}
      <div className={`flex items-center gap-2 border-b border-border p-3 ${isMinimized ? 'flex-col' : ''}`}>
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile?.();
          }}
          className={`group flex h-10 items-center gap-2 rounded-lg border border-accent-green/35 bg-accent-green/[0.06] font-sans text-sm font-medium text-accent-green transition-colors hover:border-accent-green/70 hover:bg-accent-green/[0.12] ${
            isMinimized ? 'w-10 justify-center' : 'flex-1 px-3'
          }`}
          title="New chat"
          aria-label="New chat"
        >
          <Icon name="plus" size={16} strokeWidth={2} />
          {!isMinimized && <span>New chat</span>}
        </button>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          type="button"
          className="hidden h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-white md:flex"
          title={isMinimized ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isMinimized ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={isMinimized ? 'chevronRight' : 'chevronLeft'} size={16} />
        </button>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
            aria-label="Close sessions sidebar"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Quick commands */}
      {onRunQuery && !isMinimized && (
        <div className="border-b border-border px-3 py-3">
          <div className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Quick commands
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => {
                  onRunQuery(prompt.text);
                  onCloseMobile?.();
                }}
                className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface/60 px-2 py-1.5 text-left font-sans text-xs text-text-primary transition-colors hover:border-accent-green/40 hover:text-white"
                title={prompt.label}
              >
                <Icon name={prompt.icon} size={13} className="shrink-0 text-accent-green" />
                <span className="truncate">{prompt.short}</span>
              </button>
            ))}
          </div>
          {walletAddress && (
            <button
              type="button"
              onClick={() => {
                onAnalyzePortfolio?.();
                onCloseMobile?.();
              }}
              className="mt-1.5 flex w-full items-center gap-1.5 rounded-md border border-accent-amber/30 bg-accent-amber/[0.05] px-2 py-1.5 font-sans text-xs text-accent-amber transition-colors hover:border-accent-amber/60"
            >
              <Icon name="briefcase" size={13} className="shrink-0" />
              Analyze my portfolio
            </button>
          )}
        </div>
      )}

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {!isMinimized && (
          <div className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            History
          </div>
        )}
        {!walletAddress ? (
          isMinimized ? null : (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
              <p className="font-sans text-xs leading-relaxed text-text-secondary">
                Connect a wallet to save chats, revisit history and rate answers.
              </p>
            </div>
          )
        ) : isChatsLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`w-full ${isMinimized ? 'h-8' : 'h-14'} bg-[#060A06] border border-border/40 rounded-sm animate-pulse`} />
            ))}
          </div>
        ) : chats.length === 0 ? (
          isMinimized ? null : (
            <p className="px-1 py-2 font-sans text-xs text-text-secondary">No saved chats yet.</p>
          )
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
                  className={`w-full ${isMinimized ? 'text-center p-2' : 'text-left px-3 py-2.5 pr-8'} rounded-md border transition-colors ${
                    activeChatId === chat._id
                      ? 'bg-accent-green/[0.08] border-accent-green/40'
                      : 'bg-transparent border-transparent hover:bg-white/[0.04]'
                  }`}
                  title={isMinimized ? chat.title : undefined}
                  aria-current={activeChatId === chat._id ? 'true' : undefined}
                >
                  <div className={`font-sans text-[13px] text-white ${isMinimized ? 'truncate text-center' : 'truncate'}`}>
                    {isMinimized ? chat.title.substring(0, 2).toUpperCase() : chat.title}
                  </div>
                  {!isMinimized && (
                    <div className="mt-0.5 font-mono text-[10px] text-text-secondary">
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

      {/* Footer */}
      <div className="border-t border-border">
        {onOpenManual && (
          <button
            type="button"
            onClick={() => {
              onOpenManual();
              onCloseMobile?.();
            }}
            className={`flex w-full items-center gap-2 px-4 py-3 font-sans text-xs text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-white ${isMinimized ? 'justify-center' : ''}`}
            aria-label="Open system manual"
            title="System manual"
          >
            <Icon name="help" size={15} className="shrink-0" />
            {!isMinimized && <span>Manual &amp; shortcuts</span>}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {isOpen && (
        <div className="hidden md:flex h-full">
          {sidebarContent}
        </div>
      )}

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
