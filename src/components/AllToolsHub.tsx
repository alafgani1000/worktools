import React, { useMemo, useState } from 'react';
import { Clock, Search, Star, X } from 'lucide-react';
import {
  CATEGORY_LABELS,
  getToolsByCategory,
  type NavCategoryId,
  type NavToolEntry,
} from './navigationCatalog.ts';

interface AllToolsHubProps {
  tools: NavToolEntry[];
  favoriteIds: string[];
  recentIds: string[];
  activeCategory?: 'all' | NavCategoryId;
  onCategoryChange?: (cat: 'all' | NavCategoryId) => void;
  onSelectTool: (tool: NavToolEntry) => void;
  onToggleFavorite: (toolId: string) => void;
}

const CATEGORY_TABS: { id: 'all' | NavCategoryId; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'pdf', label: 'File PDF' },
  { id: 'image', label: 'File Gambar' },
  { id: 'data', label: 'Teks & Data' },
  { id: 'utility', label: 'Arsip & File' },
  { id: 'pipeline', label: 'AI & Otomasi' },
];

const POPULAR_TOOL_IDS = [
  'pdf:merge',
  'pdf:compress',
  'pdf:split',
  'pdf:pdf-to-image',
  'image:image.compress',
  'pdf:image-to-pdf',
];

const CATEGORY_ICON_STYLE: Record<NavCategoryId, string> = {
  pdf: 'bg-[#0071E3]/10 text-[#0071E3]',
  image: 'bg-[#30B0C7]/15 text-[#008299]',
  data: 'bg-[#FF9500]/12 text-[#C96B00]',
  utility: 'bg-[#1D1D1F]/[0.06] text-[#1D1D1F]',
  pipeline: 'bg-[#AF52DE]/12 text-[#8944AB]',
};

