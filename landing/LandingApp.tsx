import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  Cpu,
  Download,
  FileText,
  FolderArchive,
  Globe,
  Image as ImageIcon,
  Laptop,
  Layers,
  Lock,
  Menu,
  Monitor,
  ShieldCheck,
  Sparkles,
  Terminal,
  WifiOff,
  Workflow,
  X,
  Zap,
} from 'lucide-react';

const APP_URL = 'https://app.worktools.my.id';
const REPO_URL = 'https://github.com/alafgani1000/worktools';
const RELEASES_URL = `${REPO_URL}/releases/latest`;
const FALLBACK_VERSION = 'v1.1.0';
const FALLBACK_EXE_URL = `${REPO_URL}/releases/download/v1.1.0/WorkTools_1.1.0_x64-setup.exe`;
const FALLBACK_MSI_URL = `${REPO_URL}/releases/download/v1.1.0/WorkTools_1.1.0_x64_en-US.msi`;
const GITHUB_API_LATEST = 'https://api.github.com/repos/alafgani1000/worktools/releases/latest';

const CLI_SNIPPET = `# Jalankan pipeline PDF & ZIP langsung dari terminal
npm run tenggoo -- pipeline \\
  -i kontrak.pdf lampiran.pdf \\
  --step "pdf.merge" \\
  --step "pdf.redact_text:presetPattern=nik,burnIn=true" \\
  --step "util.zip_pack" \\
  -o paket-aman.zip`;

type ShowcaseTabId = 'hub' | 'ai' | 'pipeline';

interface ReleaseInfo {
  version: string;
  exeUrl: string;
  exeSizeLabel: string | null;
  msiUrl: string;
  releaseUrl: string;
}

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  html_url?: string;
  assets?: GitHubAsset[];
}

