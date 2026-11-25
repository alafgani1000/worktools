import { getTool, listTools } from '../core/registry.ts';
import type { PipelineStep, ToolDefinition, VirtualFile } from '../core/types.ts';

export type MediaKind = 'unknown' | 'pdf' | 'image' | 'mixed' | 'other';

export interface ResolvedIntent {
  steps: PipelineStep[];
  explanation: string;
}

export interface AiFunctionToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface RawAiToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

function inferMediaFromInputs(inputFiles: VirtualFile[]): MediaKind {
  if (inputFiles.length === 0) return 'unknown';
  const hasPdf = inputFiles.some((f) => f.name.toLowerCase().endsWith('.pdf'));
  const hasImg = inputFiles.some((f) => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
  if (hasPdf && hasImg) return 'mixed';
  if (hasPdf) return 'pdf';
  if (hasImg) return 'image';
  return 'other';
}

function advanceMediaKind(prev: MediaKind, toolId: string): MediaKind {
  if (
    toolId === 'pdf.from_images' ||
    toolId === 'util.md_to_pdf' ||
    toolId === 'util.table_to_pdf' ||
    (toolId.startsWith('pdf.') &&
      toolId !== 'pdf.to_images' &&
      toolId !== 'pdf.extract_text' &&
      toolId !== 'pdf.extract_tables' &&
      toolId !== 'pdf.diff_text' &&
      toolId !== 'pdf.form_inspect' &&
      toolId !== 'pdf.metadata')
  ) {
    return 'pdf';
  }
  if (
    toolId === 'pdf.to_images' ||
    toolId === 'util.qr_generate' ||
    (toolId.startsWith('image.') && toolId !== 'image.info')
  ) {
    return 'image';
  }
  if (toolId === 'util.zip_pack' || toolId === 'util.hash_checksum') {
    return 'other';
  }
  if (toolId === 'util.zip_unpack') {
    return 'unknown';
  }
  return prev;
}

function extractClause(prompt: string, anchorPattern: RegExp): string {
  const lower = prompt.toLowerCase();
  const clauses = lower.split(/[,;.\n]|\b(?:lalu|kemudian)\b/);
  return clauses.find((clause) => anchorPattern.test(clause)) ?? lower;
}

function extractWatermarkText(prompt: string, quotedText?: string): string {
  const p = extractClause(prompt, /\b(?:watermark|cap|stempel)\b/);
  if (quotedText) return quotedText;
  if (p.includes('rahasia') || p.includes('confidential')) return 'RAHASIA';
  if (p.includes('draft')) return 'DRAFT';
  if (p.includes('salinan') || p.includes('copy')) return 'SALINAN';
  if (p.includes('internal')) return 'INTERNAL';
  return 'CONFIDENTIAL';
}

function extractWatermarkPosition(
  prompt: string,
  target: 'pdf' | 'image',
): 'center-diagonal' | 'center' | 'top' | 'bottom' | 'tiled' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' {
  const p = extractClause(prompt, /\b(?:watermark|cap|stempel)\b/);
  if (p.includes('grid') || p.includes('penuh') || p.includes('ubin') || p.includes('tiled')) {
    return 'tiled';
  }
  if (target === 'image') {
    if (p.includes('kiri atas') || p.includes('atas kiri')) return 'top-left';
    if (p.includes('kanan atas') || p.includes('atas kanan')) return 'top-right';
    if (p.includes('kiri bawah') || p.includes('bawah kiri')) return 'bottom-left';
    if (p.includes('kanan bawah') || p.includes('bawah kanan')) return 'bottom-right';
    if (p.includes('miring') || p.includes('diagonal')) return 'center-diagonal';
    if (p.includes('tengah')) return 'center';
    return 'bottom-right';
  }
  if (p.includes('atas') || p.includes('header')) return 'top';
  if (p.includes('bawah') || p.includes('footer')) return 'bottom';
  if (p.includes('lurus') || (p.includes('tengah') && !p.includes('miring') && !p.includes('diagonal'))) {
    return 'center';
  }
  return 'center-diagonal';
}

