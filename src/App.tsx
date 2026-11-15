import { useEffect, useRef, useState } from 'react';
import { PanelLeft, Plus } from 'lucide-react';
import type { ChatMessage, ChatSession } from './types/chat';
import {
  createChatId,
  deriveChatTitle,
  loadActiveChatId,
  loadChats,
  loadSelectedModelId,
  saveActiveChatId,
  saveChats,
  saveSelectedModelId,
} from './services/storage';
import { Sidebar } from './components/Sidebar';
import { ModelSelector } from './components/ModelSelector';
import { ChatArea } from './components/ChatArea';

interface StreamEventPayload {
  type: 'chunk' | 'done' | 'error';
  text?: string;
  message?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export default function App() {
  const [chats, setChats] = useState<ChatSession[]>(() => loadChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const storedChats = loadChats();
    const storedActiveId = loadActiveChatId();
    if (storedActiveId && storedChats.some((c) => c.id === storedActiveId)) {
      return storedActiveId;
    }
    return storedChats[0]?.id ?? null;
  });

  const [selectedModelId, setSelectedModelId] = useState<string>(() => loadSelectedModelId());
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isGeneratingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync chats, activeChatId, and selectedModelId to localStorage
  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    saveActiveChatId(activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    saveSelectedModelId(selectedModelId);
  }, [selectedModelId]);

  // Collapse sidebar automatically on narrow viewports initially
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  const handleSelectModel = (modelId: string) => {
    if (isGeneratingRef.current) return;
    setSelectedModelId(modelId);
    if (activeChatId) {
      setChats((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, modelId } : c))
      );
    }
  };

  const handleNewChat = () => {
    if (isGeneratingRef.current) return;
    const newId = createChatId();
    const now = Date.now();
    const newChat: ChatSession = {
      id: newId,
      title: 'New Conversation',
      modelId: selectedModelId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newId);
  };

  const handleSelectChat = (chatId: string) => {
    if (isGeneratingRef.current) return;
    setActiveChatId(chatId);
    const target = chats.find((c) => c.id === chatId);
    if (target?.modelId && (target.modelId === 'gemini-4-hydrogen' || target.modelId === 'gemini-3.1-flash-lite')) {
      setSelectedModelId(target.modelId);
    }
  };

  const handleDeleteChat = (chatId: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== chatId);
      if (activeChatId === chatId) {
        setActiveChatId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleRenameChat = (chatId: string, newTitle: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
    );
  };

  const handleClearAllChats = () => {
    if (isGeneratingRef.current) return;
    setChats([]);
    setActiveChatId(null);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (rawContent: string, attachedImages?: ChatMessage['images']) => {
    const content = rawContent.trim();
    const images = attachedImages && attachedImages.length > 0 ? attachedImages : undefined;
    if ((!content && !images) || isGeneratingRef.current) return;

    const now = Date.now();
    let targetChatId = activeChatId;
    let existingMessages: ChatMessage[] = [];
    const fallbackTitle = content || (images ? 'Image Analysis' : 'New Conversation');

    if (!targetChatId || !chats.some((c) => c.id === targetChatId)) {
      targetChatId = createChatId();
      const newSession: ChatSession = {
        id: targetChatId,
        title: deriveChatTitle(fallbackTitle),
        modelId: selectedModelId,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      setChats((prev) => [newSession, ...prev]);
      setActiveChatId(targetChatId);
    } else {
      const found = chats.find((c) => c.id === targetChatId);
      existingMessages = found?.messages ?? [];
    }

    const userMsg: ChatMessage = {
      id: createChatId(),
      role: 'user',
      content,
      images,
      createdAt: now,
    };

    const assistantMsgId = createChatId();
    const placeholderAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      modelId: selectedModelId,
    };

    const updatedMessages = [...existingMessages, userMsg, placeholderAssistantMsg];

    setChats((prev) =>
      prev
        .map((c) => {
          if (c.id !== targetChatId) return c;
          const isFirstTurn = c.messages.length === 0;
          return {
            ...c,
            title: isFirstTurn ? deriveChatTitle(fallbackTitle) : c.title,
            modelId: selectedModelId,
            messages: updatedMessages,
            updatedAt: now,
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );

    isGeneratingRef.current = true;
    setIsGenerating(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = performance.now();
    let accumulated = '';
    let completionTokens: number | undefined;
    let promptTokens: number | undefined;

    try {
      const historyPayload = [
        ...existingMessages
          .filter((m) => !m.isError && (m.content.trim().length > 0 || (m.images && m.images.length > 0)))
          .map((m) => ({
            role: m.role === 'user' ? ('user' as const) : ('model' as const),
            content: m.content,
            images: m.images?.map((img) => ({ data: img.data, mimeType: img.mimeType })),
          })),
        {
          role: 'user' as const,
          content,
          images: images?.map((img) => ({ data: img.data, mimeType: img.mimeType })),
        },
      ];

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModelId,
          messages: historyPayload,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorMessage = `Request failed (${response.status})`;
        try {
          const errBody = (await response.json()) as { error?: string };
          if (errBody?.error) errorMessage = errBody.error;
        } catch {
          // Ignore non-JSON error body
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Streaming response body unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processEventBlock = (rawEvent: string) => {
        const lines = rawEvent.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let payload: StreamEventPayload;
          try {
            payload = JSON.parse(jsonStr) as StreamEventPayload;
          } catch {
            continue;
          }

          if (payload.type === 'chunk' && payload.text) {
            accumulated += payload.text;
            setChats((prev) =>
              prev.map((c) =>
                c.id !== targetChatId
                  ? c
                  : {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, content: accumulated } : m
                      ),
                    }
              )
            );
          } else if (payload.type === 'done' && payload.usage) {
            promptTokens = payload.usage.promptTokens;
            completionTokens = payload.usage.completionTokens;
          } else if (payload.type === 'error') {
            throw new Error(payload.message || 'P-Core streaming error.');
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) {
            processEventBlock(buffer);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const rawEvent of events) {
          processEventBlock(rawEvent);
        }
      }

      if (!accumulated.trim()) {
        throw new Error('No response text was received from the server stream.');
      }

      const elapsedMs = performance.now() - startTime;
      const calculatedTps =
        typeof completionTokens === 'number' && elapsedMs > 0
          ? completionTokens / (elapsedMs / 1000)
          : undefined;

      setChats((prev) =>
        prev.map((c) =>
          c.id !== targetChatId
            ? c
            : {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: accumulated,
                        stats: {
                          tokensPerSecond: calculatedTps,
                          completionTokens,
                          promptTokens,
                          elapsedMs,
                        },
                      }
                    : m
                ),
              }
        )
      );
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) {
        const elapsedMs = performance.now() - startTime;
        setChats((prev) =>
          prev.map((c) =>
            c.id !== targetChatId
              ? c
              : {
                  ...c,
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: accumulated || '(Generation stopped)',
                          stats: { elapsedMs },
                        }
                      : m
                  ),
                }
          )
        );
      } else {
        const errMsg =
          err instanceof Error ? err.message : 'An unexpected error occurred during generation.';
        setChats((prev) =>
          prev.map((c) =>
            c.id !== targetChatId
              ? c
              : {
                  ...c,
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: errMsg, isError: true }
                      : m
                  ),
                }
          )
        );
      }
    } finally {
      abortControllerRef.current = null;
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-[#0B0E14] text-slate-100">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onClearAllChats={handleClearAllChats}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800/80 bg-[#0E121A] px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? 'Hide chat history sidebar' : 'Show chat history sidebar'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#141925] text-slate-300 transition-colors hover:border-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <span className="font-display text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
              P-Core
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <ModelSelector
              selectedModelId={selectedModelId}
              isGenerating={isGenerating}
              onSelectModel={handleSelectModel}
            />
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleNewChat}
              aria-label="Start new chat"
              className="hidden h-10 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#161C28] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-[#1B2230] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* Main Chat Viewport */}
        <ChatArea
          messages={activeChat?.messages ?? []}
          selectedModelId={selectedModelId}
          isGenerating={isGenerating}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
        />
      </div>
    </div>
  );
}
