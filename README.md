# Work Tool Super App

**Work Tool Super App** adalah toolkit pengolah file **100% lokal (Client-Side & On-Device)** untuk Web, Desktop (Tauri), **AI Chat Studio (`#ai-chat`)**, dan **AI Agent** (**OpenCode**, **Antigravity**, Codex, Claude Code, Cursor). Seluruh **38 fungsi** PDF, Image, dan Utility dibangun di atas satu *Headless Core Engine* (`src/core/`) sehingga dapat digunakan secara interaktif lewat antarmuka web maupun dipanggil langsung oleh AI Agent melalui **Chat AI**, **MCP Server (`tenggoo-mcp`)**, **CLI (`tenggoo`)**, dan **TypeScript SDK**.

---

## Dokumentasi Lengkap

- **[Panduan Integrasi AI Agent & Chat Studio](docs/AI_AGENT_INTEGRATION.md)** — Setup **AI Chat Studio** (OpenCode `opencode serve`, Antigravity/Gemini, Local LLM Ollama/LM Studio, Built-in Offline), konfigurasi **MCP Server**, **CLI**, dan *troubleshooting*.
- **[Arsitektur & Panduan Pengembang](docs/ARCHITECTURE.md)** — Diagram arsitektur, peta direktori, konsep `VirtualFile`, navigasi hash/UI, dan cara menambah tool baru.
- **[Katalog 38 Tool & Skema Parameter (Agent Skill)](skills/tenggoo-toolkit/SKILL.md)** — Referensi lengkap parameter seluruh tool (`pdf.*`, `image.*`, `util.*`) dan nama MCP-nya.

---

## Fitur Utama (38 Headless Tools + AI Chat & Pipeline)

### 1. PDF Tools (21 Headless Tools)
- **Gabung (`pdf.merge`)** & **Pisah (`pdf.split`)** halaman PDF (per rentang atau per halaman).
- **Atur Halaman (`pdf.reorder`)** & **Putar PDF (`pdf.rotate`)** secara visual.
- **Kompres PDF (`pdf.compress`)** via Ghostscript WASM di GUI dan optimasi stream/raster di headless CLI/MCP.
- **PDF ke Gambar (`pdf.to_images`)** & **Gambar ke PDF (`pdf.from_images`)**.
- **Watermark (`pdf.watermark`)** & **Nomor Halaman (`pdf.page_numbers`)**.
- **Buka Kunci PDF (`pdf.unlock`)** terproteksi password secara lokal.
- **Ekstrak Teks (`pdf.extract_text`)** & **Ekstrak Tabel (`pdf.extract_tables`)** ke Markdown, CSV, TXT, atau JSON terstruktur.
- **Inspeksi & Edit Metadata (`pdf.metadata`)** (baca/ubah/hapus Title, Author, Subject, Keywords).
- **Tanda Tangan & Stempel Gambar (`pdf.stamp_image`)** lengkap dengan **Signature Pad** interaktif di layar (gambar tanda tangan langsung dengan mouse/sentuhan) atau upload logo/QR code.
- **Sensor Area (`pdf.redact`)** & **Sensor Otomatis PII/Regex (`pdf.redact_text`)** (deteksi otomatis NIK, email, no. HP, atau kata kunci dengan *burn-in* permanen).
- **Potong Margin (`pdf.crop_margins`)** secara seragam atau per sisi halaman.
- **Inspeksi & Isi Form AcroForm (`pdf.form_inspect`, `pdf.form_fill`)** secara otomatis dari JSON.
- **Bandingkan 2 PDF (`pdf.diff_text`)** & **Cetak N-up (`pdf.nup`)** (2, 4, 6, atau 9 halaman per lembar).

### 2. Image Tools (11 Tools)
- **Kompres Gambar (`image.compress`)**, **Konversi Format (`image.convert` PNG/JPG/WebP/ICO)**, **Resize (`image.resize`)**, & **Crop / Pas Foto (`image.crop` 1:1, 3:4, 4:6, 16:9)**.
- **Scan Enhancer (`image.scan_enhance`)** untuk membersihkan bayangan foto dokumen kertas agar tampak seperti hasil scanner.
- **Grid / KTP Sheet (`image.grid_sheet`)** untuk menyusun beberapa foto ke dalam 1 lembar A4/Letter.
- **Visual Image Diff (`image.diff`)** untuk membandingkan 2 gambar dan menyorot area perubahannya.
- **Putar & Balik (`image.rotate_flip`)**, **Watermark Gambar (`image.watermark`)**, **Hapus EXIF & GPS (`image.strip_metadata`)**, & **Info Gambar (`image.info`)**.

