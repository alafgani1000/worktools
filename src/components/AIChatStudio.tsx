/* eslint-disable react-hooks/purity */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Play,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getTool, listTools } from '../core/registry.ts';
import { runPipeline } from '../core/pipeline.ts';
import { formatByteSize } from '../core/types.ts';
import type { PipelineStep, ToolDefinition, VirtualFile } from '../core/types.ts';
import {
  downloadVirtualFile,
  downloadVirtualFiles,
  filesToVirtualFiles,
} from '../utils/virtualFileWeb.ts';

export type AIProvider = 'opencode' | 'gemini-antigravity' | 'openai-compatible' | 'offline';

export interface AIChatConfig {
  provider: AIProvider;
  opencodeUrl: string;
  opencodePassword?: string;
  opencodeModel?: string;
  geminiApiKey?: string;
  geminiModel: string;
  openaiUrl: string;
  openaiModel: string;
  openaiApiKey?: string;
  autoExecute: boolean;
  rememberSecrets: boolean;
}

function isTauriDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

const DEFAULT_CONFIG: AIChatConfig = {
  provider: 'offline',
  opencodeUrl: 'http://127.0.0.1:4096',
  opencodeModel: '',
  geminiModel: 'gemini-2.0-flash',
  openaiUrl: 'http://127.0.0.1:11434/v1',
  openaiModel: 'qwen2.5-coder:7b',
  autoExecute: true,
  rememberSecrets: false,
};

const GEMINI_ANTIGRAVITY_MODELS = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Default Antigravity — Cepat & Cerdas)' },
  { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Experimental (Penalaran Rumit & Cekatan)' },
  { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking (Deep Reasoning)' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Context Window Besar)' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Hemat & Cepat)' },
];

const CONFIG_STORAGE_KEY = 'tenggoo_ai_chat_config_v4';
const SECRETS_STORAGE_KEY = 'tenggoo_ai_chat_secrets_v1';
const CHAT_HISTORY_STORAGE_KEY = 'tenggoo_ai_chat_history_v3';

function isLoopbackHostname(hostname: string): boolean {
  const clean = hostname.toLowerCase();
  return clean === 'localhost' || clean === '127.0.0.1' || clean === '::1' || clean === '[::1]';
}

interface LocalHttpBridgeResponse {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * Routes local 127.0.0.1 / localhost HTTP requests through Tauri's native Rust TCP bridge
 * when running in the Desktop app, completely eliminating browser CORS & Private Network Access blocks.
 */
async function localAiFetch(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }> {
  if (isTauriDesktop()) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) {
        const bridgeRes = await invoke<LocalHttpBridgeResponse>('tauri_ai_http_request', {
          url,
          method: options?.method ?? 'GET',
          headers: options?.headers ?? {},
          body: options?.body ?? null,
        });
        return {
          ok: bridgeRes.ok,
          status: bridgeRes.status,
          statusText: bridgeRes.ok ? 'OK' : `HTTP ${bridgeRes.status}`,
          json: async () => JSON.parse(bridgeRes.body) as unknown,
        };
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  const res = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: options?.headers,
    body: options?.body,
    signal: options?.signal,
  });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    json: () => res.json(),
  };
}

function getAppOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://worktools.my.id';
}

function buildOpenCodeServeCommand(rawUrl: string): string {
  let port = '4096';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.port) port = parsed.port;
  } catch {
    const match = rawUrl.match(/:(\d{2,5})/);
    if (match?.[1]) port = match[1];
  }
  return `opencode serve --port ${port} --cors ${getAppOrigin()}`;
}

function validateAiEndpointUrl(
  rawUrl: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'URL endpoint AI tidak boleh kosong.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `Format URL endpoint AI tidak valid: "${trimmed}".` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: `Skema URL "${parsed.protocol}" tidak diizinkan. Gunakan https:// atau http://localhost.`,
    };
  }
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    return {
      ok: false,
      error: `Endpoint remote (${parsed.hostname}) wajib memakai HTTPS agar API key tidak terkirim plaintext.`,
    };
  }
  const normalized = parsed.toString().replace(/\/+$/, '');
  return { ok: true, url: normalized };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  attachedFiles?: { name: string; size: number; mimeType: string }[];
  toolCall?: {
    tool: string;
    params: Record<string, unknown>;
    steps?: PipelineStep[];
    status: 'pending' | 'running' | 'completed' | 'failed';
    summary?: string;
    durationMs?: number;
    error?: string;
  };
  outputFiles?: VirtualFile[];
}

interface AIChatStudioProps {
  onSendToPipeline?: (files: VirtualFile[]) => void;
  onOpenGuide?: () => void;
}

const SAMPLE_PROMPTS = [
  {
    title: 'Gabungkan PDF & Beri Nomor',
    prompt: 'Gabungkan file-file PDF ini menjadi satu dokumen, lalu tambahkan nomor halaman di tengah bawah.',
    category: 'pdf',
  },
  {
    title: 'Kompres Ukuran File',
    prompt: 'Tolong kompres file ini agar ukurannya lebih kecil dan hemat ruang penyimpanan.',
    category: 'optimize',
  },
  {
    title: 'Beri Watermark Dokumen',
    prompt: "Tambahkan watermark teks 'RAHASIA' miring di tengah semua halaman PDF.",
    category: 'security',
  },
  {
    title: 'Ekstrak Teks & Tabel',
    prompt: 'Ekstrak seluruh teks dan deteksi tabel dari dokumen PDF ini.',
    category: 'data',
  },
  {
    title: 'PDF ke Gambar & Arsipkan ke ZIP',
    prompt: 'Ubah setiap halaman PDF menjadi gambar JPG kualitas tinggi lalu bungkus dalam file ZIP.',
    category: 'pipeline',
  },
];

