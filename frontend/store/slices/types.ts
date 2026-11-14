import type { StoreApi } from 'zustand';
import type { TerminalState } from '../useTerminalStore';

// Slices read and write the combined terminal store (e.g. the stream slice resets activeChatId).
export type TerminalSet = StoreApi<TerminalState>['setState'];
export type TerminalGet = StoreApi<TerminalState>['getState'];
