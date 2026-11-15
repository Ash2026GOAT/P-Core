import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Sparkles, Zap } from 'lucide-react';
import { AVAILABLE_MODELS, getModelOption } from '../config/models';

interface ModelSelectorProps {
  selectedModelId: string;
  isGenerating: boolean;
  onSelectModel: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId,
  isGenerating,
  onSelectModel,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModel = getModelOption(selectedModelId);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={isGenerating}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select P-Core model"
        className="inline-flex h-10 items-center gap-2.5 rounded-lg border border-slate-800 bg-[#161C28] px-3.5 text-left text-sm text-slate-100 transition-colors hover:border-slate-700 hover:bg-[#1B2230] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
      >
        <Zap className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="max-w-[160px] truncate font-medium sm:max-w-[230px]">
          {selectedModel.label}
        </span>
        <span className="hidden font-mono text-xs text-slate-400 md:inline">
          {selectedModel.speedLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-150 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Available P-Core models"
          className="absolute right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-800 bg-[#131823] shadow-2xl sm:w-[370px]"
        >
          <div className="border-b border-slate-800/80 px-4 py-2.5">
            <p className="text-xs font-medium text-slate-300">
              P-Core Engine Tiers
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Cloud-accelerated inference · Zero local RAM or GPU required
            </p>
          </div>

          <div className="py-1">
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = model.id === selectedModelId;

              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectModel(model.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none ${
                    isSelected ? 'bg-blue-500/10' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {isSelected ? (
                      <Check className="h-4 w-4 text-blue-400" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {model.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {model.speedLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {model.specialty} · {model.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-800/80 bg-[#0F141D] px-4 py-2 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>Runs smoothly on any laptop without local model downloads.</span>
          </div>
        </div>
      )}
    </div>
  );
};