function loadStoredConfig(): AIChatConfig {
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    const base = raw ? (JSON.parse(raw) as Partial<AIChatConfig>) : {};
    let sessionSecrets: Partial<Pick<AIChatConfig, 'geminiApiKey' | 'opencodePassword' | 'openaiApiKey'>> =
      {};
    try {
      const rawSec = window.sessionStorage.getItem(SECRETS_STORAGE_KEY);
      if (rawSec) {
        sessionSecrets = JSON.parse(rawSec) as typeof sessionSecrets;
      }
    } catch {
      // Ignore sessionStorage errors
    }
    return {
      ...DEFAULT_CONFIG,
      ...base,
      geminiApiKey: sessionSecrets.geminiApiKey ?? base.geminiApiKey,
      opencodePassword: sessionSecrets.opencodePassword ?? base.opencodePassword,
      openaiApiKey: sessionSecrets.openaiApiKey ?? base.openaiApiKey,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Comprehensive 38-tool local intent parser for 100% offline, zero-setup execution.
 */
function resolveIntentFromPrompt(
  prompt: string,
  inputFiles: VirtualFile[],
): { steps: PipelineStep[]; explanation: string } | null {
  const p = prompt.toLowerCase();
  const steps: PipelineStep[] = [];
  const explanations: string[] = [];

  const hasPdf = inputFiles.some((f) => f.name.toLowerCase().endsWith('.pdf'));
  const hasImages = inputFiles.some((f) => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
  const hasZip = inputFiles.some((f) => /\.zip$/i.test(f.name));
  const matchQuote = prompt.match(/['"]([^'"]+)['"]/);
  const quotedText = matchQuote?.[1]?.trim();

  // 1. Unpack ZIP (if input is ZIP or user asks to extract ZIP)
  if (
    hasZip ||
    p.includes('ekstrak zip') ||
    p.includes('bongkar zip') ||
    p.includes('unzip') ||
    p.includes('buka zip')
  ) {
    steps.push({ tool: 'util.zip_unpack', params: {} });
    explanations.push('Mengekstrak isi file dari arsip ZIP');
  }

  // 2. Generator tools (0-input tools: QR Code, Markdown -> PDF, CSV/JSON Table -> PDF)
  if (
    (p.includes('qr') || p.includes('qrcode') || p.includes('barcode')) &&
    !p.includes('tempel') &&
    !p.includes('stamp')
  ) {
    let qrText = quotedText || 'https://worktools.my.id';
    const urlMatch = prompt.match(/https?:\/\/[^\s'"]+/i);
    if (urlMatch) qrText = urlMatch[0];
    steps.push({ tool: 'util.qr_generate', params: { text: qrText, size: 280 } });
    explanations.push(`Membuat QR Code untuk '${qrText}'`);
  }

  if (
    p.includes('markdown ke pdf') ||
    p.includes('teks ke pdf') ||
    p.includes('tulisan ke pdf') ||
    p.includes('buat pdf dari teks') ||
    p.includes('md to pdf')
  ) {
    const colonIdx = prompt.indexOf(':');
    const mdBody =
      quotedText ||
      (colonIdx !== -1 ? prompt.slice(colonIdx + 1).trim() : `# Dokumen Baru\n\n${prompt}`);
    steps.push({ tool: 'util.md_to_pdf', params: { markdown: mdBody, pageSize: 'A4' } });
    explanations.push('Merender teks / Markdown menjadi dokumen PDF A4');
  }

  if (
    p.includes('csv ke pdf') ||
    p.includes('json ke pdf') ||
    p.includes('tabel ke pdf') ||
    p.includes('table to pdf')
  ) {
    steps.push({
      tool: 'util.table_to_pdf',
      params: { title: quotedText || 'Laporan Data Tabel', pageSize: 'A4' },
    });
    explanations.push('Mengubah data tabel CSV/JSON menjadi laporan PDF');
  }

  // 3. Merge PDF or Images -> PDF
  if (
    p.includes('gabung') ||
    p.includes('merge') ||
    p.includes('satukan') ||
    p.includes('gambar ke pdf') ||
    p.includes('foto ke pdf') ||
    p.includes('image to pdf')
  ) {
    if (
      (hasImages && !hasPdf) ||
      p.includes('gambar ke pdf') ||
      p.includes('foto ke pdf') ||
      p.includes('image to pdf')
    ) {
      steps.push({ tool: 'pdf.from_images', params: { pageSize: 'A4', margin: 20 } });
      explanations.push('Mengonversi dan menggabungkan gambar menjadi dokumen PDF A4');
    } else {
      steps.push({ tool: 'pdf.merge', params: {} });
      explanations.push('Menggabungkan file-file PDF menjadi satu dokumen');
    }
  }

  // 4. Split PDF / Extract pages
  if (
    p.includes('pisah') ||
    p.includes('pecah') ||
    p.includes('split') ||
    p.includes('ambil halaman')
  ) {
    const rangeMatch = prompt.match(/halaman\s+([0-9,\-\s]+)/i) || prompt.match(/\b(\d+\s*-\s*\d+)\b/);
    const pageRange = rangeMatch?.[1]?.trim();
    if (pageRange) {
      steps.push({ tool: 'pdf.split', params: { mode: 'range', pageRange } });
      explanations.push(`Memisahkan/mengekstrak halaman PDF (${pageRange})`);
    } else {
      steps.push({ tool: 'pdf.split', params: { mode: 'burst' } });
      explanations.push('Memecah setiap halaman PDF menjadi file terpisah');
    }
  }

  // 5. Reorder / Reverse PDF pages
  if (
    p.includes('balik urutan') ||
    p.includes('urutkan halaman') ||
    p.includes('reorder') ||
    p.includes('reverse halaman')
  ) {
    const orderMatch = prompt.match(/urutan\s+([0-9,\-\s]+)/i);
    const order = orderMatch?.[1]?.trim() || 'reverse';
    steps.push({ tool: 'pdf.reorder', params: { order } });
    explanations.push(
      order === 'reverse'
        ? 'Membalik urutan halaman PDF dari belakang ke depan'
        : `Mengatur ulang urutan halaman PDF (${order})`,
    );
  }

  // 6. Rotate PDF or Image
  if (p.includes('putar') || p.includes('rotasi') || p.includes('rotate') || p.includes('balik foto')) {
    const angleMatch = p.match(/\b(90|180|270)\b/);
    const angle = angleMatch ? (Number(angleMatch[1]) as 90 | 180 | 270) : 90;
    if (hasImages && !hasPdf) {
      const flipH = p.includes('horizontal') || p.includes('cermin') || p.includes('mirror');
      const flipV = p.includes('vertikal') || p.includes('vertical');
      steps.push({
        tool: 'image.rotate_flip',
        params: { angle, flipHorizontal: flipH, flipVertical: flipV },
      });
      explanations.push(`Memutar gambar ${angle}°${flipH ? ' + balik horizontal' : ''}`);
    } else {
      steps.push({ tool: 'pdf.rotate', params: { angle } });
      explanations.push(`Memutar halaman PDF sebesar ${angle}°`);
    }
  }

  // 7. Crop PDF margins or Image aspect ratio
  if (p.includes('potong margin') || p.includes('rapikan pinggir') || p.includes('crop margin')) {
    steps.push({ tool: 'pdf.crop_margins', params: { marginPt: 18 } });
    explanations.push('Memotong margin kosong berlebih di tepi halaman PDF');
  } else if (
    (p.includes('potong') || p.includes('crop')) &&
    (hasImages || p.includes('gambar') || p.includes('foto') || /\b(1:1|4:3|16:9|3:4|9:16)\b/.test(p))
  ) {
    const ratioMatch = p.match(/\b(1:1|4:3|3:4|16:9|9:16)\b/);
    const aspectRatio = ratioMatch ? ratioMatch[1] : '1:1';
    steps.push({ tool: 'image.crop', params: { aspectRatio } });
    explanations.push(`Memotong gambar dengan rasio ${aspectRatio}`);
  }

  // 8. PDF N-up (multiple pages per sheet)
  if (
    p.includes('n-up') ||
    p.includes('nup') ||
    p.includes('per lembar') ||
    p.includes('cetak hemat')
  ) {
    const nMatch = p.match(/\b([2469])\s*halaman/i);
    const pagesPerSheet = nMatch ? Number(nMatch[1]) : 2;
    steps.push({ tool: 'pdf.nup', params: { pagesPerSheet } });
    explanations.push(`Menyusun ${pagesPerSheet} halaman PDF dalam satu lembar (N-up)`);
  }

  // 9. Auto Redact PII / Text or Area Redact
  if (
    p.includes('sensor') ||
    p.includes('redact') ||
    p.includes('samarkan') ||
    p.includes('sembunyikan nik') ||
    p.includes('hapus nik')
  ) {
    if (p.includes('kotak') || p.includes('area')) {
      steps.push({ tool: 'pdf.redact', params: { burnIn: true } });
      explanations.push('Menyensor area halaman PDF secara permanen');
    } else {
      let presetPattern: 'none' | 'nik' | 'email' | 'phone' | 'all_pii' = 'all_pii';
      if (p.includes('nik') && !p.includes('email') && !p.includes('hp')) presetPattern = 'nik';
      else if (p.includes('email') && !p.includes('nik')) presetPattern = 'email';
      else if ((p.includes('hp') || p.includes('telepon') || p.includes('nomor')) && !p.includes('nik'))
        presetPattern = 'phone';

      steps.push({
        tool: 'pdf.redact_text',
        params: {
          presetPattern: quotedText ? 'none' : presetPattern,
          ...(quotedText ? { query: quotedText } : {}),
          burnIn: true,
        },
      });
      explanations.push(
        quotedText
          ? `Menyensor teks '${quotedText}' secara permanen (burn-in)`
          : 'Menyensor data pribadi (NIK, Email, Nomor HP) secara permanen',
      );
    }
  }

  // 10. Unlock PDF
  if (p.includes('buka kunci') || p.includes('unlock') || p.includes('hapus password')) {
    const passMatch = prompt.match(/password\s*[:=]?\s*([^\s'"]+)/i);
    const password = quotedText || passMatch?.[1] || '';
    steps.push({ tool: 'pdf.unlock', params: { password } });
    explanations.push('Membuka kunci proteksi password PDF');
  }

  // 11. Metadata strip / inspect (PDF & Image EXIF)
  if (p.includes('exif') || (p.includes('metadata') && (hasImages || p.includes('foto') || p.includes('gambar')))) {
    steps.push({ tool: 'image.strip_metadata', params: {} });
    explanations.push('Menghapus metadata EXIF & lokasi GPS dari foto');
  } else if (p.includes('metadata')) {
    const isStrip =
      p.includes('hapus') || p.includes('bersih') || p.includes('strip') || p.includes('clear');
    steps.push({
      tool: 'pdf.metadata',
      params: { action: isStrip ? 'strip' : 'inspect' },
    });
    explanations.push(
      isStrip ? 'Menghapus metadata tersembunyi dari PDF' : 'Memeriksa informasi metadata PDF',
    );
  }

  // 12. AcroForm inspect / fill
  if (p.includes('formulir') || p.includes('acroform') || p.includes('form pdf')) {
    if (p.includes('isi') || p.includes('fill') || p.includes('flatten') || p.includes('ratakan')) {
      steps.push({ tool: 'pdf.form_fill', params: { flatten: true } });
      explanations.push('Mengisi dan meratakan (flatten) formulir PDF');
    } else {
      steps.push({ tool: 'pdf.form_inspect', params: {} });
      explanations.push('Mendeteksi daftar kolom formulir interaktif di dalam PDF');
    }
  }

  // 13. Diff PDF or Diff Image
  if (p.includes('bandingkan') || p.includes('perbedaan') || p.includes('diff')) {
    if (hasImages && !hasPdf) {
      steps.push({ tool: 'image.diff', params: {} });
      explanations.push('Membandingkan perbedaan visual dua gambar dengan peta warna (heatmap)');
    } else {
      steps.push({ tool: 'pdf.diff_text', params: {} });
      explanations.push('Membandingkan perbedaan isi teks antara dua dokumen PDF');
    }
  }

  // 14. Stamp image / QR onto PDF
  if (
    (p.includes('tempel') || p.includes('stamp') || p.includes('tanda tangan') || p.includes('logo')) &&
    (hasPdf || p.includes('pdf'))
  ) {
    if (p.includes('qr')) {
      const urlMatch = prompt.match(/https?:\/\/[^\s'"]+/i);
      const qrText = quotedText || urlMatch?.[0] || 'https://worktools.my.id';
      steps.push({ tool: 'util.qr_generate', params: { text: qrText, size: 220 } });
      explanations.push(`Membuat QR Code '${qrText}'`);
    }
    steps.push({ tool: 'pdf.stamp_image', params: { position: 'bottom-right', scalePct: 22 } });
    explanations.push('Menempelkan gambar/stempel ke pojok kanan bawah halaman PDF');
  }

  // 15. Watermark (PDF or Image)
  if (p.includes('watermark') || p.includes('cap ') || p.includes('beri cap') || p.includes('stempel teks')) {
    let text = 'INTERNAL';
    if (quotedText) {
      text = quotedText;
    } else if (p.includes('rahasia') || p.includes('confidential')) {
      text = 'RAHASIA';
    } else if (p.includes('draft')) {
      text = 'DRAFT';
    } else if (p.includes('salinan') || p.includes('copy')) {
      text = 'SALINAN';
    }
    if (hasImages && !hasPdf) {
      steps.push({
        tool: 'image.watermark',
        params: { text, opacity: 0.35, position: 'center-diagonal' },
      });
      explanations.push(`Menambahkan watermark '${text}' pada gambar`);
    } else {
      steps.push({
        tool: 'pdf.watermark',
        params: { text, opacity: 0.2, position: 'center-diagonal' },
      });
      explanations.push(`Menambahkan watermark '${text}' miring di tengah halaman PDF`);
    }
  }

  // 16. Page numbering
  if (
    p.includes('nomor halaman') ||
    p.includes('penomoran') ||
    p.includes('page number') ||
    p.includes('halaman di bawah')
  ) {
    steps.push({
      tool: 'pdf.page_numbers',
      params: { position: 'bottom-center', format: 'page-of-total' },
    });
    explanations.push('Menambahkan nomor halaman di bagian tengah bawah PDF');
  }

  // 17. Image Resize
  if (p.includes('resize') || p.includes('ubah ukuran gambar') || p.includes('resolusi')) {
    const dimMatch = p.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/i) || p.match(/\b(\d{3,4})\s*px\b/i);
    const width = dimMatch ? Number(dimMatch[1]) : 1280;
    const height = dimMatch?.[2] ? Number(dimMatch[2]) : undefined;
    steps.push({
      tool: 'image.resize',
      params: { width, ...(height ? { height } : {}), fit: 'inside' },
    });
    explanations.push(`Mengubah ukuran dimensi gambar ke lebar ${width}px`);
  }

  // 18. Image Format Conversion (PNG / JPEG / WebP / ICO)
  if (
    p.includes('ke webp') ||
    p.includes('jadi webp') ||
    p.includes('ke png') ||
    p.includes('jadi png') ||
    p.includes('ke jpg') ||
    p.includes('jadi jpg') ||
    p.includes('ke ico') ||
    p.includes('jadi ico') ||
    p.includes('favicon')
  ) {
    const targetFormat =
      p.includes('ico') || p.includes('favicon')
        ? 'ico'
        : p.includes('webp')
          ? 'webp'
          : p.includes('png')
            ? 'png'
            : 'jpeg';
    if (hasPdf && !hasImages && targetFormat !== 'ico') {
      steps.push({ tool: 'pdf.to_images', params: { format: targetFormat, scale: 2, quality: 90 } });
      explanations.push(`Mengonversi halaman PDF menjadi gambar ${targetFormat.toUpperCase()}`);
    } else {
      steps.push({ tool: 'image.convert', params: { format: targetFormat, quality: 90 } });
      explanations.push(`Mengonversi format gambar menjadi ${targetFormat.toUpperCase()}`);
    }
  }

  // 19. Document Scan Enhancer & Grid / ID Card Sheet
  if (p.includes('perjelas scan') || p.includes('hitam putih') || p.includes('tajamkan scan') || p.includes('scan enhance')) {
    steps.push({ tool: 'image.scan_enhance', params: { mode: 'bw-document', contrast: 1.35 } });
    explanations.push('Memperjelas dan menajamkan kontras dokumen hasil foto/scan');
  }

  if (p.includes('kolase') || p.includes('grid') || p.includes('pasfoto') || p.includes('lembar ktp')) {
    steps.push({ tool: 'image.grid_sheet', params: { columns: 2, pageSize: 'A4' } });
    explanations.push('Menyusun kumpulan foto ke dalam satu lembar kisi-kisi (Grid Sheet)');
  }

  // 20. Image Info
  if (p.includes('info gambar') || p.includes('cek dimensi') || p.includes('detail foto')) {
    steps.push({ tool: 'image.info', params: {} });
    explanations.push('Memeriksa dimensi, format, dan ukuran file gambar');
  }

  // 21. Compress PDF or Image
  if (
    p.includes('kompres') ||
    p.includes('compress') ||
    p.includes('perkecil') ||
    p.includes('hemat')
  ) {
    if (hasImages && !hasPdf && steps.length === 0) {
      steps.push({ tool: 'image.compress', params: { quality: 80, format: 'jpeg' } });
      explanations.push('Mengompresi file gambar dengan kualitas optimal 80%');
    } else {
      steps.push({ tool: 'pdf.compress', params: { quality: 'medium' } });
      explanations.push('Mengompresi ukuran PDF secara optimal');
    }
  }

  // 22. Convert PDF to images
  if (
    (p.includes('pdf ke gambar') || p.includes('ekstrak gambar') || p.includes('to image')) &&
    !steps.some((s) => s.tool === 'pdf.to_images')
  ) {
    steps.push({ tool: 'pdf.to_images', params: { format: 'jpeg', scale: 2, quality: 90 } });
    explanations.push('Merender halaman PDF menjadi gambar JPEG resolusi tinggi');
  }

  // 23. Extract text
  if (p.includes('ekstrak teks') || p.includes('extract text') || p.includes('ambil teks') || p.includes('baca teks')) {
    steps.push({ tool: 'pdf.extract_text', params: { includePositions: false } });
    explanations.push('Mengekstrak seluruh isi teks dari dokumen PDF');
  }

  // 24. Extract tables
  if (
    (p.includes('tabel') || p.includes('table')) &&
    !steps.some((s) => s.tool === 'util.table_to_pdf')
  ) {
    steps.push({ tool: 'pdf.extract_tables', params: {} });
    explanations.push('Mendeteksi kisi-kisi dan mengekstrak struktur tabel dari PDF');
  }

  // 25. Hash / Checksum
  if (p.includes('sha256') || p.includes('sha-256') || p.includes('sha512') || p.includes('sha1') || p.includes('checksum') || p.includes('hash')) {
    const algorithm = p.includes('512') ? 'SHA-512' : p.includes('sha1') || p.includes('sha-1') ? 'SHA-1' : 'SHA-256';
    steps.push({ tool: 'util.hash_checksum', params: { algorithm } });
    explanations.push(`Menghitung sidik jari kriptografi ${algorithm} file`);
  }

  // 26. Pack into ZIP archive (can be standalone or chained at the end of any pipeline!)
  if (
    (p.includes('zip') || p.includes('arsip')) &&
    !steps.some((s) => s.tool === 'util.zip_unpack')
  ) {
    steps.push({ tool: 'util.zip_pack', params: { archiveName: 'hasil_worktools.zip' } });
    explanations.push('Mengemas seluruh file hasil pemrosesan ke dalam arsip ZIP');
  }

  if (steps.length === 0) return null;

  return {
    steps,
    explanation: explanations.join(' lalu dilanjutkan dengan ') + '.',
  };
}

function renderFormattedText(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, lIdx) => {
        if (!line.trim()) return <div key={lIdx} className="h-1" />;
        const isBullet = line.trim().startsWith('-');
        const content = isBullet ? line.trim().slice(1).trim() : line;
        const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

        const renderedLine = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-bold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={pIdx}
                className="px-1.5 py-0.5 rounded bg-slate-200/60 font-mono text-[11px] text-purple-700 font-semibold"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return part;
        });

        if (isBullet) {
          return (
            <div key={lIdx} className="flex items-start gap-1.5 pl-1.5">
              <span className="text-purple-500 font-bold">•</span>
              <span>{renderedLine}</span>
            </div>
          );
        }

        return <p key={lIdx}>{renderedLine}</p>;
      })}
    </div>
  );
}

export const AIChatStudio: React.FC<AIChatStudioProps> = ({
  onSendToPipeline,
  onOpenGuide,
}) => {
  const [config, setConfig] = useState<AIChatConfig>(() => loadStoredConfig());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [serverHealth, setServerHealth] = useState<'checking' | 'connected' | 'offline' | 'idle'>(
    'idle',
  );
  const [healthError, setHealthError] = useState<string | null>(null);

  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ChatMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<VirtualFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Save messages to localStorage
  useEffect(() => {
    try {
      const sanitized = messages.slice(-30).map((m) => ({
        ...m,
        outputFiles: undefined,
      }));
      window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore quota errors
    }
  }, [messages]);

  // Load models from server
  const loadModelsForProvider = useCallback(async (cfg: AIChatConfig) => {
    setIsFetchingModels(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      if (cfg.provider === 'opencode') {
        const urlCheck = validateAiEndpointUrl(cfg.opencodeUrl);
        if (!urlCheck.ok) {
          clearTimeout(timeoutId);
          setDetectedModels([]);
          return;
        }
        const endpoint = `${urlCheck.url}/provider`;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (cfg.opencodePassword) {
          headers.Authorization = `Basic ${btoa(`opencode:${cfg.opencodePassword}`)}`;
        }
        const res = await localAiFetch(endpoint, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          const models: string[] = [];
          if (Array.isArray(json.all)) {
            for (const prov of json.all) {
              if (prov && typeof prov === 'object' && 'models' in prov) {
                const provModels = (prov as { models?: unknown }).models;
                if (Array.isArray(provModels)) {
                  for (const m of provModels) {
                    const mId = typeof m === 'string' ? m : m?.id || m?.name;
                    if (mId) models.push(String(mId));
                  }
                } else if (provModels && typeof provModels === 'object') {
                  models.push(...Object.keys(provModels));
                }
              }
            }
          }
          if (models.length > 0) {
            setDetectedModels(Array.from(new Set(models)));
            return;
          }
        }
      }

      if (cfg.provider === 'openai-compatible') {
        const urlCheck = validateAiEndpointUrl(cfg.openaiUrl);
        if (!urlCheck.ok) {
          clearTimeout(timeoutId);
          setDetectedModels([]);
          return;
        }
        const endpoint = `${urlCheck.url}/models`;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (cfg.openaiApiKey) {
          headers.Authorization = `Bearer ${cfg.openaiApiKey}`;
        }
        const res = await localAiFetch(endpoint, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = (await res.json()) as { data?: { id: string }[] };
          if (Array.isArray(json.data)) {
            setDetectedModels(json.data.map((d) => d.id).filter(Boolean));
            return;
          }
        }
      }

      if (cfg.provider === 'gemini-antigravity') {
        setDetectedModels(GEMINI_ANTIGRAVITY_MODELS.map((m) => m.id));
        return;
      }
    } catch {
      // Ignore
    } finally {
      setIsFetchingModels(false);
    }
    setDetectedModels([]);
  }, []);

  // Check server connection (manual trigger)
  const checkConnection = useCallback(async (targetConfig: AIChatConfig) => {
    setServerHealth('checking');
    setHealthError(null);

    if (targetConfig.provider === 'offline') {
      setServerHealth('connected');
      return;
    }

    if (targetConfig.provider === 'gemini-antigravity') {
      if (!targetConfig.geminiApiKey) {
        setServerHealth('connected');
        return;
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${targetConfig.geminiApiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          setServerHealth('connected');
        } else {
          setServerHealth('offline');
          setHealthError(`Gemini API Error: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        setServerHealth('offline');
        const msg = err instanceof Error ? err.message : String(err);
        setHealthError(`Gagal menghubungi Gemini API: ${msg}`);
      }
      return;
    }

    if (targetConfig.provider === 'opencode') {
      const urlCheck = validateAiEndpointUrl(targetConfig.opencodeUrl);
      if (!urlCheck.ok) {
        setServerHealth('offline');
        setHealthError(urlCheck.error);
        return;
      }
      try {
        if (isTauriDesktop()) {
          const portMatch = urlCheck.url.match(/:(\d{2,5})/);
          const port = portMatch ? Number(portMatch[1]) : 4096;
          try {
            await invoke('tauri_ai_ensure_opencode', { port });
          } catch {
            // Continue to connection test even if auto-spawn skipped
          }
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const endpoint = `${urlCheck.url}/session`;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (targetConfig.opencodePassword) {
          headers.Authorization = `Basic ${btoa(`opencode:${targetConfig.opencodePassword}`)}`;
        }
        const res = await localAiFetch(endpoint, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok || res.status === 401 || res.status === 404) {
          setServerHealth('connected');
        } else {
          setServerHealth('offline');
          setHealthError(`Status respons: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        setServerHealth('offline');
        const msg = err instanceof Error ? err.message : String(err);
        if (isTauriDesktop()) {
          setHealthError(
            `OpenCode belum terdeteksi di ${targetConfig.opencodeUrl} (${msg}). Anda dapat tetap menggunakan mode Built-in (38 Alat Offline) tanpa perlu menginstal OpenCode.`,
          );
        } else {
          const cmd = buildOpenCodeServeCommand(targetConfig.opencodeUrl);
          setHealthError(
            `Gagal menghubungi OpenCode di ${targetConfig.opencodeUrl} (${msg}). Gunakan mode Built-in (langsung siap tanpa setup) atau jalankan: ${cmd}`,
          );
        }
      }
      return;
    }

    if (targetConfig.provider === 'openai-compatible') {
      const urlCheck = validateAiEndpointUrl(targetConfig.openaiUrl);
      if (!urlCheck.ok) {
        setServerHealth('offline');
        setHealthError(urlCheck.error);
        return;
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const endpoint = `${urlCheck.url}/models`;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (targetConfig.openaiApiKey) {
          headers.Authorization = `Bearer ${targetConfig.openaiApiKey}`;
        }
        const res = await localAiFetch(endpoint, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok || res.status === 401) {
          setServerHealth('connected');
        } else {
          setServerHealth('offline');
          setHealthError(`Status respons: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        setServerHealth('offline');
        const msg = err instanceof Error ? err.message : String(err);
        setHealthError(`Gagal menghubungi endpoint di ${targetConfig.openaiUrl}: ${msg}`);
      }
    }
  }, []);

  // Background check on config change without firing on every keystroke while settings modal is open
  useEffect(() => {
    if (isSettingsOpen) return;
    let active = true;

    const probe = async () => {
      if (config.provider === 'offline') {
        if (active) {
          setServerHealth('connected');
          setHealthError(null);
        }
        return;
      }

      if (config.provider === 'gemini-antigravity') {
        if (active) {
          setServerHealth('connected');
          setHealthError(null);
        }
        return;
      }

      const rawEndpoint =
        config.provider === 'opencode' ? config.opencodeUrl : config.openaiUrl;
      const urlCheck = validateAiEndpointUrl(rawEndpoint);
      if (!urlCheck.ok) {
        if (active) {
          setServerHealth('offline');
          setHealthError(urlCheck.error);
        }
        return;
      }

      try {
        if (config.provider === 'opencode' && isTauriDesktop()) {
          const portMatch = urlCheck.url.match(/:(\d{2,5})/);
          const port = portMatch ? Number(portMatch[1]) : 4096;
          try {
            await invoke('tauri_ai_ensure_opencode', { port });
          } catch {
            // Ignore auto-start failure during background probe
          }
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const endpoint =
          config.provider === 'opencode' ? `${urlCheck.url}/session` : `${urlCheck.url}/models`;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (config.provider === 'opencode' && config.opencodePassword) {
          headers.Authorization = `Basic ${btoa(`opencode:${config.opencodePassword}`)}`;
        }
        const res = await localAiFetch(endpoint, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (active) {
          if (res.ok || res.status === 401 || res.status === 404) {
            setServerHealth('connected');
            setHealthError(null);
          } else {
            setServerHealth('offline');
            setHealthError(`Status respons: ${res.status} ${res.statusText}`);
          }
        }
      } catch (err) {
        if (active) {
          setServerHealth('offline');
          const msg = err instanceof Error ? err.message : String(err);
          const hint =
            config.provider === 'opencode'
              ? ` — jalankan: ${buildOpenCodeServeCommand(config.opencodeUrl)}`
              : '';
          setHealthError(`Gagal menghubungi server (${msg})${hint}`);
        }
      }
    };

    void probe();
    return () => {
      active = false;
    };
  }, [config, isSettingsOpen]);

  // Background load models on provider / endpoint changes (paused while editing in settings modal)
  useEffect(() => {
    if (isSettingsOpen) return;
    let active = true;

    const fetchModels = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        if (config.provider === 'opencode') {
          const urlCheck = validateAiEndpointUrl(config.opencodeUrl);
          if (!urlCheck.ok) {
            clearTimeout(timeoutId);
            if (active) setDetectedModels([]);
            return;
          }
          const endpoint = `${urlCheck.url}/provider`;
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (config.opencodePassword) {
            headers.Authorization = `Basic ${btoa(`opencode:${config.opencodePassword}`)}`;
          }
          const res = await localAiFetch(endpoint, { method: 'GET', headers, signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const json = (await res.json()) as Record<string, unknown>;
            const models: string[] = [];
            if (Array.isArray(json.all)) {
              for (const prov of json.all) {
                if (prov && typeof prov === 'object' && 'models' in prov) {
                  const provModels = (prov as { models?: unknown }).models;
                  if (Array.isArray(provModels)) {
                    for (const m of provModels) {
                      const mId = typeof m === 'string' ? m : m?.id || m?.name;
                      if (mId) models.push(String(mId));
                    }
                  } else if (provModels && typeof provModels === 'object') {
                    models.push(...Object.keys(provModels));
                  }
                }
              }
            }
            if (active && models.length > 0) {
              setDetectedModels(Array.from(new Set(models)));
              return;
            }
          }
        }

        if (config.provider === 'openai-compatible') {
          const urlCheck = validateAiEndpointUrl(config.openaiUrl);
          if (!urlCheck.ok) {
            clearTimeout(timeoutId);
            if (active) setDetectedModels([]);
            return;
          }
          const endpoint = `${urlCheck.url}/models`;
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (config.openaiApiKey) {
            headers.Authorization = `Bearer ${config.openaiApiKey}`;
          }
          const res = await localAiFetch(endpoint, { method: 'GET', headers, signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const json = (await res.json()) as { data?: { id: string }[] };
            if (active && Array.isArray(json.data)) {
              setDetectedModels(json.data.map((d) => d.id).filter(Boolean));
              return;
            }
          }
        }

        if (config.provider === 'gemini-antigravity') {
          if (active) {
            setDetectedModels(GEMINI_ANTIGRAVITY_MODELS.map((m) => m.id));
            return;
          }
        }
      } catch {
        // Ignore
      }
      if (active) {
        setDetectedModels([]);
      }
    };

    void fetchModels();
    return () => {
      active = false;
    };
  }, [
    isSettingsOpen,
    config.provider,
    config.opencodeUrl,
    config.opencodePassword,
    config.openaiUrl,
    config.openaiApiKey,
  ]);

  const saveConfig = (newCfg: AIChatConfig) => {
    setConfig(newCfg);
    const secrets = {
      geminiApiKey: newCfg.geminiApiKey,
      opencodePassword: newCfg.opencodePassword,
      openaiApiKey: newCfg.openaiApiKey,
    };
    const publicCfg: AIChatConfig = {
      ...newCfg,
      geminiApiKey: newCfg.rememberSecrets ? newCfg.geminiApiKey : undefined,
      opencodePassword: newCfg.rememberSecrets ? newCfg.opencodePassword : undefined,
      openaiApiKey: newCfg.rememberSecrets ? newCfg.openaiApiKey : undefined,
    };
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(publicCfg));
    try {
      if (newCfg.rememberSecrets) {
        window.sessionStorage.removeItem(SECRETS_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(SECRETS_STORAGE_KEY, JSON.stringify(secrets));
      }
    } catch {
      // Ignore sessionStorage errors
    }
  };

  const clearStoredCredentials = () => {
    const clearedCfg: AIChatConfig = {
      ...config,
      geminiApiKey: undefined,
      opencodePassword: undefined,
      openaiApiKey: undefined,
      rememberSecrets: false,
    };
    setConfig(clearedCfg);
    try {
      window.sessionStorage.removeItem(SECRETS_STORAGE_KEY);
    } catch {
      // Ignore sessionStorage errors
    }
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(clearedCfg));
    setHealthError(null);
  };

  const handleFilesAdded = async (fileList: FileList | File[]) => {
    const virtuals = await filesToVirtualFiles(Array.from(fileList));
    setAttachedFiles((prev) => [...prev, ...virtuals]);
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const executePipelineSteps = async (
    steps: PipelineStep[],
    inputFiles: VirtualFile[],
    messageId: string,
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.toolCall
          ? { ...m, toolCall: { ...m.toolCall, status: 'running' } }
          : m,
      ),
    );

    const start = Date.now();
    try {
      const res = await runPipeline(inputFiles, steps);
      const durationMs = Date.now() - start;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolCall: m.toolCall
                  ? {
                      ...m.toolCall,
                      status: 'completed',
                      summary: `Berhasil mengeksekusi ${steps.length} langkah dalam ${durationMs}ms`,
                      durationMs,
                    }
                  : undefined,
                outputFiles: res.files,
              }
            : m,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.toolCall
            ? {
                ...m,
                toolCall: {
                  ...m.toolCall,
                  status: 'failed',
                  error: msg,
                },
              }
            : m,
        ),
      );
    }
  };

  const handleSendMessage = async (promptToSend?: string) => {
    const text = (promptToSend ?? inputPrompt).trim();
    if (!text && attachedFiles.length === 0) return;

    const currentFiles = [...attachedFiles];
    setInputPrompt('');
    setAttachedFiles([]);
    setIsProcessing(true);

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now() + 1}`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: Date.now(),
      attachedFiles: currentFiles.map((f) => ({
        name: f.name,
        size: f.bytes.byteLength,
        mimeType: f.mimeType,
      })),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Provider 1: OpenCode Server
    if (config.provider === 'opencode' && serverHealth === 'connected') {
      const urlCheck = validateAiEndpointUrl(config.opencodeUrl);
      if (urlCheck.ok) {
        try {
          const endpoint = `${urlCheck.url}/session`;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          };
          if (config.opencodePassword) {
            headers.Authorization = `Basic ${btoa(`opencode:${config.opencodePassword}`)}`;
          }

          // 1. Create or get session
          const sessRes = await localAiFetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: 'Tenggoo Web Chat' }),
          });
          const sessData = (await sessRes.json()) as { id?: string; sessionID?: string };
          const sessionId = sessData.id || sessData.sessionID;

          if (sessionId) {
            const msgEndpoint = `${urlCheck.url}/session/${encodeURIComponent(sessionId)}/message`;
            const fileContext =
              currentFiles.length > 0
                ? `\n\n[File Lampiran: ${currentFiles.map((f) => `${f.name} (${formatByteSize(f.bytes.byteLength)})`).join(', ')}]`
                : '';

            const payloadBody: Record<string, unknown> = {
              text: `${text}${fileContext}`,
            };
            if (config.opencodeModel) {
              payloadBody.model = { modelID: config.opencodeModel };
            }

            const msgRes = await localAiFetch(msgEndpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(payloadBody),
            });

            if (msgRes.ok) {
              const replyData = (await msgRes.json()) as { text?: string; response?: string };
              const replyText =
                replyData.text || replyData.response || 'Permintaan telah diproses oleh agent OpenCode.';

              const assistantMessage: ChatMessage = {
                id: assistantMsgId,
                sender: 'assistant',
                text: replyText,
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, assistantMessage]);
              setIsProcessing(false);
              return;
            }
          }
        } catch (err) {
          console.warn('OpenCode request failed, falling back to local intent parser:', err);
        }
      }
    }

    // Provider 2: Google Gemini (Antigravity)
    if (config.provider === 'gemini-antigravity' && config.geminiApiKey) {
      try {
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.geminiApiKey}`,
        };

        const toolsPayload = listTools().slice(0, 25).map((t: ToolDefinition) => ({
          type: 'function',
          function: {
            name: t.id.replace('.', '_'),
            description: t.description,
            parameters: t.parameterSchema,
          },
        }));

        const body = {
          model: config.geminiModel || 'gemini-2.0-flash',
          messages: [
            {
              role: 'system',
              content:
                'Anda adalah asisten AI resmi untuk Tenggoo Work Tool Super App (didukung Antigravity & Gemini). Anda membantu pengguna memproses dokumen PDF, gambar, dan utilitas menggunakan tools yang tersedia. Balas dengan bahasa Indonesia yang ramah, ringkas, dan jelas.',
            },
            { role: 'user', content: text },
          ],
          tools: toolsPayload,
          tool_choice: 'auto',
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (res.ok) {
          interface OpenAiResponseChoice {
            message?: {
              content?: string;
              tool_calls?: {
                id: string;
                function: { name: string; arguments: string };
              }[];
            };
          }
          const data = (await res.json()) as { choices?: OpenAiResponseChoice[] };
          const choice = data.choices?.[0]?.message;

          if (choice) {
            const toolCall = choice.tool_calls?.[0];
            let steps: PipelineStep[] | undefined = undefined;

            if (toolCall) {
              const originalToolId = toolCall.function.name.replace('_', '.');
              let parsedParams = {};
              try {
                parsedParams = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
              } catch {
                // Ignore parse errors
              }
              steps = [{ tool: originalToolId, params: parsedParams }];
            }

            const assistantMessage: ChatMessage = {
              id: assistantMsgId,
              sender: 'assistant',
              text: choice.content || 'Saya telah merancang aksi pemrosesan untuk dokumen Anda:',
              timestamp: Date.now(),
              toolCall: steps
                ? {
                    tool: steps[0].tool,
                    params: steps[0].params ?? {},
                    steps,
                    status: config.autoExecute && currentFiles.length > 0 ? 'running' : 'pending',
                    summary: `Menjalankan tool: ${steps[0].tool}`,
                  }
                : undefined,
            };

            setMessages((prev) => [...prev, assistantMessage]);

            if (config.autoExecute && steps && currentFiles.length > 0) {
              await executePipelineSteps(steps, currentFiles, assistantMsgId);
            }

            setIsProcessing(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Gemini Antigravity call failed, falling back to local intent parser:', err);
      }
    }

    // Provider 3: OpenAI-Compatible Local LLM (Ollama, LM Studio)
    if (config.provider === 'openai-compatible' && serverHealth === 'connected') {
      const urlCheck = validateAiEndpointUrl(config.openaiUrl);
      if (urlCheck.ok) {
        try {
          const endpoint = `${urlCheck.url}/chat/completions`;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (config.openaiApiKey) {
            headers.Authorization = `Bearer ${config.openaiApiKey}`;
          }

          const toolsPayload = listTools().slice(0, 25).map((t: ToolDefinition) => ({
            type: 'function',
            function: {
              name: t.id.replace('.', '_'),
              description: t.description,
              parameters: t.parameterSchema,
            },
          }));

          const body = {
            model: config.openaiModel,
            messages: [
              {
                role: 'system',
                content:
                  'Anda adalah asisten AI resmi untuk Tenggoo Work Tool Super App. Anda membantu pengguna memproses file PDF, gambar, dan utilitas menggunakan tools yang tersedia. Balas dengan bahasa Indonesia yang ramah, ringkas, dan jelas.',
              },
              { role: 'user', content: text },
            ],
            tools: toolsPayload,
            tool_choice: 'auto',
          };

          const res = await localAiFetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });

          if (res.ok) {
            interface OpenAiResponseChoice {
              message?: {
                content?: string;
                tool_calls?: {
                  id: string;
                  function: { name: string; arguments: string };
                }[];
              };
            }
            const data = (await res.json()) as { choices?: OpenAiResponseChoice[] };
            const choice = data.choices?.[0]?.message;

            if (choice) {
              const toolCall = choice.tool_calls?.[0];
              let steps: PipelineStep[] | undefined = undefined;

              if (toolCall) {
                const originalToolId = toolCall.function.name.replace('_', '.');
                let parsedParams = {};
                try {
                  parsedParams = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
                } catch {
                  // Ignore parse errors
                }
                steps = [{ tool: originalToolId, params: parsedParams }];
              }

              const assistantMessage: ChatMessage = {
                id: assistantMsgId,
                sender: 'assistant',
                text: choice.content || 'Saya telah menyiapkan aksi pemrosesan untuk dokumen Anda:',
                timestamp: Date.now(),
                toolCall: steps
                  ? {
                      tool: steps[0].tool,
                      params: steps[0].params ?? {},
                      steps,
                      status: config.autoExecute && currentFiles.length > 0 ? 'running' : 'pending',
                      summary: `Menjalankan tool: ${steps[0].tool}`,
                    }
                  : undefined,
              };

              setMessages((prev) => [...prev, assistantMessage]);

              if (config.autoExecute && steps && currentFiles.length > 0) {
                await executePipelineSteps(steps, currentFiles, assistantMsgId);
              }

              setIsProcessing(false);
              return;
            }
          }
        } catch (err) {
          console.warn('OpenAI compatible call failed, falling back to local intent parser:', err);
        }
      }
    }

    // Provider 4 / Fallback: Built-in intelligent intent resolution (all 38 tools)
    const resolved = resolveIntentFromPrompt(text, currentFiles);
    const firstStepTool = resolved ? getTool(resolved.steps[0].tool) : undefined;
    const canRunWithoutFiles = firstStepTool?.minInputs === 0;

    if (resolved && (currentFiles.length > 0 || canRunWithoutFiles)) {
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text: `Saya memahami instruksi Anda. Rencana pengerjaan: **${resolved.explanation}**`,
        timestamp: Date.now(),
        toolCall: {
          tool: resolved.steps[0].tool,
          params: resolved.steps[0].params ?? {},
          steps: resolved.steps,
          status: config.autoExecute ? 'running' : 'pending',
          summary: `Pipeline ${resolved.steps.length} langkah`,
        },
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (config.autoExecute) {
        await executePipelineSteps(resolved.steps, currentFiles, assistantMsgId);
      }
    } else if (currentFiles.length === 0 && resolved) {
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text: `Saya memahami instruksi Anda. Rencana pengerjaan: **${resolved.explanation}**\n\nSilakan lampirkan file dokumen atau gambar yang ingin diproses melalui tombol di bawah atau seret file ke area chat.`,
        timestamp: Date.now(),
        toolCall: {
          tool: resolved.steps[0].tool,
          params: resolved.steps[0].params ?? {},
          steps: resolved.steps,
          status: 'pending',
          summary: `Rencana ${resolved.steps.length} langkah (menunggu lampiran file)`,
        },
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } else {
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text:
          'Halo! Saya dapat membantu Anda memproses dokumen secara otomatis. Anda dapat meminta saya untuk:\n' +
          '- Menggabungkan, memisah, atau mengurutkan PDF\n' +
          '- Mengompres ukuran PDF atau gambar\n' +
          '- Menambahkan watermark atau nomor halaman\n' +
          '- Mengekstrak teks & tabel dari PDF\n' +
          '- Mengonversi halaman PDF ke JPG lalu mengemasnya ke file ZIP\n\n' +
          (serverHealth === 'connected' && config.provider === 'opencode'
            ? '🟢 *OpenCode Agent aktif dan siap mengeksekusi instruksi rumit.*'
            : '💡 *Tip: Jalankan `opencode serve` untuk mengaktifkan agen cerdas tingkat lanjut, atau gunakan langsung perintah bahasa Indonesia di atas.*'),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }

    setIsProcessing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    if (window.confirm('Bersihkan seluruh riwayat percakapan?')) {
      setMessages([]);
      window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const activeModelDisplay =
    config.provider === 'opencode'
      ? config.opencodeModel || 'Default OpenCode Model'
      : config.provider === 'gemini-antigravity'
        ? config.geminiModel
        : config.provider === 'openai-compatible'
          ? config.openaiModel
          : 'Built-in Rules';

  return (
    <div className="max-w-5xl mx-auto w-full px-1 sm:px-4 py-2 flex flex-col h-[calc(100vh-8rem)] min-h-[560px]">
      {/* Top Header Bar */}
      <div className="bg-white rounded-[24px] p-4 sm:px-5 border border-black/[0.05] shadow-[0_2px_16px_rgba(0,0,0,0.03)] flex items-center justify-between gap-3 shrink-0 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[14px] bg-[#1D1D1F] text-white flex items-center justify-center shadow-2xs shrink-0">
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-semibold text-[#1D1D1F] tracking-[-0.015em] truncate">
                AI Agent &amp; Chat Studio
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-black/[0.04] text-[#6E6E73]">
                <Sparkles size={10} className="text-[#AF52DE]" />
                Smart Toolkit
              </span>
            </div>
            <p className="text-xs text-[#6E6E73] truncate">
              Instruksikan pengolahan dokumen, gambar, dan otomasi multi-langkah secara alami.
            </p>
          </div>
        </div>

        {/* Server Status Pill, Active Model, & Settings Button */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Active Model Pill */}
          <div
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/[0.04] text-[#1D1D1F] text-xs font-medium cursor-pointer hover:bg-black/[0.07] transition-colors"
            onClick={() => setIsSettingsOpen(true)}
            title="Klik untuk mengganti model AI"
          >
            <Sparkles size={12} className="text-[#AF52DE]" />
            <span className="font-mono text-[11px] truncate max-w-[150px]">
              {activeModelDisplay}
            </span>
          </div>

          <button
            type="button"
            onClick={() => checkConnection(config)}
            title="Klik untuk mengecek status koneksi AI"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              serverHealth === 'connected'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100/70'
                : serverHealth === 'checking'
                  ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                  : 'bg-[#F5F5F7] text-[#6E6E73] border-black/[0.06] hover:bg-black/[0.06]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                serverHealth === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : serverHealth === 'checking'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-[#86868B]'
              }`}
            />
            <span className="hidden md:inline">
              {config.provider === 'opencode'
                ? 'OpenCode'
                : config.provider === 'gemini-antigravity'
                  ? 'Antigravity (Gemini)'
                  : config.provider === 'openai-compatible'
                    ? 'Local LLM'
                    : 'Built-in'}
              :
            </span>
            <span className="capitalize">
              {serverHealth === 'connected'
                ? 'Terhubung'
                : serverHealth === 'checking'
                  ? 'Memeriksa...'
                  : 'Offline'}
            </span>
          </button>

          {onOpenGuide && (
            <button
              type="button"
              onClick={onOpenGuide}
              className="p-2 rounded-full border border-black/[0.06] hover:bg-black/[0.04] text-[#6E6E73] hover:text-[#0071E3] transition-colors"
              title="Panduan Penggunaan AI"
            >
              <BookOpen size={17} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full border border-black/[0.06] hover:bg-black/[0.04] text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
            title="Pengaturan AI & Model"
          >
            <Settings size={17} />
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="p-2 rounded-full border border-black/[0.06] hover:bg-rose-50 text-[#86868B] hover:text-rose-600 transition-colors"
              title="Bersihkan Percakapan"
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Main Chat Stream Container */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesAdded(e.dataTransfer.files);
          }
        }}
        className={`flex-1 bg-white rounded-[24px] border ${
          dragActive
            ? 'border-[#0071E3] ring-4 ring-[#0071E3]/15'
            : 'border-black/[0.05]'
        } shadow-[0_2px_16px_rgba(0,0,0,0.03)] overflow-y-auto p-4 sm:p-6 space-y-4 relative flex flex-col`}
      >
        {messages.length === 0 ? (
          <div className="my-auto max-w-xl mx-auto text-center space-y-5 py-6">
            <div className="w-14 h-14 mx-auto rounded-[18px] bg-[#F5F5F7] text-[#1D1D1F] flex items-center justify-center border border-black/[0.04]">
              <Bot size={28} />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                Apa yang ingin Anda kerjakan hari ini?
              </h2>
              <p className="text-xs sm:text-sm text-[#6E6E73] mt-1">
                Ketik instruksi pemrosesan dokumen dalam bahasa alami, atau klik contoh prompt di bawah ini.
              </p>
            </div>

            {/* Quick Sample Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left pt-2">
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample.title}
                  type="button"
                  onClick={() => handleSendMessage(sample.prompt)}
                  className="p-3.5 rounded-[16px] border border-black/[0.06] bg-[#F5F5F7]/50 hover:bg-[#F5F5F7] hover:border-[#0071E3]/40 text-left transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1D1D1F] group-hover:text-[#0071E3]">
                      {sample.title}
                    </span>
                    <ArrowRight
                      size={13}
                      className="text-[#86868B] group-hover:text-[#0071E3] group-hover:translate-x-0.5 transition-transform"
                    />
                  </div>
                  <p className="text-[11px] text-[#6E6E73] mt-1 line-clamp-2">{sample.prompt}</p>
                </button>
              ))}
            </div>

            {/* Info notice */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F5F5F7] border border-black/[0.04] text-[11px] text-[#6E6E73]">
              <Terminal size={12} className="text-[#1D1D1F] shrink-0" />
              <span>
                Mendukung <strong>OpenCode</strong>, <strong>Antigravity / Gemini</strong>, Ollama, dan eksekusi instan di browser.
              </span>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-full bg-[#1D1D1F] text-white flex items-center justify-center shrink-0 mt-1">
                    <Bot size={16} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-[20px] p-4 space-y-2.5 ${
                    isUser
                      ? 'bg-[#0071E3] text-white rounded-br-md shadow-xs'
                      : 'bg-[#F5F5F7] border border-black/[0.04] text-[#1D1D1F] rounded-bl-md'
                  }`}
                >
                  {/* Message Text */}
                  <div className="text-xs sm:text-sm leading-relaxed">
                    {renderFormattedText(msg.text)}
                  </div>

                  {/* Attached Files Badge */}
                  {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {msg.attachedFiles.map((f, i) => (
                        <span
                          key={`msg-f-${i}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                            isUser
                              ? 'bg-white/15 text-white border-white/20'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          <FileText size={12} />
                          <span className="truncate max-w-[180px]">{f.name}</span>
                          <span className="opacity-75">({formatByteSize(f.size)})</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tool Execution Card */}
                  {msg.toolCall && (
                    <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2 text-slate-900">
                      <div className="flex items-center justify-between text-xs font-bold border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5 text-indigo-700">
                          <Zap size={14} />
                          <span>Aksi Otomasi Dokumen</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-extrabold ${
                            msg.toolCall.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : msg.toolCall.status === 'running'
                                ? 'bg-amber-100 text-amber-800 animate-pulse'
                                : msg.toolCall.status === 'failed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {msg.toolCall.status === 'completed'
                            ? 'Selesai'
                            : msg.toolCall.status === 'running'
                              ? 'Memproses...'
                              : msg.toolCall.status === 'failed'
                                ? 'Gagal'
                                : 'Siap Dijalankan'}
                        </span>
                      </div>

                      {msg.toolCall.steps && (
                        <div className="space-y-1">
                          {msg.toolCall.steps.map((st, sIdx) => {
                            const def = getTool(st.tool);
                            return (
                              <div
                                key={`step-${sIdx}`}
                                className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100"
                              >
                                <span className="font-semibold text-slate-700 truncate">
                                  {sIdx + 1}. {def ? def.name : st.tool}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {st.tool}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {msg.toolCall.summary && (
                        <p className="text-[11px] text-emerald-700 font-medium">
                          ✓ {msg.toolCall.summary}
                        </p>
                      )}

                      {msg.toolCall.error && (
                        <p className="text-[11px] text-rose-600 font-medium">
                          ✕ Error: {msg.toolCall.error}
                        </p>
                      )}

                      {/* Manual trigger button if still pending */}
                      {msg.toolCall.status === 'pending' && msg.toolCall.steps && (
                        attachedFiles.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full mt-1 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center gap-1.5 border border-indigo-200 transition-colors"
                          >
                            <Paperclip size={13} />
                            <span>Lampirkan Dokumen / Gambar untuk Menjalankan</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (msg.toolCall?.steps) {
                                executePipelineSteps(
                                  msg.toolCall.steps,
                                  attachedFiles,
                                  msg.id,
                                );
                              }
                            }}
                            className="w-full mt-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                          >
                            <Play size={13} />
                            <span>Jalankan Sekarang ({attachedFiles.length} file terpilih)</span>
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Output Files Download Card */}
                  {msg.outputFiles && msg.outputFiles.length > 0 && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-slate-900 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          <span>Hasil Berhasil Dibuat ({msg.outputFiles.length} file)</span>
                        </span>
                        {msg.outputFiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => downloadVirtualFiles(msg.outputFiles!)}
                            className="text-[11px] underline hover:text-emerald-950 font-semibold"
                          >
                            Unduh Semua (ZIP)
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {msg.outputFiles.map((file, fIdx) => (
                          <div
                            key={`out-f-${fIdx}`}
                            className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-emerald-200 text-xs shadow-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={14} className="text-emerald-600 shrink-0" />
                              <span className="font-semibold text-slate-800 truncate">
                                {file.name}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                ({formatByteSize(file.bytes.byteLength)})
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => downloadVirtualFile(file)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm transition-colors shrink-0"
                            >
                              <Download size={12} />
                              <span>Unduh</span>
                            </button>
                          </div>
                        ))}
                      </div>

                      {onSendToPipeline && (
                        <button
                          type="button"
                          onClick={() => onSendToPipeline(msg.outputFiles!)}
                          className="w-full mt-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white py-1.5 rounded-lg border border-indigo-200 transition-colors"
                        >
                          <Workflow size={13} />
                          <span>Kirim File Ini ke Visual Pipeline Studio</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Timestamp & Copy */}
                  <div
                    className={`flex items-center justify-between text-[10px] pt-1 ${
                      isUser ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.text, index)}
                      className="hover:underline flex items-center gap-1 opacity-80 hover:opacity-100"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check size={10} /> Disalin
                        </>
                      ) : (
                        <>
                          <Copy size={10} /> Salin
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-1">
                    <span className="text-xs font-extrabold">U</span>
                  </div>
                )}
              </div>
            );
          })
        )}

        {isProcessing && (
          <div className="flex gap-3 justify-start animate-in fade-in duration-200">
            <div className="w-8 h-8 rounded-full bg-[#1D1D1F] text-white flex items-center justify-center shrink-0 mt-1">
              <Bot size={16} />
            </div>
            <div className="bg-[#F5F5F7] border border-black/[0.04] rounded-[20px] rounded-bl-md p-3.5 flex items-center gap-2 text-xs text-[#6E6E73]">
              <Loader2 size={15} className="animate-spin text-[#0071E3]" />
              <span>AI Agent sedang berpikir dan merancang tugas...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box & Attachment Tray */}
      <div className="mt-3 bg-white rounded-[22px] p-3 border border-black/[0.05] shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-2 shrink-0">
        {/* Attached Files Tray */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 border-b border-black/[0.05]">
            {attachedFiles.map((file, i) => (
              <div
                key={`attach-${i}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 text-xs font-medium text-[#0071E3]"
              >
                <FileText size={13} className="text-[#0071E3]" />
                <span className="truncate max-w-[200px]">{file.name}</span>
                <span className="text-[10px] opacity-80">
                  ({formatByteSize(file.bytes.byteLength)})
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachedFile(i)}
                  className="hover:bg-[#0071E3]/15 p-0.5 rounded-full"
                  title="Hapus lampiran"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea & Send Button */}
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files) handleFilesAdded(e.target.files);
              e.target.value = '';
            }}
            multiple
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-full border border-black/[0.08] hover:bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F] transition-colors shrink-0"
            title="Lampirkan File PDF / Gambar"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik instruksi pemrosesan dokumen... (Tekan Enter untuk kirim, Shift+Enter untuk baris baru)"
            rows={1}
            className="flex-1 max-h-32 min-h-[42px] py-2.5 px-4 text-xs sm:text-sm bg-[#F5F5F7]/80 hover:bg-[#F5F5F7] focus:bg-white rounded-[20px] border border-black/[0.06] focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/15 outline-none resize-none transition-all text-[#1D1D1F] placeholder:text-[#86868B]"
          />

          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={(!inputPrompt.trim() && attachedFiles.length === 0) || isProcessing}
            className="p-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs transition-all shrink-0"
            title="Kirim pesan"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pengaturan AI Agent"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="bg-white/95 backdrop-blur-2xl rounded-[24px] max-w-xl w-full p-5 sm:p-6 border border-black/[0.08] shadow-[0_24px_64px_rgba(0,0,0,0.22)] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Settings size={19} className="text-[#0071E3]" />
                <h3 className="text-base font-semibold text-[#1D1D1F] tracking-[-0.01em]">
                  Konfigurasi AI Agent &amp; Model
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-[#86868B] hover:text-[#1D1D1F] p-1 rounded-full hover:bg-black/[0.05]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              {/* Provider Selection (4 Options — Built-in Instant First) */}
              <div>
                <label className="block font-bold text-slate-800 mb-2">Pilih Engine / Backend AI:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, provider: 'offline' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      config.provider === 'offline'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Zap size={14} className="text-emerald-600" />
                      <span className="text-xs">Built-in</span>
                    </div>
                    <p className="text-[10px] font-normal text-slate-500 mt-1">
                      38 Alat (Tanpa Setup)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, provider: 'gemini-antigravity' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      config.provider === 'gemini-antigravity'
                        ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-blue-600" />
                      <span className="text-xs">Antigravity</span>
                    </div>
                    <p className="text-[10px] font-normal text-slate-500 mt-1">
                      Google Gemini
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, provider: 'opencode' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      config.provider === 'opencode'
                        ? 'bg-purple-50 border-purple-400 text-purple-900 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Terminal size={14} className="text-purple-600" />
                      <span className="text-xs">OpenCode</span>
                    </div>
                    <p className="text-[10px] font-normal text-slate-500 mt-1">
                      {isTauriDesktop() ? 'Auto-Bridge Desktop' : 'Agent Lokal'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, provider: 'openai-compatible' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      config.provider === 'openai-compatible'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-bold shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Bot size={14} className="text-indigo-600" />
                      <span className="text-xs">Local LLM</span>
                    </div>
                    <p className="text-[10px] font-normal text-slate-500 mt-1">
                      Ollama / LM Studio
                    </p>
                  </button>
                </div>
              </div>

              {/* 1. OpenCode Settings */}
              {config.provider === 'opencode' && (
                <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200/80 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        URL Server OpenCode:
                      </label>
                      <input
                        type="text"
                        value={config.opencodeUrl}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, opencodeUrl: e.target.value.trim() }))
                        }
                        placeholder="http://127.0.0.1:4096"
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Password (Opsional):
                      </label>
                      <input
                        type="password"
                        value={config.opencodePassword || ''}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, opencodePassword: e.target.value }))
                        }
                        placeholder="Kosongkan jika tanpa password"
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* OpenCode Model Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Model OpenCode (Pilih / Ketik):
                      </label>
                      <button
                        type="button"
                        onClick={() => loadModelsForProvider(config)}
                        className="text-[11px] text-purple-700 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw size={11} className={isFetchingModels ? 'animate-spin' : ''} />
                        <span>Muat Ulang Model</span>
                      </button>
                    </div>

                    {detectedModels.length > 0 ? (
                      <select
                        value={config.opencodeModel || ''}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, opencodeModel: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                      >
                        <option value="">(Gunakan Model Default OpenCode)</option>
                        {detectedModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={config.opencodeModel || ''}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, opencodeModel: e.target.value.trim() }))
                        }
                        placeholder="Contoh: claude-3-5-sonnet, gpt-4o, atau biarkan kosong"
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                      />
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">
                      {detectedModels.length > 0
                        ? `Terdeteksi ${detectedModels.length} model aktif dari OpenCode.`
                        : 'Jalankan opencode serve untuk mendeteksi daftar model secara otomatis.'}
                    </p>
                  </div>

                  <div className="text-[11px] text-purple-900 bg-white p-2.5 rounded-lg border border-purple-200 space-y-1.5">
                    {isTauriDesktop() ? (
                      <>
                        <p className="font-bold">🟢 Mode Desktop (Native Bridge Bebas-CORS Aktif):</p>
                        <p className="text-[10px] text-slate-600">
                          Aplikasi Desktop otomatis menyambungkan dan menyalakan OpenCode di latar belakang tanpa batasan CORS browser. Klik <strong>Uji Koneksi</strong> untuk menyalakan otomatis.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold">💡 Tips Pengguna Umum vs Developer:</p>
                        <p className="text-[10px] text-slate-600">
                          Untuk pemakaian langsung tanpa terminal, pilih tab <strong>Built-in (38 Alat Tanpa Setup)</strong> atau{' '}
                          <a
                            href="https://github.com/alafgani1000/worktools/releases/latest"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0066CC] font-semibold underline"
                          >
                            unduh Work Tools versi Desktop
                          </a>{' '}
                          (bebas konfigurasi CORS). Jika ingin menghubungkan OpenCode ke browser ini, jalankan:
                        </p>
                        <code className="block bg-slate-900 text-white p-2 rounded text-[10px] select-all font-mono">
                          {buildOpenCodeServeCommand(config.opencodeUrl)}
                        </code>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Google Gemini / Antigravity Settings */}
              {config.provider === 'gemini-antigravity' && (
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pilihan Model Antigravity (Gemini):
                    </label>
                    <select
                      value={config.geminiModel}
                      onChange={(e) => setConfig((c) => ({ ...c, geminiModel: e.target.value }))}
                      className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                    >
                      {GEMINI_ANTIGRAVITY_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Google Gemini API Key:
                    </label>
                    <input
                      type="password"
                      value={config.geminiApiKey || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, geminiApiKey: e.target.value.trim() }))
                      }
                      placeholder="AIzaSy..."
                      className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      {config.rememberSecrets
                        ? 'Kunci API disimpan persisten di Local Storage browser Anda dan hanya dikirim langsung ke endpoint Google Gemini.'
                        : 'Mode aman aktif: API key hanya disimpan sementara di Session Storage dan otomatis terhapus saat tab ditutup.'}
                    </p>
                  </div>

                  <div className="text-[11px] text-blue-900 bg-white p-2.5 rounded-lg border border-blue-200">
                    <p className="font-bold">✨ Integrasi Antigravity:</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      Model-model di atas adalah mesin AI resmi yang sama yang digunakan oleh Google Antigravity. Anda juga dapat mendaftarkan Tenggoo sebagai server MCP di Antigravity IDE.
                    </p>
                  </div>
                </div>
              )}

              {/* 3. Local LLM (Ollama, LM Studio) Settings */}
              {config.provider === 'openai-compatible' && (
                <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Base URL Endpoint:
                    </label>
                    <input
                      type="text"
                      value={config.openaiUrl}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, openaiUrl: e.target.value.trim() }))
                      }
                      placeholder="http://127.0.0.1:11434/v1"
                      className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">Nama Model:</label>
                      <button
                        type="button"
                        onClick={() => loadModelsForProvider(config)}
                        className="text-[11px] text-indigo-700 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw size={11} className={isFetchingModels ? 'animate-spin' : ''} />
                        <span>Cari Model</span>
                      </button>
                    </div>

                    {detectedModels.length > 0 ? (
                      <select
                        value={config.openaiModel}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, openaiModel: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                      >
                        {detectedModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={config.openaiModel}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, openaiModel: e.target.value.trim() }))
                        }
                        placeholder="qwen2.5-coder:7b atau llama3.2"
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-mono"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 4. Built-in Offline Info */}
              {config.provider === 'offline' && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                  <p className="font-bold">⚡ Mode Built-in Pintar (100% Offline)</p>
                  <p className="text-[11px] text-emerald-800">
                    Memproses instruksi bahasa Indonesia dan bahasa Inggris secara langsung tanpa memerlukan server eksternal atau koneksi internet.
                  </p>
                </div>
              )}

              {/* Auto Execute Toggle */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.05]">
                <div>
                  <span className="font-semibold text-[#1D1D1F]">Auto-Execute Tools</span>
                  <p className="text-[11px] text-[#6E6E73]">
                    Otomatis menjalankan aksi pemrosesan begitu AI merancang langkahnya.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoExecute}
                  onChange={(e) => setConfig((c) => ({ ...c, autoExecute: e.target.checked }))}
                  className="w-4 h-4 accent-[#0071E3] rounded cursor-pointer shrink-0 ml-3"
                />
              </div>

              {/* Persistent API Key Opt-in Toggle */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.05]">
                <div>
                  <span className="font-semibold text-[#1D1D1F]">Simpan API Key Permanen</span>
                  <p className="text-[11px] text-[#6E6E73]">
                    Jika nonaktif, API key &amp; password hanya disimpan di sessionStorage dan otomatis terhapus saat tab ditutup.
                  </p>
                </div>
                <input
                  type="checkbox"
                  aria-label="Simpan API Key Permanen"
                  checked={config.rememberSecrets}
                  onChange={(e) => setConfig((c) => ({ ...c, rememberSecrets: e.target.checked }))}
                  className="w-4 h-4 accent-[#0071E3] rounded cursor-pointer shrink-0 ml-3"
                />
              </div>

              {/* Connection Test Banner */}
              {healthError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{healthError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/[0.06]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => checkConnection(config)}
                  className="px-4 py-2 rounded-full border border-black/[0.08] bg-[#F5F5F7] hover:bg-black/[0.06] text-xs font-medium text-[#1D1D1F] flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={serverHealth === 'checking' ? 'animate-spin' : ''} />
                  <span>Uji Koneksi</span>
                </button>

                <button
                  type="button"
                  onClick={clearStoredCredentials}
                  className="px-3.5 py-2 rounded-full border border-rose-200/80 bg-rose-50/70 hover:bg-rose-100/80 text-xs font-medium text-[#FF3B30] flex items-center gap-1.5 transition-colors"
                  title="Hapus semua API key dan password yang tersimpan di browser"
                >
                  <Trash2 size={13} />
                  <span>Hapus Kredensial</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  saveConfig(config);
                  setIsSettingsOpen(false);
                }}
                className="px-5 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium shadow-2xs transition-colors"
              >
                Simpan &amp; Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