function formatMb(bytes: number | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function GitHubIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

const SHOWCASE_TABS: {
  id: ShowcaseTabId;
  label: string;
  subtitle: string;
  hash: string;
  ctaLabel: string;
}[] = [
  {
    id: 'hub',
    label: '39 Alat Kerja',
    subtitle: 'Semua alat PDF, Gambar, Data, dan Arsip dalam satu tempat yang rapi.',
    hash: '#semua-fitur',
    ctaLabel: 'Buka Semua Alat',
  },
  {
    id: 'ai',
    label: 'AI Chat Lokal',
    subtitle: 'Ketik instruksi bahasa Indonesia — berjalan offline atau tersambung ke OpenCode & Ollama.',
    hash: '#ai-chat',
    ctaLabel: 'Coba AI Chat Studio',
  },
  {
    id: 'pipeline',
    label: 'Visual Pipeline',
    subtitle: 'Rangkai beberapa langkah otomatis dan salin langsung menjadi perintah CLI atau MCP.',
    hash: '#pipeline',
    ctaLabel: 'Buka Visual Pipeline',
  },
];

export function LandingApp() {
  const [release, setRelease] = useState<ReleaseInfo>({
    version: FALLBACK_VERSION,
    exeUrl: FALLBACK_EXE_URL,
    exeSizeLabel: null,
    msiUrl: FALLBACK_MSI_URL,
    releaseUrl: RELEASES_URL,
  });
  const [activeTab, setActiveTab] = useState<ShowcaseTabId>('hub');
  const [copiedCli, setCopiedCli] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchLatestRelease() {
      try {
        const res = await fetch(GITHUB_API_LATEST, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as GitHubReleaseResponse;
        if (cancelled) return;

        const assets = Array.isArray(data.assets) ? data.assets : [];
        const exeAsset =
          assets.find((a) => a.name?.toLowerCase().endsWith('-setup.exe')) ??
          assets.find((a) => a.name?.toLowerCase().endsWith('.exe'));
        const msiAsset = assets.find((a) => a.name?.toLowerCase().endsWith('.msi'));

        setRelease({
          version: data.tag_name?.trim() || FALLBACK_VERSION,
          exeUrl: exeAsset?.browser_download_url || FALLBACK_EXE_URL,
          exeSizeLabel: formatMb(exeAsset?.size),
          msiUrl: msiAsset?.browser_download_url || FALLBACK_MSI_URL,
          releaseUrl: data.html_url || RELEASES_URL,
        });
      } catch {
        // Offline atau dibatasi rate-limit: tetap gunakan tautan statis v1.0.0
      }
    }

    void fetchLatestRelease();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(CLI_SNIPPET);
      setCopiedCli(true);
      window.setTimeout(() => setCopiedCli(false), 2000);
    } catch {
      setCopiedCli(false);
    }
  };

  const currentTab = SHOWCASE_TABS.find((t) => t.id === activeTab) ?? SHOWCASE_TABS[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7] text-[#1D1D1F]">
      {/* ================= 1. STICKY APPLE NAVBAR ================= */}
      <header className="sticky top-0 z-50 h-14 apple-glass">
        <div className="max-w-[1120px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src="./icon.png?v=2"
              alt="WorkTools"
              className="w-7 h-7 rounded-[8px] shadow-sm ring-1 ring-black/10 group-hover:scale-105 transition-transform"
            />
            <span className="text-[15px] font-semibold tracking-tight text-[#1D1D1F]">
              WorkTools
            </span>
          </a>

          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-[13px] font-medium text-[#424245]"
          >
            <a href="#fitur" className="hover:text-[#1D1D1F] transition-colors">
              Fitur
            </a>
            <a href="#privasi" className="hover:text-[#1D1D1F] transition-colors">
              Privasi
            </a>
            <a href="#bandingkan" className="hover:text-[#1D1D1F] transition-colors">
              Web vs Desktop
            </a>
            <a href="#developer" className="hover:text-[#1D1D1F] transition-colors">
              CLI &amp; MCP
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={release.exeUrl}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium text-[#1D1D1F] bg-black/[0.05] hover:bg-black/[0.09] transition-colors"
            >
              <Download size={13} />
              Unduh Desktop
            </a>
            <a
              href={APP_URL}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] shadow-sm transition-colors"
            >
              Buka Web App
              <ArrowUpRight size={13} />
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-1.5 rounded-lg text-[#424245] hover:bg-black/[0.06]"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)] border-b border-black/[0.08] px-4 py-3 space-y-2 text-[14px] font-medium">
            <a
              href="#fitur"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#1D1D1F]"
            >
              Fitur &amp; Studio
            </a>
            <a
              href="#privasi"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#1D1D1F]"
            >
              Privasi 100% Lokal
            </a>
            <a
              href="#bandingkan"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#1D1D1F]"
            >
              Web vs Desktop
            </a>
            <a
              href="#developer"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1.5 text-[#1D1D1F]"
            >
              Developer CLI &amp; MCP
            </a>
            <a
              href={release.exeUrl}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 pt-2 border-t border-black/[0.06] text-[#0071E3] font-semibold"
            >
              <Download size={15} />
              Unduh Desktop Windows ({release.version})
            </a>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* ================= 2. DARK OBSIDIAN PRO HERO ================= */}
        <section className="relative overflow-hidden bg-[#0B0B0E] text-white pt-8 pb-16 sm:pt-10 sm:pb-20">
          {/* Ambient radial glow matching app WorkTools aesthetic */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[360px] rounded-full bg-gradient-to-tr from-[#0071E3]/25 via-[#4CC9F0]/15 to-[#F59E0B]/15 blur-3xl opacity-80"
          />

          <div className="relative max-w-[1120px] mx-auto px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.12] text-[12px] font-medium text-white/90 mb-4 sm:mb-5">
              <span className="w-2 h-2 rounded-full bg-[#34C759]" />
              <span>WorkTools {release.version} · 100% Lokal · Gratis &amp; Open Source</span>
            </div>

            <h1 className="text-[36px] sm:text-[54px] lg:text-[62px] font-bold tracking-[-0.03em] leading-[1.06] max-w-4xl mx-auto">
              Olah PDF, Gambar &amp; AI.
              <br />
              <span className="bg-gradient-to-r from-[#4CC9F0] via-[#4895EF] to-[#F59E0B] bg-clip-text text-transparent">
                Tanpa Unggah ke Server.
              </span>
            </h1>

            <p className="mt-4 text-[16px] sm:text-[18px] text-[#A1A1A6] max-w-2xl mx-auto leading-relaxed">
              39 alat kerja PDF, konversi gambar, sensor NIK/PII, arsip ZIP, hingga AI Agent — seluruhnya
              diproses langsung di RAM perangkat Anda. Pilih{' '}
              <span className="text-white font-medium">Web App instan</span> atau{' '}
              <span className="text-white font-medium">Desktop Windows</span> offline.
            </p>

            {/* Primary Dual CTAs */}
            <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <a
                href={APP_URL}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] shadow-[0_8px_28px_rgba(0,113,227,0.38)] transition-all"
              >
                <Globe size={17} />
                Buka Web App
                <ArrowUpRight size={16} />
              </a>

              <a
                href={release.exeUrl}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-semibold text-[#1D1D1F] bg-white hover:bg-[#F5F5F7] transition-all"
              >
                <Download size={17} />
                <span>Unduh untuk Windows (.exe)</span>
                {release.exeSizeLabel && (
                  <span className="text-[12px] font-medium text-[#6E6E73]">
                    · {release.exeSizeLabel}
                  </span>
                )}
              </a>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-[#86868B]">
              <span>Versi terbaru: {release.version} (Windows x64)</span>
              <span aria-hidden="true">·</span>
              <a
                href={release.msiUrl}
                className="text-[#A1A1A6] hover:text-white underline underline-offset-4 transition-colors"
              >
                Installer .msi
              </a>
              <span aria-hidden="true">·</span>
              <a
                href={release.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A1A1A6] hover:text-white underline underline-offset-4 transition-colors"
              >
                Catatan Rilis GitHub
              </a>
            </div>

            {/* Trust Micro-Badges */}
            <div className="mt-7 pt-6 border-t border-white/[0.08] max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] font-medium text-[#A1A1A6]">
              <div className="flex items-center justify-center gap-1.5">
                <ShieldCheck size={14} className="text-[#34C759]" />
                <span>0% Upload Cloud</span>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <WifiOff size={14} className="text-[#4CC9F0]" />
                <span>Jalan Tanpa Internet</span>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Lock size={14} className="text-[#F59E0B]" />
                <span>Tanpa Akun / Login</span>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Zap size={14} className="text-[#A855F7]" />
                <span>WebAssembly Native</span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 3. INTERACTIVE SHOWCASE FRAME ================= */}
        <section className="relative z-10 -mt-8 sm:-mt-10 pb-10 sm:pb-12 px-4 sm:px-6">
          <div className="max-w-[1120px] mx-auto">
            <div className="rounded-[26px] bg-white border border-black/[0.08] shadow-[0_24px_70px_rgba(0,0,0,0.12)] overflow-hidden">
              {/* macOS Window Top Bar + Switcher Tabs */}
              <div className="px-4 sm:px-6 py-3.5 bg-[#FBFBFD] border-b border-black/[0.06] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/[0.04] text-[12px] text-[#6E6E73] font-medium">
                    <Lock size={11} className="text-[#34C759]" />
                    <span>app.worktools.my.id{currentTab.hash}</span>
                  </div>
                </div>

                {/* Clickable Preview Tabs */}
                <div
                  role="tablist"
                  aria-label="Pratinjau Studio WorkTools"
                  className="inline-flex p-1 rounded-full bg-black/[0.05] self-start md:self-auto"
                >
                  {SHOWCASE_TABS.map((tab) => {
                    const selected = tab.id === activeTab;
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={selected}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                          selected
                            ? 'bg-white text-[#1D1D1F] shadow-sm'
                            : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview Body */}
              <div className="p-5 sm:p-7 bg-[#F5F5F7]">
                {activeTab === 'hub' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    <div className="rounded-2xl bg-[#0B0B0E] text-white p-6 flex flex-col justify-between">
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-medium text-[#4CC9F0]">
                          <Layers size={12} /> Semua Fitur dalam Satu Workspace
                        </span>
                        <h3 className="mt-4 text-[22px] sm:text-[24px] font-bold tracking-tight">
                          39 Alat Siap Pakai di Browser Anda
                        </h3>
                        <p className="mt-2 text-[14px] text-[#A1A1A6]">
                          Tidak perlu memasang 10 aplikasi berbeda atau mengunggah dokumen sensitif
                          ke situs online acak. Cukup drop file dan proses seketika.
                        </p>
                      </div>
                      <div className="mt-6 grid grid-cols-2 gap-2.5 text-[12px]">
                        {[
                          'Gabung & Pisah PDF',
                          'Kompres Ghostscript',
                          'Sensor NIK / PII',
                          'Gambar ke PDF',
                          'Kompres & Resize Foto',
                          'Pack & Ekstrak ZIP',
                        ].map((item) => (
                          <div
                            key={item}
                            className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/90 font-medium"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-black/[0.06] p-6 flex flex-col justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E73]">
                          Paling Sering Dipakai
                        </p>
                        <ul className="mt-3 space-y-2.5">
                          {[
                            {
                              name: 'Kompres PDF',
                              tag: 'Ghostscript WASM',
                              hash: '#kompres-pdf',
                            },
                            {
                              name: 'Sensor PII / NIK',
                              tag: 'Burn-in Permanen',
                              hash: '#sensor-teks-pdf',
                            },
                            {
                              name: 'Grid / KTP Sheet',
                              tag: 'Cetak A4 Cepat',
                              hash: '#image-grid',
                            },
                            {
                              name: 'PDF ke Gambar',
                              tag: 'PNG / JPG HD',
                              hash: '#pdf-ke-gambar',
                            },
                          ].map((tool) => (
                            <li key={tool.hash}>
                              <a
                                href={`${APP_URL}/${tool.hash}`}
                                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F5F5F7] transition-colors group"
                              >
                                <div>
                                  <p className="text-[13px] font-semibold text-[#1D1D1F]">
                                    {tool.name}
                                  </p>
                                  <p className="text-[11px] text-[#6E6E73]">{tool.tag}</p>
                                </div>
                                <ArrowUpRight
                                  size={14}
                                  className="text-[#86868B] group-hover:text-[#0071E3]"
                                />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    <div className="rounded-2xl bg-white border border-black/[0.06] p-6 space-y-4">
                      <div className="flex items-center justify-between gap-2 border-b border-black/[0.05] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-xl bg-[#AF52DE]/12 text-[#8944AB] flex items-center justify-center">
                            <Sparkles size={15} />
                          </span>
                          <div>
                            <p className="text-[13px] font-semibold">AI Agent &amp; Chat Studio</p>
                            <p className="text-[11px] text-[#6E6E73]">
                              Offline Intent Engine · OpenCode · Ollama
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-[#34C759]/12 text-[#1E7E34] text-[11px] font-semibold shrink-0">
                          Mode Offline Aktif
                        </span>
                      </div>

                      <div className="space-y-3 text-[13px]">
                        <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-[#0071E3] text-white px-4 py-2.5">
                          Gabungkan 3 PDF lampiran ini, sensor semua nomor NIK &amp; email, lalu
                          kompres jadi ukuran ebook.
                        </div>
                        <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-[#F5F5F7] text-[#1D1D1F] px-4 py-3 space-y-2">
                          <p className="font-medium">
                            Menjalankan 3 langkah secara lokal di perangkat Anda:
                          </p>
                          <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                            <span className="px-2 py-1 rounded-md bg-white border border-black/10">
                              1. pdf.merge
                            </span>
                            <span className="px-2 py-1 rounded-md bg-white border border-black/10">
                              2. pdf.redact_text
                            </span>
                            <span className="px-2 py-1 rounded-md bg-white border border-black/10">
                              3. pdf.compress
                            </span>
                          </div>
                          <p className="text-[12px] text-[#1E7E34] font-medium">
                            Selesai dalam 1,4 detik — siap diunduh tanpa meninggalkan browser.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#0B0B0E] text-white p-6 flex flex-col justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-[#4CC9F0] uppercase tracking-wider">
                          Fleksibel Sesuai Kebutuhan
                        </p>
                        <h3 className="mt-2 text-[20px] font-bold">
                          Jalan Tanpa API Key, Siap Naik Kelas ke AI Lokal
                        </h3>
                        <ul className="mt-4 space-y-3 text-[13px] text-[#A1A1A6]">
                          <li className="flex items-start gap-2">
                            <Check size={15} className="text-[#34C759] shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-white">38 intent offline</strong> langsung
                              paham perintah bahasa Indonesia.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check size={15} className="text-[#34C759] shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-white">Versi Desktop</strong> otomatis
                              menghubungkan OpenCode &amp; Ollama lokal tanpa kendala CORS.
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'pipeline' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    <div className="rounded-2xl bg-white border border-black/[0.06] p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <span className="w-7 h-7 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                            <Workflow size={15} />
                          </span>
                          <div>
                            <p className="text-[13px] font-semibold">Visual Pipeline Studio</p>
                            <p className="text-[11px] text-[#6E6E73]">
                              Alur multi-file PDF + Gambar + ZIP sekali klik
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {[
                            { step: 'Langkah 1', title: 'Gabung PDF', param: '3 dokumen' },
                            { step: 'Langkah 2', title: 'No. Halaman', param: 'N / Total' },
                            { step: 'Langkah 3', title: 'Pack ke ZIP', param: 'paket.zip' },
                          ].map((node) => (
                            <div
                              key={node.step}
                              className="rounded-xl border border-black/[0.08] bg-[#F5F5F7] p-3"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0071E3]">
                                {node.step}
                              </p>
                              <p className="text-[13px] font-semibold text-[#1D1D1F] mt-0.5">
                                {node.title}
                              </p>
                              <p className="text-[11px] text-[#6E6E73] mt-0.5">{node.param}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 p-3 rounded-xl bg-[#0B0B0E] text-[#A1A1A6] font-mono text-[11px] overflow-x-auto">
                        $ npm run tenggoo -- pipeline -i a.pdf b.pdf --step &quot;pdf.merge&quot;
                        --step &quot;util.zip_pack&quot;
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#0B0B0E] text-white p-6 flex flex-col justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-[#F59E0B] uppercase tracking-wider">
                          Sekali Rangkai, Ulangi Kapan Saja
                        </p>
                        <h3 className="mt-2 text-[20px] font-bold">
                          Ekspor ke CLI &amp; MCP Secara Otomatis
                        </h3>
                        <p className="mt-2 text-[13px] text-[#A1A1A6] leading-relaxed">
                          Setiap pipeline yang Anda susun secara visual bisa langsung disalin sebagai
                          perintah terminal atau skrip agen AI.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Caption + Deep Link Footer */}
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
                  <p className="text-[13px] text-[#424245]">{currentTab.subtitle}</p>
                  <a
                    href={`${APP_URL}/${currentTab.hash}`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0071E3] hover:underline shrink-0"
                  >
                    {currentTab.ctaLabel} di app.worktools.my.id
                    <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 4. PRIVACY & SPEED BENTO (3 EQUAL CARDS) ================= */}
        <section id="privasi" className="scroll-mt-16 py-10 sm:py-14 px-4 sm:px-6">
          <div className="max-w-[1120px] mx-auto">
            <div className="max-w-2xl mb-7">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071E3]">
                Arsitektur Zero-Server
              </p>
              <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-[-0.025em] leading-[1.12]">
                Dokumen Anda Tidak Pernah Meninggalkan Perangkat.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
              <div className="apple-card p-6 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-2xl bg-[#34C759]/12 text-[#1E7E34] flex items-center justify-center">
                    <ShieldCheck size={20} />
                  </div>
                  <h3 className="mt-4 text-[19px] font-bold tracking-tight">0% Unggah ke Server</h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73] leading-relaxed">
                    Seluruh pemrosesan KTP, kontrak, dan laporan keuangan berlangsung di RAM
                    perangkat Anda via WebAssembly &amp; Rust.
                  </p>
                </div>
                <p className="mt-5 text-[12px] font-semibold text-[#1E7E34]">
                  Bekerja penuh meski Wi-Fi dimatikan
                </p>
              </div>

              <div className="apple-card p-6 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                    <Zap size={20} />
                  </div>
                  <h3 className="mt-4 text-[19px] font-bold tracking-tight">Kecepatan Instan</h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73] leading-relaxed">
                    Tanpa menunggu proses upload dan download ulang file ratusan MB. Didukung
                    Ghostscript WASM &amp; Canvas akselerasi perangkat.
                  </p>
                </div>
                <p className="mt-5 text-[12px] font-semibold text-[#0071E3]">
                  Cocok untuk file besar &amp; batch
                </p>
              </div>

              <div className="apple-card p-6 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-2xl bg-[#AF52DE]/12 text-[#8944AB] flex items-center justify-center">
                    <GitHubIcon size={20} />
                  </div>
                  <h3 className="mt-4 text-[19px] font-bold tracking-tight">
                    Gratis &amp; Open Source
                  </h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73] leading-relaxed">
                    Tanpa watermark paksa, tanpa batasan kuota harian, dan kode sumbernya terbuka
                    untuk diaudit di GitHub.
                  </p>
                </div>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1D1D1F] hover:text-[#0071E3]"
                >
                  Lihat Kode di GitHub <ArrowUpRight size={13} />
                </a>
              </div>
            </div>

            {/* Full-width Local Processing Strip */}
            <div className="mt-5 apple-card p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                <div className="rounded-2xl bg-[#F5F5F7] p-4 border border-black/[0.05]">
                  <p className="text-[11px] font-semibold text-[#6E6E73]">1. Input File Lokal</p>
                  <p className="text-[14px] font-semibold mt-1">PDF, Foto, atau Arsip ZIP</p>
                </div>
                <div className="rounded-2xl bg-[#0B0B0E] text-white p-4 border border-black/10">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[#4CC9F0]">2. Mesin Lokal</p>
                    <Cpu size={14} className="text-[#4CC9F0]" />
                  </div>
                  <p className="text-[14px] font-semibold mt-1">RAM, WebAssembly &amp; Rust</p>
                </div>
                <div className="rounded-2xl bg-[#34C759]/10 p-4 border border-[#34C759]/20">
                  <p className="text-[11px] font-semibold text-[#1E7E34]">3. Hasil Aman</p>
                  <p className="text-[14px] font-semibold text-[#1D1D1F] mt-1">
                    Langsung Tersimpan di Perangkat
                  </p>
                </div>
              </div>
              <p className="mt-3.5 text-[12px] text-[#6E6E73]">
                <strong className="text-[#1D1D1F]">Bisa dibuktikan sendiri:</strong> matikan Wi-Fi
                setelah membuka aplikasi, lalu gabung atau sensor PDF — semuanya tetap berjalan tanpa
                error jaringan.
              </p>
            </div>
          </div>
        </section>

        {/* ================= 5. 4-CATEGORY FEATURE BENTO GRID ================= */}
        <section id="fitur" className="scroll-mt-16 py-10 sm:py-14 px-4 sm:px-6 bg-white border-y border-black/[0.05]">
          <div className="max-w-[1120px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-7">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071E3]">
                  Lengkap dalam Satu Suite
                </p>
                <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-[-0.025em] leading-[1.12]">
                  Semua Alat Produktivitas Harian Anda.
                </h2>
              </div>
              <a
                href={`${APP_URL}/#semua-fitur`}
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0071E3] hover:underline shrink-0"
              >
                Jelajahi seluruh 39 alat
                <ArrowUpRight size={15} />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Category 1: PDF Studio */}
              <div className="rounded-[24px] bg-[#F5F5F7] p-6 sm:p-7 border border-black/[0.05] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                      <FileText size={22} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white text-[12px] font-semibold text-[#424245] border border-black/[0.06]">
                      19 Alat PDF
                    </span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-bold tracking-tight">PDF Studio</h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73] leading-relaxed">
                    Kelola dokumen kontrak, skripsi, maupun arsip kantor dari satu layar tanpa
                    aplikasi berbayar.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                    {[
                      'Gabung PDF',
                      'Pisah Halaman',
                      'Kompres Ghostscript',
                      'Sensor NIK / PII',
                      'Tanda Tangan',
                      'Ekstrak Tabel CSV',
                      'Cetak N-up',
                      'Bandingkan 2 PDF',
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-lg bg-white text-[#1D1D1F] font-medium border border-black/[0.05]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-black/[0.06] flex items-center justify-between">
                  <a
                    href={`${APP_URL}/#merge-pdf`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0071E3] hover:underline"
                  >
                    Buka PDF Studio <ArrowRight size={14} />
                  </a>
                  <a
                    href={`${APP_URL}/#sensor-teks-pdf`}
                    className="text-[12px] font-medium text-[#6E6E73] hover:text-[#1D1D1F]"
                  >
                    Coba Sensor NIK →
                  </a>
                </div>
              </div>

              {/* Category 2: Image Studio */}
              <div className="rounded-[24px] bg-[#F5F5F7] p-6 sm:p-7 border border-black/[0.05] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#30B0C7]/15 text-[#008299] flex items-center justify-center">
                      <ImageIcon size={22} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white text-[12px] font-semibold text-[#424245] border border-black/[0.06]">
                      12 Alat Gambar
                    </span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-bold tracking-tight">Image Studio</h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73] leading-relaxed">
                    Proses puluhan foto sekaligus: kompres, ubah format, rapikan hasil scan kertas,
                    hingga susun pas foto &amp; lembar cetak KTP.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                    {[
                      'Kompres Massal',
                      'JPG / PNG / WebP / ICO',
                      'Gambar ke PDF',
                      'Crop Pas Foto 3x4',
                      'Grid / KTP Sheet A4',
                      'Scan Enhancer',
                      'Hapus EXIF & GPS',
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-lg bg-white text-[#1D1D1F] font-medium border border-black/[0.05]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-black/[0.06] flex items-center justify-between">
                  <a
                    href={`${APP_URL}/#image-tools`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0071E3] hover:underline"
                  >
                    Buka Image Studio <ArrowRight size={14} />
                  </a>
                  <a
                    href={`${APP_URL}/#image-grid`}
                    className="text-[12px] font-medium text-[#6E6E73] hover:text-[#1D1D1F]"
                  >
                    Coba KTP Sheet →
                  </a>
                </div>
              </div>

              {/* Category 3: Data, Arsip & Utilitas */}
              <div className="rounded-[24px] bg-[#F5F5F7] p-6 sm:p-7 border border-black/[0.05] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#FF9500]/15 text-[#C96B00] flex items-center justify-center">
                      <FolderArchive size={22} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white text-[12px] font-semibold text-[#424245] border border-black/[0.06]">
                      6 Alat Data &amp; Arsip
                    </span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-bold tracking-tight">
                    Arsip, Data &amp; Utilitas
                  </h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73] leading-relaxed">
                    Kelola arsip terproteksi Zip-Slip, konversi catatan Markdown atau CSV/JSON ke
                    laporan PDF rapi, serta cek integritas SHA-256.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                    {[
                      'Pack ke ZIP',
                      'Ekstrak ZIP Aman',
                      'Hash SHA-256 / 512',
                      'Markdown ke PDF',
                      'CSV / JSON ke Tabel PDF',
                      'QR Code Generator',
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-lg bg-white text-[#1D1D1F] font-medium border border-black/[0.05]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-black/[0.06] flex items-center justify-between">
                  <a
                    href={`${APP_URL}/#pack-zip`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0071E3] hover:underline"
                  >
                    Buka Arsip &amp; Utilitas <ArrowRight size={14} />
                  </a>
                  <a
                    href={`${APP_URL}/#buat-qr-code`}
                    className="text-[12px] font-medium text-[#6E6E73] hover:text-[#1D1D1F]"
                  >
                    Buat QR Code →
                  </a>
                </div>
              </div>

              {/* Category 4: AI & Visual Pipeline */}
              <div className="rounded-[24px] bg-[#0B0B0E] text-white p-6 sm:p-7 border border-black/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#AF52DE]/20 text-[#D896FF] flex items-center justify-center">
                      <Bot size={22} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white/10 text-[12px] font-semibold text-white/90">
                      2 Studio Otomasi
                    </span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-bold tracking-tight">
                    AI Agent &amp; Visual Pipeline
                  </h3>
                  <p className="mt-2 text-[14px] text-[#A1A1A6] leading-relaxed">
                    Perintahkan pengolahan banyak file cukup dengan bahasa alami atau susun
                    pipeline visual lintas PDF, gambar, dan ZIP.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                    {[
                      '38 Intent Offline',
                      'OpenCode Lokal',
                      'Ollama Bridge',
                      'Gemini API (Opsional)',
                      'Ekspor CLI & MCP',
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.08] text-white/90 font-medium border border-white/[0.08]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.1] flex items-center justify-between">
                  <a
                    href={`${APP_URL}/#ai-chat`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#4CC9F0] hover:underline"
                  >
                    Buka AI Chat Studio <ArrowRight size={14} />
                  </a>
                  <a
                    href={`${APP_URL}/#pipeline`}
                    className="text-[12px] font-medium text-[#A1A1A6] hover:text-white"
                  >
                    Visual Pipeline →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 6. WEB APP vs DESKTOP COMPARISON ================= */}
        <section id="bandingkan" className="scroll-mt-16 py-10 sm:py-14 px-4 sm:px-6">
          <div className="max-w-[1120px] mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071E3]">
                Satu Pengalaman, Dua Cara Pakai
              </p>
              <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-[-0.025em] leading-[1.12]">
                Langsung di Browser atau Pasang di Windows.
              </h2>
              <p className="mt-3 text-[15px] text-[#6E6E73]">
                Keduanya memakai engine lokal yang sama. Pilih Web App untuk akses cepat dari mana
                saja, atau Desktop untuk kenyamanan penuh offline &amp; integrasi AI lokal.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Web App Column */}
              <div className="apple-card p-7 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                      <Globe size={22} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#F5F5F7] text-[12px] font-semibold text-[#424245]">
                      Tanpa Install
                    </span>
                  </div>

                  <h3 className="mt-5 text-[24px] font-bold tracking-tight">
                    Web App (app.worktools.my.id)
                  </h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73]">
                    Cocok untuk pemakaian cepat di kantor, kampus, maupun perangkat pinjaman.
                  </p>

                  <ul className="mt-6 space-y-3 text-[14px] text-[#1D1D1F]">
                    {[
                      'Langsung terbuka di Chrome, Edge, Safari, & Firefox',
                      'Lintas sistem operasi: Windows, macOS, Linux, hingga HP',
                      'Selalu menjalankan rilis versi terbaru secara otomatis',
                      'Tetap memproses file 100% di RAM browser tanpa upload',
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-2.5">
                        <Check size={16} className="text-[#0071E3] shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  <a
                    href={APP_URL}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-[14px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-colors"
                  >
                    Buka app.worktools.my.id
                    <ArrowUpRight size={16} />
                  </a>
                </div>
              </div>

              {/* Desktop App Column */}
              <div className="apple-card p-7 sm:p-8 ring-2 ring-[#1D1D1F]/90 flex flex-col justify-between relative">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-2xl bg-[#1D1D1F] text-white flex items-center justify-center">
                      <Laptop size={22} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#1D1D1F] text-[12px] font-semibold text-white">
                      Direkomendasikan · {release.version}
                    </span>
                  </div>

                  <h3 className="mt-5 text-[24px] font-bold tracking-tight">
                    Aplikasi Desktop Windows
                  </h3>
                  <p className="mt-2 text-[14px] text-[#6E6E73]">
                    Aplikasi native ringan berbasis Tauri v2 &amp; Rust untuk pengguna harian dan AI
                    lokal tanpa internet.
                  </p>

                  <ul className="mt-6 space-y-3 text-[14px] text-[#1D1D1F]">
                    {[
                      'Jalan 100% offline kapan saja — tidak butuh koneksi internet sama sekali',
                      'Native loopback bridge ke OpenCode & Ollama tanpa blokir CORS browser',
                      'Siap dengan ikon Start Menu, Desktop shortcut & WorkTools.exe',
                      'Bebas iklan, hemat RAM jauh dibanding aplikasi berbasis Electron',
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-2.5">
                        <Check size={16} className="text-[#34C759] shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 space-y-2.5">
                  <a
                    href={release.exeUrl}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-[14px] font-semibold text-white bg-[#1D1D1F] hover:bg-black transition-colors"
                  >
                    <Monitor size={16} />
                    <span>Unduh Installer Windows (.exe)</span>
                    {release.exeSizeLabel && (
                      <span className="text-[12px] text-white/70">· {release.exeSizeLabel}</span>
                    )}
                  </a>
                  <div className="flex items-center justify-center gap-4 text-[12px] text-[#6E6E73]">
                    <a href={release.msiUrl} className="hover:text-[#1D1D1F] underline">
                      Unduh versi .msi
                    </a>
                    <span aria-hidden="true">·</span>
                    <a
                      href={release.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#1D1D1F] underline"
                    >
                      Lihat di GitHub Releases
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 7. DEVELOPER, CLI & MCP ================= */}
        <section id="developer" className="scroll-mt-16 py-8 sm:py-12 px-4 sm:px-6">
          <div className="max-w-[1120px] mx-auto">
            <div className="rounded-[28px] bg-[#0B0B0E] text-white p-6 sm:p-9 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[12px] font-semibold text-[#4CC9F0]">
                  <Terminal size={13} />
                  CLI &amp; Model Context Protocol (MCP)
                </span>
                <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight leading-tight">
                  Untuk Developer &amp; Agen AI Otomatis.
                </h2>
                <p className="text-[14px] text-[#A1A1A6] leading-relaxed">
                  Seluruh alat WorkTools juga tersedia lewat terminal Node.js dan server MCP (
                  <code className="text-white font-mono text-[13px]">stdio</code>) sehingga bisa
                  dipanggil langsung dari skrip CI maupun agen coding Anda.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={`${APP_URL}/#panduan-mcp`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[13px] font-semibold text-white transition-colors"
                  >
                    Baca Panduan CLI &amp; MCP
                    <ArrowUpRight size={14} />
                  </a>
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/15 hover:bg-white/10 text-[13px] font-medium text-[#A1A1A6] hover:text-white transition-colors"
                  >
                    <GitHubIcon size={14} />
                    alafgani1000/worktools
                  </a>
                </div>
              </div>

              <div className="rounded-2xl bg-[#16161B] border border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between text-[12px] text-[#A1A1A6]">
                  <span className="font-mono">terminal — CLI pipeline &amp; MCP server</span>
                  <button
                    type="button"
                    onClick={handleCopyCli}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
                  >
                    {copiedCli ? <Check size={13} className="text-[#34C759]" /> : <Copy size={13} />}
                    {copiedCli ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
                <pre className="p-4 sm:p-5 text-[12px] sm:text-[13px] leading-relaxed text-[#E5E5EA] font-mono overflow-x-auto">
                  <code>{CLI_SNIPPET}</code>
                </pre>
                <div className="px-4 py-2.5 bg-white/[0.03] border-t border-white/10 text-[12px] text-[#A1A1A6] flex items-center gap-2">
                  <Archive size={13} className="text-[#4CC9F0] shrink-0" />
                  <span>
                    Jalankan server MCP lokal: <code className="text-white font-mono">npm run mcp</code>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 8. FINAL CTA BAND ================= */}
        <section id="unduh" className="scroll-mt-16 py-8 sm:py-12 px-4 sm:px-6 text-center">
          <div className="max-w-[1120px] mx-auto">
            <div className="apple-card p-7 sm:p-10">
              <img
                src="./icon.png?v=2"
                alt="Logo WorkTools"
                className="w-14 h-14 mx-auto rounded-2xl shadow-md ring-1 ring-black/10"
              />
              <h2 className="mt-5 text-[28px] sm:text-[36px] font-bold tracking-[-0.025em]">
                Siap Bekerja Lebih Cepat &amp; Privat?
              </h2>
              <p className="mt-3 text-[15px] text-[#6E6E73] max-w-xl mx-auto">
                Mulai langsung di browser lewat app.worktools.my.id atau pasang versi Desktop
                Windows di komputer Anda dalam hitungan detik.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                <a
                  href={APP_URL}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-colors"
                >
                  <Globe size={17} />
                  Buka app.worktools.my.id
                  <ArrowUpRight size={16} />
                </a>
                <a
                  href={release.exeUrl}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-[15px] font-semibold text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E8E8ED] border border-black/[0.08] transition-colors"
                >
                  <Download size={17} />
                  Unduh Desktop ({release.version})
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-black/[0.07] bg-white py-8 px-4 sm:px-6">
        <div className="max-w-[1120px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-[#6E6E73]">
          <div className="flex items-center gap-2">
            <img src="./icon.png?v=2" alt="" className="w-5 h-5 rounded-md" />
            <span>
              <strong className="text-[#1D1D1F]">WorkTools</strong> · 100% Client-Side PDF, Image
              &amp; AI Suite.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 font-medium">
            <a href={APP_URL} className="hover:text-[#1D1D1F] transition-colors">
              Web App
            </a>
            <a href={`${APP_URL}/#panduan`} className="hover:text-[#1D1D1F] transition-colors">
              Panduan
            </a>
            <a
              href={`${APP_URL}/#privacy-policy`}
              className="hover:text-[#1D1D1F] transition-colors"
            >
              Kebijakan Privasi
            </a>
            <a href={`${APP_URL}/#faq`} className="hover:text-[#1D1D1F] transition-colors">
              FAQ
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1D1D1F] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingApp;
