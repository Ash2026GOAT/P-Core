import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Square,
  Terminal,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import type { ChatMessage, ImageAttachment } from '../types/chat';
import { getModelOption, STARTER_PROMPTS } from '../config/models';
import {
  getSpeechRecognitionConstructor,
  type SpeechRecognitionInstance,
} from '../services/speech';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatAreaProps {
  messages: ChatMessage[];
  selectedModelId: string;
  isGenerating: boolean;
  speakingMessageId: string | null;
  speechSupported: boolean;
  onSendMessage: (content: string, images?: ImageAttachment[]) => void;
  onStopGeneration: () => void;
  onSpeakMessage: (messageId: string, content: string) => void;
  onStopSpeaking: () => void;
}

const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image

function readImageAsAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Failed to parse image data URL.'));
        return;
      }
      const base64Data = result.slice(commaIndex + 1);
      const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/png';
      resolve({
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        data: base64Data,
        mimeType,
        name: file.name || 'pasted-image.png',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  selectedModelId,
  isGenerating,
  speakingMessageId,
  speechSupported,
  onSendMessage,
  onStopGeneration,
  onSpeakMessage,
  onStopSpeaking,
}) => {
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const baseInputRef = useRef('');
  const inputRef = useRef('');
  inputRef.current = input;

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

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup error
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    setMicError(null);

    if (isListening) {
      stopListening();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setMicError('Voice input requires Chrome or Edge with SpeechRecognition support.');
      return;
    }

    try {
      const recognition = new RecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      baseInputRef.current = inputRef.current.trimEnd();

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        const spoken = `${finalTranscript}${interimTranscript}`.trim();
        const prefix = baseInputRef.current;
        const combined = prefix ? (spoken ? `${prefix} ${spoken}` : prefix) : spoken;
        setInput(combined);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicError('Microphone permission denied. Please allow mic access in Chrome.');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setMicError(`Voice input error: ${event.error}`);
        }
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Unable to start voice recognition.');
      setIsListening(false);
    }
  };

  const attachImageFiles = async (files: File[]) => {
    setUploadError(null);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const remainingSlots = MAX_IMAGES_PER_MESSAGE - pendingImages.length;
    if (remainingSlots <= 0) {
      setUploadError(`Maximum ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      return;
    }

    const validFiles: File[] = [];
    for (const file of imageFiles.slice(0, remainingSlots)) {
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError(`"${file.name || 'Image'}" exceeds the 10 MB limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    try {
      const converted = await Promise.all(validFiles.map(readImageAsAttachment));
      setPendingImages((prev) => [...prev, ...converted].slice(0, MAX_IMAGES_PER_MESSAGE));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to attach image.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length > 0) {
      await attachImageFiles(files);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const pastedImages: File[] = [];

    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) pastedImages.push(file);
      }
    }

    if (pastedImages.length > 0) {
      const hasText = items.some((item) => item.kind === 'string' && item.type === 'text/plain');
      if (!hasText) {
        e.preventDefault();
      }
      await attachImageFiles(pastedImages);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) {
      await attachImageFiles(files);
    }
  };

  const removePendingImage = (imageId: string) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== imageId));
    setUploadError(null);
  };

  const handleSubmit = () => {
    if (isListening) {
      stopListening();
    }
    const trimmed = input.trim();
    if ((!trimmed && pendingImages.length === 0) || isGenerating) return;
    shouldAutoScrollRef.current = true;
    const imagesToSend = pendingImages.length > 0 ? [...pendingImages] : undefined;
    setInput('');
    setPendingImages([]);
    setUploadError(null);
    onSendMessage(trimmed, imagesToSend);
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

  const canSend = Boolean(input.trim()) || pendingImages.length > 0;

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
                Engineered for instant streaming, clean code generation, and visual analysis on any laptop with persistent local history.
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
              const isSpeakingThis = !isUser && speakingMessageId === msg.id;
              const modelLabel = msg.modelId ? getModelOption(msg.modelId).shortName : selectedModel.shortName;

              if (isUser) {
                return (
                  <div key={msg.id} className="flex flex-col items-end gap-2">
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex max-w-[85%] flex-wrap justify-end gap-2 sm:max-w-[75%]">
                        {msg.images.map((img) => (
                          <img
                            key={img.id}
                            src={`data:${img.mimeType};base64,${img.data}`}
                            alt={img.name || 'Uploaded image'}
                            referrerPolicy="no-referrer"
                            className="max-h-56 rounded-xl border border-slate-700/70 bg-[#111620] object-contain"
                          />
                        ))}
                      </div>
                    )}
                    {msg.content && (
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-slate-700/60 bg-[#182030] px-4 py-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap sm:max-w-[75%]">
                        {msg.content}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex flex-col">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
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
                      {isSpeakingThis && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1.5 text-cyan-300">
                            Speaking
                          </span>
                        </>
                      )}
                    </div>

                    {!isStreamingThis && !msg.isError && msg.content && speechSupported && (
                      <button
                        type="button"
                        onClick={() =>
                          isSpeakingThis
                            ? onStopSpeaking()
                            : onSpeakMessage(msg.id, msg.content)
                        }
                        aria-label={
                          isSpeakingThis
                            ? 'Stop speaking response'
                            : 'Speak response with J.A.R.V.I.S. voice'
                        }
                        title={isSpeakingThis ? 'Stop speaking' : 'Listen with J.A.R.V.I.S. voice'}
                        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 whitespace-nowrap shrink-0 ${
                          isSpeakingThis
                            ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                            : 'border-slate-800 bg-[#141925] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300'
                        }`}
                      >
                        {isSpeakingThis ? (
                          <>
                            <Square className="h-3 w-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" />
                            <span>Speak</span>
                          </>
                        )}
                      </button>
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
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-xl border bg-[#111620] p-2 transition-colors focus-within:border-blue-500/60 ${
              isListening
                ? 'border-cyan-400/70 shadow-[0_0_24px_rgba(34,211,238,0.14)]'
                : isDragging
                  ? 'border-blue-500 bg-[#151C2B]'
                  : 'border-slate-800'
            }`}
          >
            {/* Listening Cyan Waveform Banner */}
            {isListening && (
              <div className="mb-2 flex items-center justify-between gap-3 border-b border-cyan-500/20 px-2 pb-2 pt-0.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-4 items-center gap-0.5" aria-hidden="true">
                    <span className="animate-jarvis-wave h-3 w-0.5 rounded-full bg-cyan-400" style={{ animationDelay: '0ms' }} />
                    <span className="animate-jarvis-wave h-4 w-0.5 rounded-full bg-cyan-300" style={{ animationDelay: '150ms' }} />
                    <span className="animate-jarvis-wave h-2.5 w-0.5 rounded-full bg-cyan-400" style={{ animationDelay: '300ms' }} />
                    <span className="animate-jarvis-wave h-4 w-0.5 rounded-full bg-cyan-300" style={{ animationDelay: '450ms' }} />
                    <span className="animate-jarvis-wave h-3 w-0.5 rounded-full bg-cyan-400" style={{ animationDelay: '600ms' }} />
                  </div>
                  <span className="font-mono text-xs font-medium text-cyan-300">
                    Listening… Speak naturally into your microphone
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopListening}
                  className="rounded px-2 py-0.5 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 whitespace-nowrap"
                >
                  Done
                </button>
              </div>
            )}

            {/* Removable Image Thumbnail Preview Row above Textarea */}
            {pendingImages.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2.5 border-b border-slate-800/80 px-1.5 pb-2.5 pt-1">
                {pendingImages.map((img) => (
                  <div
                    key={img.id}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-[#0B0E14]"
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt={img.name || 'Attached image preview'}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingImage(img.id)}
                      aria-label={`Remove ${img.name || 'image'}`}
                      title="Remove image"
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/85 text-slate-200 transition-colors hover:bg-rose-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(uploadError || micError) && (
              <p className="mb-2 px-2 text-xs text-rose-400">{uploadError || micError}</p>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                aria-label="Upload image file"
                className="hidden"
              />

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => fileInputRef.current?.click()}
                title="Upload image (or paste screenshot with Ctrl+V)"
                aria-label="Upload image"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#161C28] text-slate-300 transition-colors hover:border-slate-700 hover:bg-[#1B2230] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              {/* Glowing Cyan Microphone Button */}
              <button
                type="button"
                disabled={isGenerating}
                onClick={toggleListening}
                aria-pressed={isListening}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                title={isListening ? 'Stop listening' : 'Speak into P-Core'}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isListening
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.5)]'
                    : 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)] hover:border-cyan-400/70 hover:bg-cyan-900/40 hover:text-cyan-100 hover:shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                }`}
              >
                {isListening && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 animate-ping rounded-lg border border-cyan-400/60"
                  />
                )}
                {isListening ? (
                  <MicOff className="relative z-10 h-4 w-4 text-cyan-200" />
                ) : (
                  <Mic className="relative z-10 h-4 w-4" />
                )}
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask P-Core anything..."
                aria-label="Chat message input"
                className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
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
                  disabled={!canSend}
                  onClick={handleSubmit}
                  aria-label="Send message"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 shrink-0"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500">
            <span>Enter to send · Shift+Enter for new line · Ctrl+V to paste screenshot</span>
            <span className="truncate font-mono">
              {selectedModel.label} · P-Core Cloud
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
