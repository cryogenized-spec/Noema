export type MessageRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
