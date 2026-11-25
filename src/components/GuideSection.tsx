import React, { useState } from 'react';
import {
  Archive,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  Command,
  Copy,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';

export type GuideTab = 'app' | 'ai-chat' | 'agent-mcp';

interface GuideSectionProps {
  initialTab?: GuideTab;
  onOpenHub?: () => void;
  onOpenAiChat?: () => void;
  onOpenPipeline?: () => void;
  onOpenFaq?: () => void;
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Salin' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-semibold transition-colors shrink-0"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      <span>{copied ? 'Disalin' : label}</span>
    </button>
  );
};

const CURRENT_ORIGIN =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://app.worktools.my.id';
const OPENCODE_SERVE_CMD = `opencode serve --port 4096 --cors ${CURRENT_ORIGIN}`;

const OPENCODE_JSON_SNIPPET = `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tenggoo": {
      "type": "local",
      "command": ["node", "<path-ke-repo>/bin/tenggoo-mcp.mjs"],
      "enabled": true
    }
  }
}`;

const MCP_SERVERS_SNIPPET = `{
  "mcpServers": {
    "tenggoo-toolkit": {
      "command": "node",
      "args": ["bin/tenggoo-mcp.mjs"],
      "cwd": "<path-ke-repo>"
    }
  }
}`;

const CLI_EXAMPLES_SNIPPET = `# Lihat daftar 38 tool beserta skema JSON
node bin/tenggoo.mjs list --json

# Lihat detail parameter tool tertentu
node bin/tenggoo.mjs describe pdf.redact_text --json

# Jalankan satu tool
node bin/tenggoo.mjs run pdf.redact_text -i kontrak.pdf -o aman.pdf --presetPattern all_pii --json

# Rangkai pipeline multi-langkah sekaligus
node bin/tenggoo.mjs pipeline \\
  -i a.pdf b.pdf \\
  --step "pdf.merge" \\
  --step "pdf.watermark:text=INTERNAL,opacity=0.2" \\
  --step "pdf.page_numbers:position=bottom-center" \\
  -o hasil.pdf --json`;

const SAMPLE_CHAT_PROMPTS = [
  'Gabungkan file-file PDF ini menjadi satu dokumen, lalu tambahkan nomor halaman di tengah bawah.',
  'Sensor otomatis semua NIK dan email di dokumen PDF ini secara permanen lalu kompres agar ringkas.',
  'Rapikan hasil scan kertas dengan memutihkan latar belakang, susun grid A4 2 kolom, lalu jadikan PDF.',
  "Tambahkan watermark teks 'RAHASIA' miring di tengah semua halaman PDF.",
  'Ekstrak seluruh teks dan deteksi tabel dari dokumen PDF ini.',
  'Ubah setiap halaman PDF menjadi gambar JPG kualitas tinggi lalu bungkus ke dalam file ZIP.',
];

