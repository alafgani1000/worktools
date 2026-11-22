import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle: string;
  categoryLabel: string;
  keywords: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, items }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.title} ${item.subtitle} ${item.categoryLabel} ${item.keywords}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  if (!isOpen) return null;

  const handleSelectItem = (item: CommandPaletteItem) => {
    setQuery('');
    item.onSelect();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/30 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cari fitur cepat"
        className="w-full max-w-xl bg-white/95 backdrop-blur-2xl rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,0.2)] border border-black/[0.08] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
          <Search size={18} className="text-[#86868B] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Cari fitur"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                handleSelectItem(filtered[0]);
              }
            }}
            placeholder="Cari fitur PDF, Image, QR, Redact, Pipeline..."
            className="flex-1 text-sm text-[#1D1D1F] placeholder:text-[#86868B] outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.05]"
            aria-label="Tutup pencarian"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-black/[0.04]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6E6E73]">
              Tidak ada fitur yang cocok dengan &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectItem(item)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#0071E3]/[0.08] transition-colors group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-black/[0.05] text-[#6E6E73] group-hover:bg-[#0071E3]/15 group-hover:text-[#0071E3]">
                      {item.categoryLabel}
                    </span>
                    <span className="text-sm font-semibold text-[#1D1D1F] truncate">{item.title}</span>
                  </div>
                  <p className="text-xs text-[#6E6E73] mt-0.5 truncate">{item.subtitle}</p>
                </div>
                <ArrowRight size={15} className="text-[#86868B] group-hover:text-[#0071E3] shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
