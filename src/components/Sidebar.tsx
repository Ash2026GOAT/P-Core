import React, { useState } from 'react';
import { Check, MessageSquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { ChatSession } from '../types/chat';
import { getModelOption } from '../config/models';

interface SidebarProps {
  chats: ChatSession[];
  activeChatId: string | null;
  isOpen: boolean;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onClearAllChats: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  isOpen,
  onCloseMobile,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  onClearAllChats,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredChats = normalizedQuery
    ? chats.filter(
        (chat) =>
          chat.title.toLowerCase().includes(normalizedQuery) ||
          chat.messages.some((m) => m.content.toLowerCase().includes(normalizedQuery))
      )
    : chats;

  const commitRename = (chatId: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      onRenameChat(chatId, trimmed);
    }
    setEditingChatId(null);
    setEditingTitle('');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        aria-label="Chat history sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[276px] shrink-0 flex-col border-r border-slate-800/80 bg-[#111620] transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        {/* Top New Chat & Mobile Close */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 p-3.5">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-3.5 pt-3 pb-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved chats..."
              aria-label="Search saved chats"
              className="h-9 w-full rounded-lg border border-slate-800 bg-[#0B0E14] pl-8 pr-8 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500/70 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 rounded p-0.5 text-slate-500 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-1.5">
          {filteredChats.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-slate-600" />
              <p className="mt-2.5 text-xs font-medium text-slate-400">
                {chats.length === 0 ? 'No saved conversations yet' : 'No matching conversations'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {chats.length === 0
                  ? 'Start chatting to save history locally in your browser.'
                  : 'Try a different keyword.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredChats.map((chat) => {
                const isActive = chat.id === activeChatId;
                const isEditing = editingChatId === chat.id;
                const modelShort = getModelOption(chat.modelId).shortName;
                const msgCount = chat.messages.length;

                return (
                  <li key={chat.id}>
                    <div
                      className={`group relative flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-2 transition-colors ${
                        isActive
                          ? 'bg-[#182030] text-slate-100'
                          : 'text-slate-300 hover:bg-slate-800/45 hover:text-slate-100'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(chat.id);
                              if (e.key === 'Escape') {
                                setEditingChatId(null);
                                setEditingTitle('');
                              }
                            }}
                            onBlur={() => commitRename(chat.id)}
                            aria-label="Rename conversation"
                            className="h-7 w-full rounded border border-blue-500/60 bg-[#0B0E14] px-2 text-xs text-slate-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => commitRename(chat.id)}
                            aria-label="Save title"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-emerald-400 hover:bg-slate-800"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectChat(chat.id);
                              onCloseMobile();
                            }}
                            className="min-w-0 flex-1 text-left focus-visible:outline-none"
                          >
                            <p className="truncate text-[13px] font-medium leading-snug">
                              {chat.title}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                              <span className="truncate">{modelShort}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums shrink-0">
                                {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums shrink-0">
                                {formatRelativeTime(chat.updatedAt)}
                              </span>
                            </div>
                          </button>

                          <div
                            className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
                              isActive
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(chat.id);
                                setEditingTitle(chat.title);
                              }}
                              title="Rename chat"
                              aria-label={`Rename ${chat.title}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-100"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteChat(chat.id);
                              }}
                              title="Delete chat"
                              aria-label={`Delete ${chat.title}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom Storage Footer */}
        <div className="border-t border-slate-800/80 px-3.5 py-3">
          {chats.length > 0 && (
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {chats.length} saved {chats.length === 1 ? 'chat' : 'chats'}
              </span>
              {confirmClearAll ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllChats();
                      setConfirmClearAll(false);
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10 whitespace-nowrap"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="text-xs text-slate-400 transition-colors hover:text-rose-400 whitespace-nowrap"
                >
                  Clear history
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            History saved in <span className="font-mono text-slate-400">localStorage</span> · Powered by P-Core
          </p>
        </div>
      </aside>
    </>
  );
};