### 3. Document & Utilities (6 Tools)
- **QR Code Generator (`util.qr_generate`)**: buat QR code PNG siap tempel ke dokumen PDF.
- **Markdown to PDF (`util.md_to_pdf`)** & **CSV/JSON Table to PDF (`util.table_to_pdf`)**.
- **Pack & Unpack ZIP (`util.zip_pack`, `util.zip_unpack`)**.
- **File Checksum (`util.hash_checksum`)**: hitung hash integritas `SHA-256`, `SHA-1`, `SHA-512`.

### 4. AI Chat Studio, Visual Pipeline, & Antarmuka Minimalis
- **AI Agent & Chat Studio (`#ai-chat`)**: instruksikan pemrosesan multi-file lewat obrolan bahasa alami. Mendukung **OpenCode** (`opencode serve` dengan deteksi model otomatis), **Antigravity (Google Gemini)**, **Local LLM (Ollama / LM Studio)**, serta **Built-in Offline Mode**.
- **Visual Pipeline Studio (`#pipeline`)**: rangkai alur multi-langkah, simpan preset kustom, serta ekspor/impor `.pipeline.json`.
- **Katalog Minimalis & Command Palette (`Ctrl+K`)**: layar beranda bersih tanpa sidebar ganda, dilengkapi filter kategori pill (`39` entri katalog termasuk AI Chat & Pipeline) dan pencarian cepat.

---

## Integrasi AI Agent (OpenCode, Antigravity, Codex, Claude Code, Cursor)

### 1. Melalui Chat AI di Aplikasi Web (`#ai-chat`)
Klik **AI Chat** di header atas, lalu buka ikon pengaturan (roda gigi) untuk menghubungkan:
- **OpenCode**: Jalankan `opencode serve --port 4096 --cors http://localhost:5174` dan pilih model yang terdeteksi otomatis.
- **Antigravity (Google Gemini)**: Pilih model `gemini-2.0-flash` / `gemini-2.0-pro-exp-02-05` dan masukkan API Key.
- **Local LLM**: Hubungkan ke Ollama (`http://127.0.0.1:11434/v1`) atau LM Studio (`http://127.0.0.1:1234/v1`).
- **Built-in Offline**: Aktif langsung tanpa server eksternal.

### 2. Melalui MCP Server (`stdio` JSON-RPC 2.0 — 39 MCP Tools)
Server di [bin/tenggoo-mcp.mjs](bin/tenggoo-mcp.mjs) mengekspose **38 tool individu** + **`tenggoo_pipeline_run`**.

**Untuk OpenCode (`opencode.json`):**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tenggoo": {
      "type": "local",
      "command": ["node", "D:/source_code/tenggoo_pdf/bin/tenggoo-mcp.mjs"],
      "enabled": true
    }
  }
}
```

**Untuk Antigravity, Claude Desktop, & Cursor (`mcpServers`):**
```json
{
  "mcpServers": {
    "tenggoo-toolkit": {
      "command": "node",
      "args": ["bin/tenggoo-mcp.mjs"],
      "cwd": "D:/source_code/tenggoo_pdf"
    }
  }
}
```

### 3. Melalui CLI Global (`bin/tenggoo.mjs`)
```bash
# Lihat seluruh 38 tool beserta skema parameter JSON
node bin/tenggoo.mjs list --json

# Sensor otomatis NIK & Email di PDF
node bin/tenggoo.mjs run pdf.redact_text -i kontrak.pdf -o aman.pdf --presetPattern all_pii --json

# Kombinasikan beberapa tool sekaligus dalam satu pipeline
node bin/tenggoo.mjs pipeline \
  -i foto1.png foto2.png \
  --step "image.scan_enhance:mode=whiten-bg" \
  --step "image.grid_sheet:columns=2,rows=1,pageSize=A4" \
  --step "pdf.from_images:pageSize=A4,margin=20" \
  --step "pdf.watermark:text=CONFIDENTIAL,opacity=0.25" \
  -o laporan_final.pdf --json
```

---

## Menjalankan Aplikasi, Pengujian, & Build

Prasyarat: **Node.js 22+**.

```bash
# Install dependencies
npm install

# Jalankan GUI Web (Vite + React)
npm run dev

# Jalankan seluruh automated test suite (38 tools + pipeline + CLI + MCP)
npm test

# Jalankan ESLint & Production Build
npm run lint
npm run build
```

### Mode Desktop (Tauri)
```bash
npm run desktop:dev
npm run desktop:build
```

## Privasi & Keamanan
- Seluruh pemrosesan berkas (PDF, gambar, redaksi, konversi, arsip ZIP, dan mode Built-in AI Chat) berjalan **100% lokal di perangkat Anda** tanpa mengunggah file dokumen ke server eksternal.
- Apabila Anda mengaktifkan provider AI eksternal pada **AI Chat Studio** (misalnya **Antigravity / Google Gemini API** atau endpoint **OpenCode** jarak jauh), hanya teks prompt/metadata instruksi yang dikirim ke penyedia model yang Anda pilih; API key hanya disimpan secara lokal di browser (`localStorage`).