function extractPageNumberOptions(prompt: string): {
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  format: 'page-of-total' | 'n-of-total' | 'page-n' | 'hyphen-n' | 'n-only';
} {
  const p = extractClause(prompt, /(?:nomor halaman|penomoran|page number|halaman di bawah)/);
  const isTop = (p.includes('atas') || p.includes('header')) && !p.includes('bawah');
  let position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left' =
    isTop ? 'top-center' : 'bottom-center';

  if (p.includes('kanan')) {
    position = isTop ? 'top-right' : 'bottom-right';
  } else if (p.includes('kiri')) {
    position = isTop ? 'top-left' : 'bottom-left';
  }

  let format: 'page-of-total' | 'n-of-total' | 'page-n' | 'hyphen-n' | 'n-only' = 'page-of-total';
  if (p.includes('n/total') || p.includes('1/')) format = 'n-of-total';
  else if (p.includes('angka saja') || p.includes('nomor saja')) format = 'n-only';
  else if (p.includes('strip') || p.includes('- 1 -')) format = 'hyphen-n';

  return { position, format };
}

function extractCompressionProfile(prompt: string): {
  pdfQuality: 'low' | 'medium' | 'high';
  imageQuality: number;
} {
  const p = prompt.toLowerCase();
  if (p.includes('ekstrem') || p.includes('kuat') || p.includes('maksimal') || p.includes('paling kecil')) {
    return { pdfQuality: 'low', imageQuality: 60 };
  }
  if (p.includes('ringan') || p.includes('tajam') || p.includes('halus') || p.includes('kualitas tinggi')) {
    return { pdfQuality: 'high', imageQuality: 90 };
  }
  return { pdfQuality: 'medium', imageQuality: 78 };
}

/**
 * Comprehensive 38-tool offline natural-language intent parser with parameter extraction
 * and media-type tracking across multi-step workflows.
 */
