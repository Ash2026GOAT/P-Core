import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Loader2,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import type { ChatMessage } from '../types/chat';
import { getModelOption, STARTER_PROMPTS } from '../config/models';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatAreaProps {
  messages: ChatMessage[];
  selectedModelId: string;
  isGenerating: boolean;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  selectedModelId,
  isGenerating,
  onSendMessage,
  onStopGeneration,
}) => {
  const [input, setInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const selectedModel = getModelOption(selectedModelId);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isGenerating]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    shouldAutoScrollRef.current = true;
    setInput('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStarterClick = (prompt: string) => {
    if (isGenerating) return;
    shouldAutoScrollRef.current = true;
    onSendMessage(prompt);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0B0E14]">
      {/* Message Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center py-8">
            <div className="max-w-xl">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl [text-wrap:balance]">
                Fast cloud intelligence with P-Core
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400 sm:text-base">
                Engineered for instant streaming, clean code generation, and lightweight performance on any laptop with persistent local history.
              </p>
            </div>

            {/* Active Model Card (Single-elevation surface) */}
            <div className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-800/90 bg-[#111620] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="truncate text-sm font-semibold text-slate-100">
                    {selectedModel.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                  <span>{selectedModel.specialty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedModel.speedLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">Ready instantly</span>
                </div>
              </div>
              <span className="font-mono text-xs text-slate-400 whitespace-nowrap shrink-0">
                0 MB local RAM
              </span>
            </div>

            {/* Starter Prompts Grid */}
            <div className="mt-6">
              <p className="mb-3 text-xs font-medium text-slate-400">
                Try a prompt with P-Core
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleStarterClick(item.prompt)}
                    className="group flex flex-col items-start rounded-xl border border-slate-800/80 bg-[#111620] p-3.5 text-left transition-colors hover:border-slate-700 hover:bg-[#161C28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-200 group-hover:text-white">
                      <Terminal className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      {item.title}
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 pb-4">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLastMessage = idx === messages.length - 1;
              const isStreamingThis = !isUser && isGenerating && isLastMessage;
              const modelLabel = msg.modelId ? getModelOption(msg.modelId).shortName : selectedModel.shortName;

              if (isUser) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-slate-700/60 bg-[#182030] px-4 py-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap sm:max-w-[75%]">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex flex-col">
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-200">{modelLabel}</span>
                    {isStreamingThis && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5 text-blue-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Streaming
                        </span>
                      </>
                    )}
                  </div>

                  {msg.isError ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">
                      {msg.content}
                    </div>
                  ) : msg.content ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : isStreamingThis ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                      <span>Generating response…</span>
                    </div>
                  ) : null}

                  {!isStreamingThis && msg.stats && !msg.isError && (
                    <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
                      {typeof msg.stats.tokensPerSecond === 'number' && (
                        <span>{msg.stats.tokensPerSecond.toFixed(1)} tok/s</span>
                      )}
                      {typeof msg.stats.completionTokens === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{msg.stats.completionTokens} tokens</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Composer */}
      <div className="border-t border-slate-800/80 bg-[#0B0E14] px-4 pt-3 pb-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2.5 rounded-xl border border-slate-800 bg-[#111620] p-2 transition-colors focus-within:border-blue-500/60">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask P-Core anything..."
              aria-label="Chat message input"
              className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={onStopGeneration}
                aria-label="Stop generating"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-xs font-medium text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 whitespace-nowrap shrink-0"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!input.trim()}
                onClick={handleSubmit}
                aria-label="Send message"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 shrink-0"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500">
            <span>Enter to send · Shift+Enter for new line</span>
            <span className="truncate font-mono">
              {selectedModel.label} · P-Core Cloud
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
