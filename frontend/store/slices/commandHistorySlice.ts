import type { TerminalGet, TerminalSet } from './types';
export interface CommandHistorySlice {
  input: string;
  draftInput: string;
  commandHistory: string[];
  historyIndex: number;
  setInput: (input: string) => void;
  setDraftInput: (input: string) => void;
  addCommand: (cmd: string) => void;
  setHistoryIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const createCommandHistorySlice = (set: TerminalSet, get: TerminalGet): CommandHistorySlice => ({
  input: '',
  draftInput: '',
  commandHistory: [],
  historyIndex: -1,
  setInput: (input) => set({ input }),
  setDraftInput: (draftInput) => set({ draftInput }),
  addCommand: (cmd) => set((state) => ({
    commandHistory: [cmd, ...state.commandHistory].slice(0, 50),
    historyIndex: -1,
  })),
  setHistoryIndex: (historyIndex) => set({ historyIndex }),
  
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { commandHistory, historyIndex, setHistoryIndex, setInput, input, setDraftInput, draftInput } = get();
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        if (historyIndex === -1) {
          setDraftInput(input);
        }
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput(draftInput);
      }
    }
  }
});