export function resolveIntentFromPrompt(
  prompt: string,
  inputFiles: VirtualFile[] = [],
): ResolvedIntent | null {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return null;

  const p = trimmedPrompt.toLowerCase();
  const steps: PipelineStep[] = [];
  const explanations: string[] = [];

  let currentMedia: MediaKind = inferMediaFromInputs(inputFiles);
  const hasZip = inputFiles.some((f) => /\.zip$/i.test(f.name));
  const matchQuote = trimmedPrompt.match(/['"]([^'"]+)['"]/);
  const quotedText = matchQuote?.[1]?.trim();

  const pushStep = (tool: string, params: Record<string, unknown>, explanation: string) => {
    steps.push({ tool, params });
    explanations.push(explanation);
    currentMedia = advanceMediaKind(currentMedia, tool);
  };

  // 1. Unpack ZIP
  if (
    hasZip ||
    p.includes('ekstrak zip') ||
    p.includes('bongkar zip') ||
    p.includes('unzip') ||
    p.includes('buka zip')
  ) {
    pushStep('util.zip_unpack', {}, 'Mengekstrak isi file dari arsip ZIP');
  }

  // 2. Generator tools (0-input tools)
  if (
    (p.includes('qr') || p.includes('qrcode') || p.includes('barcode')) &&
    !p.includes('tempel') &&
    !p.includes('stamp')
  ) {
    let qrText = quotedText || 'https://worktools.my.id';
    const urlMatch = trimmedPrompt.match(/https?:\/\/[^\s'"]+/i);
    if (urlMatch) qrText = urlMatch[0];
    pushStep('util.qr_generate', { text: qrText, size: 280 }, `Membuat QR Code untuk '${qrText}'`);
  }

  if (
    p.includes('markdown ke pdf') ||
    p.includes('teks ke pdf') ||
    p.includes('tulisan ke pdf') ||
    p.includes('buat pdf dari teks') ||
    p.includes('md to pdf')
  ) {
    const colonIdx = trimmedPrompt.indexOf(':');
    const afterColon = colonIdx !== -1 ? trimmedPrompt.slice(colonIdx + 1).trim() : '';
    const cleanedMdBody = afterColon
      .replace(
        /\s*(?:,|;|\blalu\b|\bkemudian\b)\s*(?:tambahkan|beri|sensor|redact|kompres|compress|putar|ekstrak|bungkus|kemas|pack|watermark|nomor halaman|ubah|jadikan).*$/i,
        '',
      )
      .trim();
    const mdBody =
      quotedText || cleanedMdBody || `# Dokumen Baru\n\n${trimmedPrompt}`;
    pushStep(
      'util.md_to_pdf',
      { markdown: mdBody, pageSize: 'A4' },
      'Merender teks / Markdown menjadi dokumen PDF A4',
    );
  }

  if (
    p.includes('csv ke pdf') ||
    p.includes('json ke pdf') ||
    p.includes('tabel ke pdf') ||
    p.includes('table to pdf')
  ) {
    pushStep(
      'util.table_to_pdf',
      { title: quotedText || 'Laporan Data Tabel', pageSize: 'A4' },
      'Mengubah data tabel CSV/JSON menjadi laporan PDF',
    );
  }

  // 3. Scan Enhancer & Photo Grid Sheet (can precede PDF conversion)
  if (
    p.includes('perjelas scan') ||
    p.includes('rapikan scan') ||
    p.includes('scan enhance') ||
    p.includes('hitam putih') ||
    p.includes('putihkan latar') ||
    p.includes('tajamkan scan')
  ) {
    const mode = p.includes('hitam putih')
      ? 'bw-threshold'
      : p.includes('abu') || p.includes('grayscale')
        ? 'grayscale-contrast'
        : 'whiten-bg';
    const contrast = mode === 'bw-threshold' ? 60 : 45;
    pushStep(
      'image.scan_enhance',
      { mode, contrast },
      `Memperjelas dokumen hasil foto/scan (${mode})`,
    );
  }

  if (
    p.includes('kolase') ||
    p.includes('grid') ||
    p.includes('pasfoto') ||
    p.includes('pas foto') ||
    p.includes('lembar ktp') ||
    p.includes('ktp sheet')
  ) {
    if (!p.includes('watermark') || p.includes('ktp') || p.includes('kolase') || p.includes('sheet')) {
      const colMatch = p.match(/(\d)\s*(?:kolom|x\s*\d)/i);
      const columns = colMatch ? Math.max(1, Math.min(6, Number(colMatch[1]))) : 2;
      pushStep(
        'image.grid_sheet',
        { columns, rows: 2, pageSize: 'A4' },
        `Menyusun gambar ke lembar kisi-kisi ${columns} kolom A4`,
      );
    }
  }

  // 4. Image Resize / Crop / Rotate / EXIF before potential PDF assembly
  if (p.includes('resize') || p.includes('ubah ukuran gambar') || p.includes('resolusi')) {
    const dimMatch = p.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/i) || p.match(/\b(\d{3,4})\s*px\b/i);
    const width = dimMatch ? Number(dimMatch[1]) : 1280;
    const height = dimMatch?.[2] ? Number(dimMatch[2]) : undefined;
    pushStep(
      'image.resize',
      { width, ...(height ? { height } : {}), fit: 'inside' },
      `Mengubah dimensi gambar ke lebar ${width}px`,
    );
  }

  if (
    !p.includes('margin') &&
    (p.includes('potong') || p.includes('crop')) &&
    (currentMedia === 'image' || p.includes('gambar') || p.includes('foto') || /\b(1:1|4:3|4:6|16:9|3:4)\b/.test(p))
  ) {
    const ratioMatch = p.match(/\b(1:1|4:3|3:4|4:6|16:9)\b/);
    const aspectRatio = ratioMatch ? ratioMatch[1] : '1:1';
    pushStep('image.crop', { aspectRatio }, `Memotong gambar dengan rasio ${aspectRatio}`);
  }

  if (p.includes('exif') || (p.includes('metadata') && (currentMedia === 'image' || p.includes('foto') || p.includes('gambar')))) {
    pushStep('image.strip_metadata', {}, 'Menghapus metadata EXIF & lokasi GPS dari foto');
  } else if (p.includes('metadata')) {
    const isStrip =
      p.includes('hapus') || p.includes('bersih') || p.includes('strip') || p.includes('clear');
    pushStep(
      'pdf.metadata',
      { action: isStrip ? 'strip' : 'inspect' },
      isStrip ? 'Menghapus metadata tersembunyi dari PDF' : 'Memeriksa informasi metadata PDF',
    );
  }

  // 5. Merge PDF or Images -> PDF
  if (
    p.includes('gabung') ||
    p.includes('merge') ||
    p.includes('satukan') ||
    p.includes('gambar ke pdf') ||
    p.includes('foto ke pdf') ||
    p.includes('image to pdf') ||
    p.includes('jadi pdf') ||
    p.includes('ke pdf')
  ) {
    const wantImgToPdf =
      p.includes('gambar ke pdf') ||
      p.includes('foto ke pdf') ||
      p.includes('image to pdf') ||
      currentMedia === 'image';
    if (wantImgToPdf && !steps.some((s) => s.tool === 'util.md_to_pdf' || s.tool === 'util.table_to_pdf')) {
      pushStep('pdf.from_images', { pageSize: 'A4', margin: 20 }, 'Mengonversi gambar menjadi dokumen PDF A4');
    } else if (!steps.some((s) => s.tool === 'util.md_to_pdf' || s.tool === 'util.table_to_pdf')) {
      pushStep('pdf.merge', {}, 'Menggabungkan file-file PDF menjadi satu dokumen');
    }
  }

  // 6. Split PDF / Reorder / Rotate / Crop Margins / N-up
  if (p.includes('pisah') || p.includes('pecah') || p.includes('split') || p.includes('ambil halaman')) {
    const rangeMatch = trimmedPrompt.match(/halaman\s+([0-9,\-\s]+)/i) || trimmedPrompt.match(/\b(\d+\s*-\s*\d+)\b/);
    const pageRange = rangeMatch?.[1]?.trim();
    if (pageRange) {
      pushStep('pdf.split', { mode: 'range', pageRange }, `Mengekstrak halaman PDF (${pageRange})`);
    } else {
      pushStep('pdf.split', { mode: 'burst' }, 'Memecah setiap halaman PDF menjadi file terpisah');
    }
  }

  if (p.includes('urutkan') || p.includes('reorder')) {
    const orderMatch = trimmedPrompt.match(/(?:urutan|reorder)\s+([0-9,\s]+)/i);
    if (orderMatch?.[1]) {
      const nums = orderMatch[1]
        .split(',')
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n >= 1);
      if (nums.length > 0) {
        pushStep('pdf.reorder', { pageOrder: nums }, `Mengatur ulang urutan halaman PDF (${nums.join(', ')})`);
      }
    }
  }

  if (p.includes('putar') || p.includes('rotasi') || p.includes('rotate') || p.includes('balik foto')) {
    const angleMatch = p.match(/\b(90|180|270)\b/);
    const angle = angleMatch ? (Number(angleMatch[1]) as 90 | 180 | 270) : 90;
    if (currentMedia === 'image') {
      const flipH = p.includes('horizontal') || p.includes('cermin') || p.includes('mirror');
      const flipV = p.includes('vertikal') || p.includes('vertical');
      pushStep(
        'image.rotate_flip',
        { angle, flipHorizontal: flipH, flipVertical: flipV },
        `Memutar gambar ${angle}°`,
      );
    } else {
      pushStep('pdf.rotate', { angle }, `Memutar halaman PDF sebesar ${angle}°`);
    }
  }

  if (p.includes('potong margin') || p.includes('rapikan pinggir') || p.includes('crop margin')) {
    pushStep('pdf.crop_margins', { margin: 20 }, 'Memotong margin kosong di tepi halaman PDF');
  }

  if (p.includes('n-up') || p.includes('nup') || p.includes('per lembar') || p.includes('cetak hemat')) {
    const nMatch = p.match(/\b([2469])\s*halaman/i);
    const pagesPerSheet = nMatch ? Number(nMatch[1]) : 2;
    pushStep('pdf.nup', { pagesPerSheet }, `Menyusun ${pagesPerSheet} halaman PDF per lembar`);
  }

  // 7. Auto Redact PII / Text
  if (
    p.includes('sensor') ||
    p.includes('redact') ||
    p.includes('samarkan') ||
    p.includes('sembunyikan nik') ||
    p.includes('hapus nik')
  ) {
    if (p.includes('kotak') || p.includes('area')) {
      pushStep('pdf.redact', { burnIn: true }, 'Menyensor area halaman PDF secara permanen');
    } else {
      const explicitRedactQuote = trimmedPrompt
        .match(/\b(?:sensor|redact|samarkan)\s+(?:kata\s+|teks\s+)?['"]([^'"]+)['"]/i)?.[1]
        ?.trim();
      const hasPhoneKeyword =
        p.includes('no hp') ||
        p.includes('no. hp') ||
        p.includes('telepon') ||
        p.includes('whatsapp') ||
        /\bhp\b/.test(p);
      const hasExplicitPii =
        p.includes('nik') || p.includes('email') || hasPhoneKeyword || p.includes('pii');

      let presetPattern: 'none' | 'nik' | 'email' | 'phone' | 'all_pii' = 'all_pii';
      if (p.includes('nik') && !p.includes('email') && !hasPhoneKeyword) presetPattern = 'nik';
      else if (p.includes('email') && !p.includes('nik') && !hasPhoneKeyword) presetPattern = 'email';
      else if (hasPhoneKeyword && !p.includes('nik') && !p.includes('email')) {
        presetPattern = 'phone';
      }

      const customRedactQuery = explicitRedactQuote ?? (!hasExplicitPii ? quotedText : undefined);

      pushStep(
        'pdf.redact_text',
        {
          presetPattern: customRedactQuery ? 'none' : presetPattern,
          ...(customRedactQuery ? { query: customRedactQuery } : {}),
          burnIn: true,
        },
        customRedactQuery
          ? `Menyensor kata '${customRedactQuery}' secara permanen (burn-in)`
          : `Menyensor data sensitif (${presetPattern === 'all_pii' ? 'NIK, Email, Telepon' : presetPattern.toUpperCase()}) secara permanen`,
      );
    }
  }

  // 8. Unlock PDF
  if (p.includes('buka kunci') || p.includes('unlock') || p.includes('hapus password')) {
    const passMatch = trimmedPrompt.match(/password\s*[:=]?\s*([^\s'"]+)/i);
    const password = quotedText || passMatch?.[1] || '';
    pushStep('pdf.unlock', { password }, 'Membuka kunci proteksi password PDF');
  }

  // 9. AcroForm
  if (p.includes('formulir') || p.includes('acroform') || p.includes('form pdf')) {
    if (p.includes('isi') || p.includes('fill') || p.includes('flatten') || p.includes('ratakan')) {
      pushStep('pdf.form_fill', { flatten: true }, 'Mengisi dan meratakan (flatten) formulir PDF');
    } else {
      pushStep('pdf.form_inspect', {}, 'Mendeteksi daftar field formulir interaktif PDF');
    }
  }

  // 10. Diff
  if (p.includes('bandingkan') || p.includes('perbedaan') || p.includes('diff')) {
    if (currentMedia === 'image') {
      pushStep('image.diff', {}, 'Membandingkan perbedaan visual 2 gambar dengan heatmap');
    } else {
      pushStep('pdf.diff_text', {}, 'Membandingkan perbedaan isi teks antara 2 dokumen PDF');
    }
  }

  // 11. Stamp image / QR onto PDF
  if (
    (p.includes('tempel') || p.includes('stamp') || p.includes('tanda tangan') || p.includes('logo')) &&
    (currentMedia === 'pdf' || currentMedia === 'mixed' || p.includes('pdf'))
  ) {
    if (p.includes('qr')) {
      const urlMatch = trimmedPrompt.match(/https?:\/\/[^\s'"]+/i);
      const qrText = quotedText || urlMatch?.[0] || 'https://worktools.my.id';
      pushStep('util.qr_generate', { text: qrText, size: 220 }, `Membuat QR Code '${qrText}'`);
    }
    pushStep('pdf.stamp_image', { position: 'bottom-right', width: 96, margin: 24 }, 'Menempelkan gambar/QR stamp ke PDF');
  }

  // 12. Watermark (PDF or Image)
  if (p.includes('watermark') || p.includes('cap ') || p.includes('beri cap') || p.includes('stempel teks')) {
    const explicitWatermarkQuote = trimmedPrompt
      .match(/\b(?:watermark|cap|stempel(?:\s+teks)?)\s+(?:teks\s+|tulisan\s+)?['"]([^'"]+)['"]/i)?.[1]
      ?.trim();
    const text = extractWatermarkText(trimmedPrompt, explicitWatermarkQuote ?? quotedText);
    if (currentMedia === 'image') {
      const position = extractWatermarkPosition(trimmedPrompt, 'image');
      pushStep(
        'image.watermark',
        { text, opacity: 0.45, position },
        `Menambahkan watermark '${text}' pada gambar`,
      );
    } else {
      const position = extractWatermarkPosition(trimmedPrompt, 'pdf');
      pushStep(
        'pdf.watermark',
        { text, opacity: 0.2, position },
        `Menambahkan watermark '${text}' (${position}) pada PDF`,
      );
    }
  }

  // 13. Page numbering
  if (p.includes('nomor halaman') || p.includes('penomoran') || p.includes('page number') || p.includes('halaman di bawah')) {
    const opts = extractPageNumberOptions(trimmedPrompt);
    pushStep(
      'pdf.page_numbers',
      opts,
      `Menambahkan nomor halaman (${opts.position}) ke PDF`,
    );
  }

  // 14. Convert PDF to images OR Image format conversion
  if (p.includes('pdf ke gambar') || p.includes('pdf ke foto') || p.includes('ekstrak gambar') || p.includes('to image')) {
    const format = p.includes('webp') ? 'webp' : p.includes('png') ? 'png' : 'jpeg';
    pushStep(
      'pdf.to_images',
      { format, scale: 2, quality: 90 },
      `Merender halaman PDF menjadi gambar ${format.toUpperCase()}`,
    );
  } else if (
    p.includes('ke webp') ||
    p.includes('jadi webp') ||
    p.includes('ke png') ||
    p.includes('jadi png') ||
    p.includes('ke jpg') ||
    p.includes('jadi jpg') ||
    p.includes('ke jpeg') ||
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
    if (currentMedia === 'pdf' && targetFormat !== 'ico') {
      pushStep(
        'pdf.to_images',
        { format: targetFormat, scale: 2, quality: 90 },
        `Mengonversi halaman PDF ke gambar ${targetFormat.toUpperCase()}`,
      );
    } else {
      pushStep(
        'image.convert',
        { targetFormat, quality: 90 },
        `Mengonversi format gambar menjadi ${targetFormat.toUpperCase()}`,
      );
    }
  }

  // 15. Image Info
  if (p.includes('info gambar') || p.includes('cek dimensi') || p.includes('detail foto')) {
    pushStep('image.info', {}, 'Memeriksa dimensi, format, dan ukuran file gambar');
  }

  // 16. Compress PDF or Image (aware of media transitions earlier in prompt!)
  if (p.includes('kompres') || p.includes('compress') || p.includes('perkecil') || p.includes('hemat')) {
    const profile = extractCompressionProfile(trimmedPrompt);
    if (currentMedia === 'image') {
      pushStep(
        'image.compress',
        { quality: profile.imageQuality, format: 'jpeg' },
        `Mengompresi gambar (kualitas ${profile.imageQuality}%)`,
      );
    } else {
      pushStep(
        'pdf.compress',
        { quality: profile.pdfQuality },
        `Mengompresi PDF (profil ${profile.pdfQuality})`,
      );
    }
  }

  // 17. Extract text & tables
  if (p.includes('ekstrak teks') || p.includes('extract text') || p.includes('ambil teks') || p.includes('baca teks')) {
    const format = p.includes('json') ? 'json' : p.includes('txt') ? 'txt' : 'markdown';
    pushStep('pdf.extract_text', { format }, `Mengekstrak teks PDF ke format ${format}`);
  }

  if ((p.includes('tabel') || p.includes('table')) && !steps.some((s) => s.tool === 'util.table_to_pdf')) {
    pushStep('pdf.extract_tables', {}, 'Mendeteksi dan mengekstrak struktur tabel dari PDF');
  }

  // 18. Hash / Checksum
  if (p.includes('sha256') || p.includes('sha-256') || p.includes('sha512') || p.includes('sha1') || p.includes('checksum') || p.includes('hash')) {
    const algorithm = p.includes('512') ? 'SHA-512' : p.includes('sha1') || p.includes('sha-1') ? 'SHA-1' : 'SHA-256';
    pushStep('util.hash_checksum', { algorithm }, `Menghitung checksum ${algorithm} file`);
  }

  // 19. Pack into ZIP archive
  if ((p.includes('zip') || p.includes('arsip')) && !steps.some((s) => s.tool === 'util.zip_unpack')) {
    const zipMatch = trimmedPrompt.match(/\b([a-z0-9_-]+\.zip)\b/i);
    const archiveName = zipMatch?.[1] || 'hasil_worktools.zip';
    pushStep('util.zip_pack', { archiveName }, `Mengemas seluruh file hasil ke arsip ${archiveName}`);
  }

  if (steps.length === 0) return null;

  return {
    steps,
    explanation: `${explanations.join(' lalu ')}.`,
  };
}

/**
 * Exposes all 38 WorkTools functions plus `tenggoo_pipeline_run` for Gemini / OpenAI function calling.
 */
export function buildAiFunctionTools(): AiFunctionToolSpec[] {
  const toolSpecs: AiFunctionToolSpec[] = listTools().map((t: ToolDefinition) => ({
    type: 'function',
    function: {
      name: t.mcpName,
      description: `[${t.id}] ${t.description}`,
      parameters: t.parameterSchema as unknown as Record<string, unknown>,
    },
  }));

  toolSpecs.push({
    type: 'function',
    function: {
      name: 'tenggoo_pipeline_run',
      description:
        'Execute multiple WorkTools operations sequentially where outputs of step N feed step N+1 automatically.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: 'Ordered array of pipeline steps using exact tool IDs (e.g., "pdf.merge", "pdf.compress").',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: 'Tool ID such as pdf.merge or util.zip_pack' },
                params: { type: 'object', description: 'Tool parameters matching its schema' },
              },
              required: ['tool'],
            },
          },
        },
        required: ['steps'],
      },
    },
  });

  return toolSpecs;
}