export const GuideSection: React.FC<GuideSectionProps> = ({
  initialTab = 'app',
  onOpenHub,
  onOpenAiChat,
  onOpenPipeline,
  onOpenFaq,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>(initialTab);

  const tabs: {
    id: GuideTab;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: 'app', label: 'Panduan Aplikasi', icon: BookOpen },
    { id: 'ai-chat', label: 'Panduan AI Chat', icon: Sparkles },
    { id: 'agent-mcp', label: 'Integrasi AI Agent (MCP & CLI)', icon: Terminal },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 py-2">
      {/* Header Banner */}
      <div className="bg-white rounded-[24px] border border-black/[0.05] p-6 sm:p-7 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-xs font-medium mb-2.5">
              <BookOpen size={14} />
              <span>Panduan Lengkap</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#1D1D1F] tracking-[-0.025em]">
              Panduan Penggunaan &amp; AI
            </h1>
            <p className="text-xs sm:text-sm text-[#6E6E73] mt-1 max-w-2xl leading-relaxed">
              Pelajari cara memakai 38+ alat pengolah file lokal, mengobrol dengan AI Chat Studio,
              serta menghubungkan Work Tool Super App ke agen AI seperti OpenCode &amp; Antigravity.
            </p>
          </div>

          {onOpenFaq && (
            <button
              type="button"
              onClick={onOpenFaq}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-black/[0.08] bg-[#F5F5F7] hover:bg-black/[0.06] text-[#1D1D1F] text-xs font-medium transition-colors self-start sm:self-center shrink-0"
            >
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>FAQ Keamanan</span>
            </button>
          )}
        </div>

        {/* macOS Segmented Tab Bar */}
        <div className="inline-flex items-center gap-1 bg-[#E8E8ED]/80 p-1 rounded-full overflow-x-auto max-w-full no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'bg-white text-[#1D1D1F] shadow-sm'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: PANDUAN APLIKASI */}
      {activeTab === 'app' && (
        <div className="space-y-5">
          {/* Quick Start 3 Langkah */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-4">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              Mulai Cepat dalam 3 Langkah
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-[18px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1.5">
                <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[#0071E3] text-white text-xs font-semibold">
                  1
                </span>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">Pilih Alat atau Tekan Ctrl+K</h3>
                <p className="text-xs text-[#6E6E73] leading-relaxed">
                  Gunakan filter kategori atau tekan <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-black/[0.1] rounded">Ctrl+K</kbd> untuk melompat cepat ke fitur PDF, Gambar, Teks/Data, maupun Arsip.
                </p>
              </div>
              <div className="p-4 rounded-[18px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1.5">
                <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[#0071E3] text-white text-xs font-semibold">
                  2
                </span>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">Lampirkan File di Browser</h3>
                <p className="text-xs text-[#6E6E73] leading-relaxed">
                  Tarik &amp; lepas (<em>drag &amp; drop</em>) file ke area kerja. Seluruh biner diproses lokal di RAM melalui WASM &amp; Web Workers — tidak ada yang diunggah ke server.
                </p>
              </div>
              <div className="p-4 rounded-[18px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1.5">
                <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[#0071E3] text-white text-xs font-semibold">
                  3
                </span>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">Unduh atau Lanjut ke Pipeline</h3>
                <p className="text-xs text-[#6E6E73] leading-relaxed">
                  Unduh hasil secara langsung atau kirimkan ke <strong>Visual Pipeline Studio</strong> untuk menyambung langkah berikutnya tanpa mengunggah ulang file.
                </p>
              </div>
            </div>
          </section>

          {/* 5 Domain Katalog */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-4">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              5 Kategori Alat Kerja
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-[18px] border border-black/[0.05] bg-[#F5F5F7]/40 flex items-start gap-3">
                <div className="p-2 rounded-[10px] bg-[#0071E3]/10 text-[#0071E3] shrink-0">
                  <FileText size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">File PDF (19 fitur UI)</h3>
                  <p className="text-xs text-[#6E6E73] mt-0.5 leading-relaxed">
                    Gabung, pisah, atur ulang, putar, kompres Ghostscript, watermark, nomor halaman, buka kunci, tanda tangan, sensor area/NIK otomatis (PII redaction), isi AcroForm, N-up, hingga bandingkan 2 PDF.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-[18px] border border-black/[0.05] bg-[#F5F5F7]/40 flex items-start gap-3">
                <div className="p-2 rounded-[10px] bg-[#30B0C7]/15 text-[#008299] shrink-0">
                  <ImageIcon size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">File Gambar (12 fitur UI)</h3>
                  <p className="text-xs text-[#6E6E73] mt-0.5 leading-relaxed">
                    Kompres, konversi PNG/JPG/WebP/ICO, resize, crop pas foto (1:1, 3:4, 4:6), scan enhancer, susun grid KTP A4, watermark, hapus EXIF/GPS, diff visual, dan konversi PDF ⇄ Gambar.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-[18px] border border-black/[0.05] bg-[#F5F5F7]/40 flex items-start gap-3">
                <div className="p-2 rounded-[10px] bg-[#FF9500]/12 text-[#C96B00] shrink-0">
                  <FileSpreadsheet size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">Teks &amp; Data (3 fitur UI)</h3>
                  <p className="text-xs text-[#6E6E73] mt-0.5 leading-relaxed">
                    Ekstrak teks &amp; tabel dari PDF ke Markdown/CSV/JSON, serta render dokumen Markdown atau tabel CSV/JSON menjadi PDF rapi.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-[18px] border border-black/[0.05] bg-[#F5F5F7]/40 flex items-start gap-3">
                <div className="p-2 rounded-[10px] bg-[#1D1D1F]/[0.06] text-[#1D1D1F] shrink-0">
                  <Archive size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">Arsip &amp; File Umum (3 fitur UI)</h3>
                  <p className="text-xs text-[#6E6E73] mt-0.5 leading-relaxed">
                    Buat QR Code PNG siap tempel, bungkus/ekstrak arsip ZIP secara lokal, dan hitung hash integritas SHA-256 / SHA-1 / SHA-512.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-[18px] border border-black/[0.05] bg-[#F5F5F7]/60 flex items-start gap-3 sm:col-span-2">
                <div className="p-2 rounded-[10px] bg-[#AF52DE]/12 text-[#8944AB] shrink-0">
                  <Workflow size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">AI &amp; Otomasi (AI Chat Studio + Visual Pipeline Studio)</h3>
                  <p className="text-xs text-[#6E6E73] mt-0.5 leading-relaxed">
                    Jalankan perintah bahasa alami melalui <strong>AI Chat Studio</strong> (dilengkapi pratinjau teks inline &amp; handoff langkah ke Pipeline) atau susun rangkaian multi-domain PDF + Gambar + ZIP di <strong>Visual Pipeline Studio</strong> dengan <strong>AI Pipeline Builder</strong>, 6 preset cepat, toggle <em>Aktif/Dilewati</em>, deteksi kecocokan format I/O, pratinjau multi-file, &amp; ekspor <code>.pipeline.json</code>.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Tips Produktivitas & CTA */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2 text-xs text-[#6E6E73]">
              <div className="flex items-center gap-2 font-semibold text-[#1D1D1F] text-sm">
                <Command size={15} className="text-[#0071E3]" />
                <span>Tips Produktivitas</span>
              </div>
              <ul className="space-y-1">
                <li className="flex items-center gap-1.5">
                  <Star size={12} className="text-[#FF9500] shrink-0" />
                  <span>Klik ikon bintang pada kartu alat untuk menyematkan fitur favorit Anda.</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Workflow size={12} className="text-[#0071E3] shrink-0" />
                  <span>Di <strong>Visual Pipeline Studio</strong>, ketik instruksi pada <em>AI Pipeline Builder</em>, lewati/duplikat langkah, rantai ulang hasil, atau salin perintah <code>--step</code> CLI &amp; MCP.</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {onOpenHub && (
                <button
                  type="button"
                  onClick={onOpenHub}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors"
                >
                  <span>Buka Katalog Fitur</span>
                  <ArrowRight size={13} />
                </button>
              )}
              {onOpenPipeline && (
                <button
                  type="button"
                  onClick={onOpenPipeline}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-black/[0.08] bg-[#F5F5F7] hover:bg-black/[0.06] text-[#1D1D1F] text-xs font-medium transition-colors"
                >
                  <Workflow size={13} />
                  <span>Visual Pipeline</span>
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: PANDUAN AI CHAT */}
      {activeTab === 'ai-chat' && (
        <div className="space-y-5">
          {/* Cara Pakai AI Chat */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
                  Cara Menggunakan AI Agent &amp; Chat Studio
                </h2>
                <p className="text-xs text-[#6E6E73] mt-0.5">
                  Instruksikan pemrosesan PDF, gambar, atau ZIP dengan kalimat sehari-hari di <code>#ai-chat</code>.
                </p>
              </div>
              {onOpenAiChat && (
                <button
                  type="button"
                  onClick={onOpenAiChat}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium shadow-2xs transition-colors self-start sm:self-auto"
                >
                  <Sparkles size={13} />
                  <span>Buka AI Chat Studio</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-[#6E6E73]">
              <div className="p-3.5 rounded-[16px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1">
                <span className="font-semibold text-[#1D1D1F] block">1. Pilih Engine AI</span>
                <p>Klik ikon roda gigi di pojok kanan atas AI Chat untuk memilih mode yang sesuai.</p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1">
                <span className="font-semibold text-[#1D1D1F] block">2. Lampirkan Dokumen</span>
                <p>Seret file atau klik ikon penjepit kertas di sebelah kotak input pesan.</p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1">
                <span className="font-semibold text-[#1D1D1F] block">3. Kirim Instruksi</span>
                <p>Tulis perintah Anda. Jika <em>Auto-Execute</em> aktif, pipeline langsung berjalan di browser.</p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1">
                <span className="font-semibold text-[#1D1D1F] block">4. Pratinjau, Rantai &amp; Edit</span>
                <p>Pratinjau output teks/JSON langsung di chat, jadikan lampiran berikutnya, atau buka langkahnya di Visual Pipeline Studio.</p>
              </div>
            </div>
          </section>

          {/* 4 Pilihan Backend AI */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-4">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              4 Pilihan Engine / Provider AI
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Built-in */}
              <div className="p-4 rounded-[18px] border border-emerald-200/80 bg-emerald-50/40 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                  <Zap size={16} className="text-emerald-600" />
                  <span>1. Built-in Offline (Tanpa Server)</span>
                </div>
                <p className="text-xs text-[#1D1D1F]/80 leading-relaxed">
                  Langsung siap dipakai secara offline tanpa koneksi internet maupun API key. Mengenali perintah multi-langkah bahasa Indonesia &amp; Inggris lengkap dengan ekstraksi parameter (seperti posisi watermark/halaman, profil kompresi, rasio crop, sensor NIK/Email, rapikan scan, hingga nama file <code>.zip</code>).
                </p>
              </div>

              {/* OpenCode */}
              <div className="p-4 rounded-[18px] border border-purple-200/80 bg-purple-50/40 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-900 font-semibold text-sm">
                  <Terminal size={16} className="text-purple-600" />
                  <span>2. OpenCode (opencode serve)</span>
                </div>
                <p className="text-xs text-[#1D1D1F]/80 leading-relaxed">
                  Terhubung ke server OpenCode Anda (<code>http://127.0.0.1:4096</code>) dan otomatis memuat daftar model aktif via <code>GET /provider</code>.
                </p>
                <div className="bg-[#1D1D1F] rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <code className="text-[11px] text-slate-100 font-mono truncate">{OPENCODE_SERVE_CMD}</code>
                  <CopyButton text={OPENCODE_SERVE_CMD} />
                </div>
                <p className="text-[11px] text-[#6E6E73]">
                  Jika web di-hosting di HTTPS, ganti nilai <code>--cors</code> menjadi domain app (misal <code>https://app.worktools.my.id</code>), atau gunakan aplikasi Desktop agar otomatis terhubung tanpa CORS.
                </p>
              </div>

              {/* Antigravity */}
              <div className="p-4 rounded-[18px] border border-blue-200/80 bg-blue-50/40 space-y-2">
                <div className="flex items-center gap-2 text-blue-900 font-semibold text-sm">
                  <Sparkles size={16} className="text-[#0071E3]" />
                  <span>3. Antigravity (Google Gemini)</span>
                </div>
                <p className="text-xs text-[#1D1D1F]/80 leading-relaxed">
                  Memanggil endpoint resmi Google Gemini (<code>gemini-2.0-flash</code>, <code>gemini-2.0-pro-exp-02-05</code>, <code>gemini-2.0-flash-thinking-exp-01-21</code>, <code>gemini-1.5-pro</code>, <code>gemini-1.5-flash</code>) dengan <em>function calling</em> ke seluruh <strong>38 tool</strong> plus <code>tenggoo_pipeline_run</code>.
                </p>
                <p className="text-[11px] text-[#6E6E73]">
                  Secara bawaan, API Key hanya disimpan sementara di <code>sessionStorage</code> dan terhapus saat tab ditutup (tersedia opsi opt-in <em>Simpan API Key Permanen</em>).
                </p>
              </div>

              {/* Local LLM */}
              <div className="p-4 rounded-[18px] border border-indigo-200/80 bg-indigo-50/40 space-y-2">
                <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
                  <Bot size={16} className="text-indigo-600" />
                  <span>4. Local LLM (Ollama / LM Studio)</span>
                </div>
                <p className="text-xs text-[#1D1D1F]/80 leading-relaxed">
                  Mendukung endpoint OpenAI-compatible lokal (<code>http://127.0.0.1:11434/v1</code> untuk Ollama atau <code>http://127.0.0.1:1234/v1</code> untuk LM Studio) lengkap dengan deteksi model lewat <code>GET /models</code>.
                </p>
                <p className="text-[11px] text-[#6E6E73]">
                  Untuk akses dari browser web, aktifkan izin CORS dengan variabel env <code>OLLAMA_ORIGINS=*</code> saat menjalankan Ollama.
                </p>
              </div>
            </div>
          </section>

          {/* Contoh Prompt Siap Salin */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-3">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              Contoh Prompt Siap Pakai
            </h2>
            <div className="space-y-2">
              {SAMPLE_CHAT_PROMPTS.map((prompt) => (
                <div
                  key={prompt}
                  className="flex items-center justify-between gap-3 p-3 rounded-[14px] bg-[#F5F5F7] border border-black/[0.04] text-xs text-[#1D1D1F]"
                >
                  <span>&ldquo;{prompt}&rdquo;</span>
                  <CopyButton text={prompt} />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: INTEGRASI AI AGENT (MCP & CLI) */}
      {activeTab === 'agent-mcp' && (
        <div className="space-y-5">
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-3">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              Menjalankan Tool Lewat MCP Server &amp; CLI
            </h2>
            <p className="text-xs sm:text-sm text-[#6E6E73] leading-relaxed">
              Selain antarmuka web, seluruh <strong>38 tool headless</strong> + <code>tenggoo_pipeline_run</code> dapat dipanggil langsung di komputer lokal oleh agen AI (OpenCode, Antigravity IDE, Claude Desktop, Cursor) lewat <strong>MCP Server</strong> maupun <strong>CLI</strong>. Memerlukan <strong>Node.js 22+</strong>.
            </p>
          </section>

          {/* OpenCode opencode.json */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">
                  Konfigurasi MCP untuk OpenCode (<code>opencode.json</code>)
                </h3>
                <p className="text-xs text-[#6E6E73] mt-0.5">
                  Daftarkan di konfigurasi proyek atau <code>~/.config/opencode/opencode.json</code>.
                </p>
              </div>
              <CopyButton text={OPENCODE_JSON_SNIPPET} />
            </div>
            <pre className="p-4 rounded-[16px] bg-[#1D1D1F] text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
              <code>{OPENCODE_JSON_SNIPPET}</code>
            </pre>
          </section>

          {/* Antigravity / Claude / Cursor */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">
                  Konfigurasi MCP untuk Antigravity, Claude Desktop, &amp; Cursor
                </h3>
                <p className="text-xs text-[#6E6E73] mt-0.5">
                  Mengekspose 39 MCP tools melalui protokol <code>stdio</code> JSON-RPC 2.0.
                </p>
              </div>
              <CopyButton text={MCP_SERVERS_SNIPPET} />
            </div>
            <pre className="p-4 rounded-[16px] bg-[#1D1D1F] text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
              <code>{MCP_SERVERS_SNIPPET}</code>
            </pre>
          </section>

          {/* CLI Examples */}
          <section className="bg-white rounded-[24px] border border-black/[0.05] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">
                  Perintah CLI Lokal (<code>bin/tenggoo.mjs</code>)
                </h3>
                <p className="text-xs text-[#6E6E73] mt-0.5">
                  Catatan Windows PowerShell: gunakan <code>cmd /c &quot;npm run ...&quot;</code> atau panggil langsung via <code>node bin/tenggoo.mjs</code>.
                </p>
              </div>
              <CopyButton text={CLI_EXAMPLES_SNIPPET} />
            </div>
            <pre className="p-4 rounded-[16px] bg-[#1D1D1F] text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
              <code>{CLI_EXAMPLES_SNIPPET}</code>
            </pre>
          </section>
        </div>
      )}
    </div>
  );
};
