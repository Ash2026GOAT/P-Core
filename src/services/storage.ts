import { DEFAULT_MODEL_ID, isSupportedModelId } from '../config/models';
import type { ChatSession } from '../types/chat';

const CHATS_STORAGE_KEY = 'localmind_chats_v1';
const ACTIVE_CHAT_KEY = 'localmind_active_chat_v1';
const SELECTED_MODEL_KEY = 'localmind_selected_model_v1';
const JARVIS_VOICE_KEY = 'pcore_jarvis_voice_v1';

export function loadJarvisEnabled(): boolean {
  try {
    const saved = window.localStorage.getItem(JARVIS_VOICE_KEY);
    if (saved === null) return true;
    return saved === 'true';
  } catch {
    return true;
  }
}

export function saveJarvisEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(JARVIS_VOICE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

export function loadChats(): ChatSession[] {
  try {
    const raw = window.localStorage.getItem(CHATS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ChatSession =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          Array.isArray(item.messages)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveChats(chats: ChatSession[]): void {
  try {
    window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch (err) {
    console.warn('Failed to persist chats to localStorage:', err);
  }
}

export function loadActiveChatId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

export function saveActiveChatId(chatId: string | null): void {
  try {
    if (chatId) {
      window.localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
    } else {
      window.localStorage.removeItem(ACTIVE_CHAT_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSelectedModelId(): string {
  try {
    const saved = window.localStorage.getItem(SELECTED_MODEL_KEY);
    if (saved && isSupportedModelId(saved)) {
      return saved;
    }
    return DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

export function saveSelectedModelId(modelId: string): void {
  try {
    window.localStorage.setItem(SELECTED_MODEL_KEY, modelId);
  } catch {
    // Ignore storage quota errors
  }
}

export function createChatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function deriveChatTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New Conversation';
  if (cleaned.length <= 44) return cleaned;
  return `${cleaned.slice(0, 44).trimEnd()}…`;
}
