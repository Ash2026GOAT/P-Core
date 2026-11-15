import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft, Plus, Square, Volume2, VolumeX } from 'lucide-react';
import type { ChatMessage, ChatSession } from './types/chat';
import {
  createChatId,
  deriveChatTitle,
  loadActiveChatId,
  loadChats,
  loadJarvisEnabled,
  loadSelectedModelId,
  saveActiveChatId,
  saveChats,
  saveJarvisEnabled,
  saveSelectedModelId,
} from './services/storage';
import {
  selectJarvisVoice,
  splitIntoSpeechChunks,
  stripMarkdownForSpeech,
} from './services/speech';
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

  const [jarvisEnabled, setJarvisEnabled] = useState<boolean>(() => loadJarvisEnabled());
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const isGeneratingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const jarvisEnabledRef = useRef(jarvisEnabled);
  jarvisEnabledRef.current = jarvisEnabled;
  const speechSessionRef = useRef(0);

  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Sync chats, activeChatId, selectedModelId, and jarvisEnabled to localStorage
  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    saveActiveChatId(activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    saveSelectedModelId(selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    saveJarvisEnabled(jarvisEnabled);
  }, [jarvisEnabled]);

  // Collapse sidebar automatically on narrow viewports initially
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  // Load browser speech synthesis voices (async in Chrome)
  useEffect(() => {
    if (!speechSupported) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
      }
    };

    updateVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', updateVoices);

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', updateVoices);
      speechSessionRef.current += 1;
      window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  const stopSpeaking = useCallback(() => {
    speechSessionRef.current += 1;
    setSpeakingMessageId(null);
    if (speechSupported) {
      window.speechSynthesis.cancel();
    }
  }, [speechSupported]);

  const speakMessage = useCallback(
    (messageId: string, rawMarkdown: string) => {
      if (!speechSupported) return;

      const cleanText = stripMarkdownForSpeech(rawMarkdown);
      if (!cleanText) return;

      const chunks = splitIntoSpeechChunks(cleanText);
      if (chunks.length === 0) return;

      speechSessionRef.current += 1;
      const currentSession = speechSessionRef.current;

      window.speechSynthesis.cancel();
      setSpeakingMessageId(messageId);

      const voices =
        availableVoices.length > 0
          ? availableVoices
          : window.speechSynthesis.getVoices();
      const jarvisVoice = selectJarvisVoice(voices);

      const speakNextChunk = (index: number) => {
        if (speechSessionRef.current !== currentSession) return;
        if (index >= chunks.length) {
          setSpeakingMessageId(null);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        if (jarvisVoice) {
          utterance.voice = jarvisVoice;
          utterance.lang = jarvisVoice.lang;
        } else {
          utterance.lang = 'en-GB';
        }
        utterance.pitch = 0.94;
        utterance.rate = 1.04;

        utterance.onend = () => {
          if (speechSessionRef.current !== currentSession) return;
          speakNextChunk(index + 1);
        };

        utterance.onerror = () => {
          if (speechSessionRef.current !== currentSession) return;
          setSpeakingMessageId(null);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNextChunk(0);
    },
    [availableVoices, speechSupported]
  );

  const handleToggleJarvis = () => {
    setJarvisEnabled((prev) => {
      const next = !prev;
      if (!next) {
        stopSpeaking();
      }
      return next;
    });
  };

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
    stopSpeaking();
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
    stopSpeaking();
    setActiveChatId(chatId);
    const target = chats.find((c) => c.id === chatId);
    if (target?.modelId && (target.modelId === 'gemini-4-hydrogen' || target.modelId === 'gemini-3.1-flash-lite')) {
      setSelectedModelId(target.modelId);
    }
  };

  const handleDeleteChat = (chatId: string) => {
    if (activeChatId === chatId) {
      stopSpeaking();
    }
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
    stopSpeaking();
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

    stopSpeaking();

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

      if (jarvisEnabledRef.current) {
        speakMessage(assistantMsgId, accumulated);
      }
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
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-[#0E121A] px-4 sm:px-5">
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

          <div className="flex items-center gap-2 shrink-0">
            {speechSupported && (
              <>
                {speakingMessageId !== null && (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    aria-label="Stop J.A.R.V.I.S. speech"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>Stop</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleJarvis}
                  aria-pressed={jarvisEnabled}
                  aria-label={
                    jarvisEnabled
                      ? 'Disable J.A.R.V.I.S. auto-voice'
                      : 'Enable J.A.R.V.I.S. auto-voice'
                  }
                  title={
                    jarvisEnabled
                      ? 'J.A.R.V.I.S. Voice ON — Replies spoken aloud'
                      : 'J.A.R.V.I.S. Voice OFF'
                  }
                  className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 whitespace-nowrap shrink-0 ${
                    jarvisEnabled
                      ? 'border-cyan-500/50 bg-cyan-950/35 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.16)] hover:border-cyan-400/70 hover:bg-cyan-900/40'
                      : 'border-slate-800 bg-[#161C28] text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {jarvisEnabled ? (
                    <Volume2 className="h-4 w-4 text-cyan-300 shrink-0" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-slate-500 shrink-0" />
                  )}
                  <span className="hidden sm:inline">J.A.R.V.I.S. Voice</span>
                </button>
              </>
            )}

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
          speakingMessageId={speakingMessageId}
          speechSupported={speechSupported}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onSpeakMessage={speakMessage}
          onStopSpeaking={stopSpeaking}
        />
      </div>
    </div>
  );
}
