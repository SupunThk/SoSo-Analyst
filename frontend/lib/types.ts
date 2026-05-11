export type ToolInputValue = string | number | boolean | null | undefined;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
}

export interface ToolCall {
  name: string;
  input: Record<string, ToolInputValue>;
  result: string;
  status: 'success' | 'error';
}

export interface ConversationHistoryMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface ChatResponse {
  answer: string;
  toolCalls: ToolCall[];
}