export const AllToolsHub: React.FC<AllToolsHubProps> = ({
  tools,
  favoriteIds,
  recentIds,
  activeCategory,
  onCategoryChange,
  onSelectTool,
  onToggleFavorite,
}) => {
  const [query, setQuery] = useState('');
  const [internalCategory, setInternalCategory] = useState<'all' | NavCategoryId>('all');

  const categoryFilter = activeCategory ?? internalCategory;
  const handleCategorySelect = (cat: 'all' | NavCategoryId) => {
    setInternalCategory(cat);
    onCategoryChange?.(cat);
  };

  const aiChatTool = useMemo(() => tools.find((t) => t.id === 'agent:chat'), [tools]);
  const pipelineTool = useMemo(() => tools.find((t) => t.id === 'pipeline:studio'), [tools]);

  const popularTools = useMemo(
    () =>
      POPULAR_TOOL_IDS.map((id) => tools.find((t) => t.id === id)).filter(
        (t): t is NavToolEntry => Boolean(t),
      ),
    [tools],
  );

  const favoriteTools = useMemo(
    () =>
      favoriteIds
        .map((id) => tools.find((t) => t.id === id))
        .filter((t): t is NavToolEntry => Boolean(t)),
    [favoriteIds, tools],
  );

  const recentTools = useMemo(
    () =>
      recentIds
        .map((id) => tools.find((t) => t.id === id))
        .filter((t): t is NavToolEntry => Boolean(t))
        .slice(0, 4),
    [recentIds, tools],
  );

  const counts = useMemo(
    () => ({
      all: tools.length,
      pdf: getToolsByCategory('pdf').length,
      image: getToolsByCategory('image').length,
      data: getToolsByCategory('data').length,
      utility: getToolsByCategory('utility').length,
      pipeline: getToolsByCategory('pipeline').length,
    }),
    [tools],
  );

  const groupedByCategory = useMemo(() => {
    const q = query.trim().toLowerCase();
    const categories: NavCategoryId[] =
      categoryFilter === 'all'
        ? q
          ? ['pdf', 'image', 'data', 'utility', 'pipeline']
          : ['pdf', 'image', 'data', 'utility']
        : [categoryFilter];

    return categories
      .map((cat) => {
        const catTools = getToolsByCategory(cat).filter((tool) => {
          if (!q) return true;
          return `${tool.name} ${tool.shortDesc} ${tool.handledFiles} ${tool.subGroup} ${CATEGORY_LABELS[cat]}`
            .toLowerCase()
            .includes(q);
        });

        const subGroups: { name: string; items: NavToolEntry[] }[] = [];
        for (const item of catTools) {
          let group = subGroups.find((g) => g.name === item.subGroup);
          if (!group) {
            group = { name: item.subGroup, items: [] };
            subGroups.push(group);
          }
          group.items.push(item);
        }

        return {
          category: cat,
          label: CATEGORY_LABELS[cat],
          count: catTools.length,
          items: catTools,
          subGroups,
        };
      })
      .filter((section) => section.count > 0);
  }, [categoryFilter, query]);

  const renderToolCard = (tool: NavToolEntry, keyPrefix: string) => {
    const Icon = tool.icon;
    const isFav = favoriteIds.includes(tool.id);

    return (
      <div
        key={`${keyPrefix}${tool.id}`}
        className="group relative bg-white rounded-[20px] border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.025)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
      >
        <button
          type="button"
          onClick={() => onSelectTool(tool)}
          className="w-full h-full text-left p-4 pr-10 flex items-center gap-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0071E3]"
        >
          <div
            className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 ${CATEGORY_ICON_STYLE[tool.category]}`}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1D1D1F] group-hover:text-[#0071E3] truncate transition-colors">
              {tool.name}
            </h4>
            <p className="text-[13px] text-[#6E6E73] truncate mt-0.5">{tool.shortDesc}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(tool.id)}
          title={isFav ? 'Hapus dari Favorit' : 'Sematkan ke Favorit'}
          aria-label={isFav ? 'Hapus dari Favorit' : 'Sematkan ke Favorit'}
          className={`absolute top-1/2 -translate-y-1/2 right-3 p-1.5 rounded-full transition-all ${
            isFav
              ? 'opacity-100 text-[#FF9500] hover:bg-[#FF9500]/10'
              : 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-[#86868B] hover:text-[#FF9500] hover:bg-black/[0.04]'
          }`}
        >
          <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
        </button>
      </div>
    );
  };

  const isHome = categoryFilter === 'all';
  const hasQuery = Boolean(query.trim());
  const showHomeExtras = isHome && !hasQuery;
  const showCategorySubGroups = categoryFilter !== 'all';

  const renderSearchInput = (variant: 'hero' | 'toolbar') => {
    const isHero = variant === 'hero';
    return (
      <div className={`relative w-full ${isHero ? 'max-w-xl mx-auto' : 'md:w-64 shrink-0'}`}>
        <Search
          size={isHero ? 18 : 14}
          className={`absolute top-1/2 -translate-y-1/2 text-[#86868B] ${isHero ? 'left-5' : 'left-3.5'}`}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isHero ? 'Cari alat… misal: gabung PDF, kompres foto' : 'Cari alat...'}
          aria-label="Cari alat"
          className={`w-full rounded-full bg-white text-[#1D1D1F] placeholder:text-[#86868B] outline-none transition-all [&::-webkit-search-cancel-button]:hidden ${
            isHero
              ? 'pl-12 pr-11 py-3.5 text-[15px] border border-white/90 focus:border-[#2997FF] focus:ring-4 focus:ring-[#2997FF]/30 shadow-[0_10px_32px_rgba(0,0,0,0.45)]'
              : 'pl-9 pr-8 py-2 text-sm border border-black/[0.08] focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 shadow-2xs'
          }`}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className={`absolute top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] ${isHero ? 'right-4' : 'right-3'}`}
            aria-label="Hapus pencarian"
          >
            <X size={isHero ? 16 : 14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-7">
      {/* Apple Editorial Dark Hero with Velocity Gradient & Spotlight Search */}
      {isHome ? (
        <section className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] bg-[#0B0B0E] bg-gradient-to-b from-[#17171C] via-[#0B0B0E] to-[#050507] border border-white/[0.08] px-5 py-8 sm:px-10 sm:py-10 text-center space-y-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.16)]">
          {/* Ambient velocity light glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/4 w-72 h-48 rounded-full bg-[#00F2FE]/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-1/4 w-72 h-48 rounded-full bg-[#FF9500]/15 blur-3xl"
          />

          <div className="relative z-10 space-y-3.5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-[11px] font-semibold tracking-wider uppercase text-[#D1D1D6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F2FE] shadow-[0_0_8px_#00F2FE]" />
              <span>100% On-Device &middot; Privasi Penuh</span>
            </div>

            <h1 className="text-3xl sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.12]">
              <span className="bg-gradient-to-b from-white via-[#F5F5F7] to-[#AEAEB2] bg-clip-text text-transparent">
                Work Tool Super App.
              </span>{' '}
              <span className="bg-gradient-to-r from-[#00F2FE] via-[#2997FF] to-[#FF9500] bg-clip-text text-transparent">
                Cepat. Privat. Lokal.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-[#A1A1A6] max-w-xl mx-auto leading-relaxed">
              Olah PDF, gambar, dan dokumen langsung di perangkat Anda &mdash; tanpa unggah ke
              server.
            </p>

            <div className="pt-2">{renderSearchInput('hero')}</div>
          </div>
        </section>
      ) : (
        <div className="pt-2 space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em] text-[#1D1D1F]">
            {CATEGORY_LABELS[categoryFilter]}
          </h1>
          <p className="text-sm text-[#6E6E73]">
            {counts[categoryFilter]} alat lokal siap pakai di kategori ini.
          </p>
        </div>
      )}

      {/* Popular Tools */}
      {showHomeExtras && popularTools.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#86868B] px-0.5">
            Paling Sering Dipakai
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {popularTools.map((tool) => renderToolCard(tool, 'popular-'))}
          </div>
        </section>
      )}

      {/* Favorites Section */}
      {showHomeExtras && favoriteTools.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#C96B00] px-0.5">
            <Star size={12} fill="currentColor" />
            <span>Favorit ({favoriteTools.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favoriteTools.map((tool) => renderToolCard(tool, 'fav-'))}
          </div>
        </section>
      )}

      {/* Recent Tools Section */}
      {showHomeExtras && recentTools.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#86868B] px-0.5">
            <Clock size={12} />
            <span>Terakhir Dipakai</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={`recent-${tool.id}`}
                  type="button"
                  onClick={() => onSelectTool(tool)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-black/[0.06] hover:border-[#0071E3]/40 hover:text-[#0071E3] text-xs font-medium text-[#1D1D1F] shadow-2xs transition-colors"
                >
                  <Icon size={13} className="text-[#86868B]" />
                  <span>{tool.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* macOS Segmented Control (+ toolbar search on category pages) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div className="inline-flex items-center gap-1 bg-[#E8E8ED]/80 p-1 rounded-full overflow-x-auto max-w-full no-scrollbar">
          {CATEGORY_TABS.map((tab) => {
            const active = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleCategorySelect(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'bg-white text-[#1D1D1F] shadow-sm'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] ${
                    active ? 'text-[#6E6E73] font-semibold' : 'text-[#86868B]'
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {!isHome && renderSearchInput('toolbar')}
      </div>

      {/* Categorized Apple Tool Grid */}
      {groupedByCategory.length === 0 ? (
        <div className="bg-white rounded-[24px] p-10 text-center border border-black/[0.05] text-sm text-[#6E6E73]">
          Tidak ada fitur yang cocok dengan pencarian &ldquo;{query}&rdquo;.
        </div>
      ) : (
        groupedByCategory.map((section) => (
          <section key={section.category} className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-2">
              <h2 className="text-lg font-semibold tracking-[-0.015em] text-[#1D1D1F]">
                {section.label}
              </h2>
              <span className="text-xs font-medium text-[#86868B]">{section.count} fitur</span>
            </div>

            {showCategorySubGroups ? (
              <div className="space-y-5">
                {section.subGroups.map((sub) => (
                  <div key={`${section.category}-${sub.name}`} className="space-y-2.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">
                      {sub.name}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sub.items.map((tool) => renderToolCard(tool, `${section.category}-`))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((tool) => renderToolCard(tool, `${section.category}-`))}
              </div>
            )}
          </section>
        ))
      )}

      {/* Smart Automation Banner (moved below tools, simplified copy) */}
      {showHomeExtras && (aiChatTool || pipelineTool) && (
        <section className="space-y-3 pt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#86868B] px-0.5">
            Otomasi Pintar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiChatTool && (
              <button
                type="button"
                onClick={() => onSelectTool(aiChatTool)}
                className="group text-left bg-[#1D1D1F] text-white rounded-[22px] p-5 flex items-center gap-4 hover:scale-[1.005] transition-transform shadow-[0_6px_20px_rgba(0,0,0,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2997FF]"
              >
                <div className="w-11 h-11 rounded-[14px] bg-white/10 flex items-center justify-center shrink-0">
                  <aiChatTool.icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em]">AI Chat</h3>
                  <p className="text-[13px] text-[#A1A1A6] mt-0.5">
                    Ketik perintah, biar AI yang mengerjakan.
                  </p>
                </div>
                <span aria-hidden="true" className="text-[#2997FF] text-lg group-hover:translate-x-0.5 transition-transform">
                  &rsaquo;
                </span>
              </button>
            )}

            {pipelineTool && (
              <button
                type="button"
                onClick={() => onSelectTool(pipelineTool)}
                className="group text-left bg-white text-[#1D1D1F] rounded-[22px] p-5 flex items-center gap-4 border border-black/[0.05] shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.06)] hover:scale-[1.005] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
              >
                <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 ${CATEGORY_ICON_STYLE.pipeline}`}>
                  <pipelineTool.icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Alur Otomatis</h3>
                  <p className="text-[13px] text-[#6E6E73] mt-0.5">
                    Gabungkan beberapa langkah jadi satu proses.
                  </p>
                </div>
                <span aria-hidden="true" className="text-[#0066CC] text-lg group-hover:translate-x-0.5 transition-transform">
                  &rsaquo;
                </span>
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
