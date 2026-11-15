export type MessageRole = 'user' | 'assistant' | 'system';

export interface ImageAttachment {
  id: string;
  data: string; // Base64 string without data URL prefix
  mimeType: string;
  name?: string;
}

export interface GenerationStats {
  tokensPerSecond?: number;
  completionTokens?: number;
  promptTokens?: number;
  elapsedMs?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  images?: ImageAttachment[];
  createdAt: number;
  modelId?: string;
  stats?: GenerationStats;
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  modelId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ModelOption {
  id: string;
  label: string;
  shortName: string;
  speedLabel: string;
  specialty: string;
  description: string;
}
