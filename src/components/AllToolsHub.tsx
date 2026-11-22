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
      categoryFilter === 'all' ? ['pdf', 'image', 'data', 'utility', 'pipeline'] : [categoryFilter];

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

  const showSpotlight = categoryFilter === 'all' && !query.trim();
  const showCategorySubGroups = categoryFilter !== 'all';

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">
      {/* Apple Editorial Hero & 2-Card Bento Spotlight */}
      {showSpotlight ? (
        <div className="space-y-8">
          <section className="pt-6 pb-2 sm:pt-10 text-center space-y-4">
            <p className="text-xs font-medium tracking-wide uppercase text-[#6E6E73]">
              100% On-Device &middot; Privasi Penuh
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] leading-[1.08] text-[#1D1D1F]">
              Work Tool Super App.
              <span className="text-[#6E6E73]"> Cepat. Privat. Lokal.</span>
            </h1>
            <p className="text-sm sm:text-[17px] text-[#6E6E73] max-w-2xl mx-auto leading-relaxed">
              {tools.length} alat kerja PDF, gambar, data, dan otomasi AI yang berjalan langsung di
              perangkat Anda tanpa unggah server.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {aiChatTool && (
                <button
                  type="button"
                  onClick={() => onSelectTool(aiChatTool)}
                  className="bg-[#0071E3] hover:bg-[#0077ED] text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors shadow-2xs"
                >
                  Coba AI Chat
                </button>
              )}
              {pipelineTool && (
                <button
                  type="button"
                  onClick={() => onSelectTool(pipelineTool)}
                  className="text-[#0066CC] hover:underline px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1"
                >
                  <span>Buka Visual Pipeline</span>
                  <span aria-hidden="true">&rsaquo;</span>
                </button>
              )}
            </div>
          </section>

          {/* 2-Card Bento Spotlight */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiChatTool && (
              <button
                type="button"
                onClick={() => onSelectTool(aiChatTool)}
                className="text-left bg-[#1D1D1F] text-white rounded-[28px] p-7 sm:p-8 flex flex-col justify-between min-h-[210px] hover:scale-[1.005] transition-transform shadow-[0_8px_28px_rgba(0,0,0,0.12)]"
              >
                <div>
                  <span className="bg-gradient-to-r from-[#5AC8FA] via-[#AF52DE] to-[#FF375F] bg-clip-text text-transparent text-xs font-semibold">
                    AI Agent &amp; Chat Studio
                  </span>
                  <h2 className="text-2xl font-semibold tracking-[-0.02em] mt-2">
                    Perintahkan dengan bahasa Anda.
                  </h2>
                  <p className="text-sm text-[#A1A1A6] mt-2 leading-relaxed">
                    Hubungkan OpenCode, Antigravity (Gemini), Ollama, atau jalankan instan secara
                    offline.
                  </p>
                </div>
                <span className="text-sm font-medium text-[#2997FF] mt-5 inline-flex items-center gap-1">
                  <span>Mulai chat</span>
                  <span aria-hidden="true">&rsaquo;</span>
                </span>
              </button>
            )}

            {pipelineTool && (
              <button
                type="button"
                onClick={() => onSelectTool(pipelineTool)}
                className="text-left bg-white text-[#1D1D1F] rounded-[28px] p-7 sm:p-8 border border-black/[0.05] shadow-[0_2px_16px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[210px] hover:scale-[1.005] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] transition-all"
              >
                <div>
                  <span className="text-xs font-semibold text-[#6E6E73]">Otomasi Multi-Langkah</span>
                  <h2 className="text-2xl font-semibold tracking-[-0.02em] mt-2">
                    Visual Pipeline Studio.
                  </h2>
                  <p className="text-sm text-[#6E6E73] mt-2 leading-relaxed">
                    Rangkai PDF, Gambar, dan ZIP secara berantai &mdash; lengkap dengan preset dan
                    salin CLI/MCP.
                  </p>
                </div>
                <span className="text-sm font-medium text-[#0066CC] mt-5 inline-flex items-center gap-1">
                  <span>Susun pipeline</span>
                  <span aria-hidden="true">&rsaquo;</span>
                </span>
              </button>
            )}
          </section>
        </div>
      ) : (
        categoryFilter !== 'all' && (
          <div className="pt-2 space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em] text-[#1D1D1F]">
              {CATEGORY_LABELS[categoryFilter]}
            </h1>
            <p className="text-sm text-[#6E6E73]">
              {counts[categoryFilter]} alat lokal siap pakai di kategori ini.
            </p>
          </div>
        )
      )}

      {/* macOS Segmented Control + Rounded Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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

        <div className="relative w-full md:w-64 shrink-0">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari alat..."
            className="w-full pl-9 pr-8 py-2 rounded-full border border-black/[0.08] bg-white text-sm text-[#1D1D1F] placeholder:text-[#86868B] focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 outline-none transition-colors shadow-2xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F]"
              aria-label="Hapus pencarian"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Favorites Section */}
      {!query.trim() && categoryFilter === 'all' && favoriteTools.length > 0 && (
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
      {!query.trim() && categoryFilter === 'all' && recentTools.length > 0 && (
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
    </div>
  );
};
