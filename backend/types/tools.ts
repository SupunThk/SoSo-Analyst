/**
 * Arguments for a data tool. They come from Gemini function calls (or the
 * router), so every executor validates and normalises what it reads.
 */
export type ToolArgs = Record<string, any>;

/** What executeTool returns to the agent loop and routes. */
export interface ToolExecutionResult {
  status: 'success' | 'error' | string;
  /** Normalised tool output (dataPreview, analysis, ...) or error details. */
  payload: Record<string, any>;
  [key: string]: any;
}
