'use client';

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useTerminalStore } from '@/store/useTerminalStore';

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const clearChat = useTerminalStore((state) => state.clearChat);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="bg-[#0A100C] border border-accent-green/30 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <Command label="Command Menu" className="w-full">
          <Command.Input 
            placeholder="Type a command or search..." 
            className="w-full bg-transparent border-b border-border/50 text-white p-4 focus:outline-none placeholder:text-text-secondary font-mono text-sm"
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar">
            <Command.Empty className="p-4 text-center text-text-secondary text-sm font-mono">No results found.</Command.Empty>

            <Command.Group heading="Actions" className="text-xs text-text-secondary/70 uppercase tracking-wider font-mono p-2">
              <Command.Item 
                onSelect={() => {
                  clearChat();
                  setOpen(false);
                }}
                className="flex items-center gap-2 p-2 mt-1 rounded cursor-pointer text-white hover:bg-accent-green/10 hover:text-accent-green text-sm font-mono transition-colors"
              >
                Clear Chat
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigation" className="text-xs text-text-secondary/70 uppercase tracking-wider font-mono p-2 mt-2">
              <Command.Item 
                onSelect={() => {
                  router.push('/settings');
                  setOpen(false);
                }}
                className="flex items-center gap-2 p-2 mt-1 rounded cursor-pointer text-white hover:bg-accent-green/10 hover:text-accent-green text-sm font-mono transition-colors"
              >
                Settings
              </Command.Item>
              <Command.Item 
                onSelect={() => {
                  router.push('/about');
                  setOpen(false);
                }}
                className="flex items-center gap-2 p-2 mt-1 rounded cursor-pointer text-white hover:bg-accent-green/10 hover:text-accent-green text-sm font-mono transition-colors"
              >
                About
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