function resolveToolIdentifier(rawName: string): string | null {
  const direct = getTool(rawName);
  if (direct) return direct.id;

  const trimmed = rawName.trim();
  const byDot = getTool(trimmed.replace('_', '.'));
  if (byDot) return byDot.id;

  return null;
}

/**
 * Converts one or multiple LLM function calls (including `tenggoo_pipeline_run`) into validated PipelineStep[].
 */
export function parseAiToolCalls(toolCalls: RawAiToolCall[]): PipelineStep[] {
  const steps: PipelineStep[] = [];

  for (const call of toolCalls) {
    const fnName = call.function?.name?.trim();
    if (!fnName) continue;

    let parsedArgs: Record<string, unknown> = {};
    if (call.function?.arguments) {
      try {
        const parsed = JSON.parse(call.function.arguments) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedArgs = parsed as Record<string, unknown>;
        }
      } catch {
        // Ignore malformed JSON arguments
      }
    }

    if (fnName === 'tenggoo_pipeline_run' && Array.isArray(parsedArgs.steps)) {
      for (const rawStep of parsedArgs.steps) {
        if (!rawStep || typeof rawStep !== 'object') continue;
        const candidate = rawStep as { tool?: unknown; params?: unknown };
        if (typeof candidate.tool !== 'string') continue;
        const resolvedId = resolveToolIdentifier(candidate.tool);
        if (!resolvedId) continue;
        const stepParams =
          candidate.params && typeof candidate.params === 'object' && !Array.isArray(candidate.params)
            ? (candidate.params as Record<string, unknown>)
            : {};
        steps.push({ tool: resolvedId, params: stepParams });
      }
      continue;
    }

    const toolId = resolveToolIdentifier(fnName);
    if (toolId) {
      steps.push({ tool: toolId, params: parsedArgs });
    }
  }

  return steps;
}

/**
 * Checks whether two consecutive pipeline steps have compatible output -> input MIME types.
 */
export function checkPipelineStepCompatibility(
  prevToolId: string | undefined,
  nextToolId: string,
): { compatible: boolean; warning?: string } {
  if (!prevToolId) return { compatible: true };
  const prevTool = getTool(prevToolId);
  const nextTool = getTool(nextToolId);
  if (!prevTool || !nextTool) return { compatible: true };
  if (nextTool.minInputs === 0) return { compatible: true };
  if (prevTool.producesMimeTypes.includes('*/*') || nextTool.acceptsMimeTypes.includes('*/*')) {
    return { compatible: true };
  }

  const prevSet = new Set(prevTool.producesMimeTypes);
  const overlap = nextTool.acceptsMimeTypes.some((mime) => prevSet.has(mime));
  if (overlap) return { compatible: true };

  // pdf.stamp_image produces PDF while accepting [PDF, image]
  const prevProducesTextOrData = prevTool.producesMimeTypes.every(
    (m) => m.startsWith('text/') || m === 'application/json',
  );
  if (prevProducesTextOrData && nextTool.acceptsMimeTypes.includes('application/pdf')) {
    return {
      compatible: false,
      warning: `Langkah sebelumnya menghasilkan teks/JSON, sedangkan "${nextTool.name}" memerlukan PDF.`,
    };
  }

  const expectsPdf = nextTool.acceptsMimeTypes.includes('application/pdf');
  const expectsImage = nextTool.acceptsMimeTypes.some((m) => m.startsWith('image/'));
  const producesPdf = prevTool.producesMimeTypes.includes('application/pdf');
  const producesImage = prevTool.producesMimeTypes.some((m) => m.startsWith('image/'));

  if (producesPdf && expectsImage && !expectsPdf) {
    return {
      compatible: false,
      warning: `Langkah sebelumnya menghasilkan PDF, sedangkan "${nextTool.name}" butuh Gambar. Sisipkan "pdf.to_images" terlebih dahulu.`,
    };
  }
  if (producesImage && expectsPdf && !expectsImage) {
    return {
      compatible: false,
      warning: `Langkah sebelumnya menghasilkan Gambar, sedangkan "${nextTool.name}" butuh PDF. Sisipkan "pdf.from_images" terlebih dahulu.`,
    };
  }

  return {
    compatible: false,
    warning: `Output langkah sebelumnya (${prevTool.producesMimeTypes.join(', ')}) mungkin tidak cocok dengan "${nextTool.name}".`,
  };
}
