# Panduan Integrasi AI Agent & Chat Studio

**Work Tool Super App** menyediakan integrasi lengkap untuk kebutuhan otomasi dokumen berbasis AI — mulai dari antarmuka **AI Agent & Chat Studio** di dalam aplikasi web, **MCP Server (`tenggoo-mcp`)**, hingga **CLI (`tenggoo`)** yang bisa langsung dipanggil oleh agen eksternal seperti **OpenCode**, **Antigravity**, **Claude Code**, **Codex**, dan **Cursor**.

---

## 1. AI Agent & Chat Studio (`#ai-chat`)

Antarmuka percakapan bawaan di [src/components/AIChatStudio.tsx](../src/components/AIChatStudio.tsx) (dapat diakses melalui tombol **AI Chat** di header atas atau rute `#ai-chat`) memungkinkan Anda memberi instruksi pemrosesan file dengan bahasa alami.

### Kemampuan Utama
- **Lampiran Multi-File (`Drag & Drop` & File Picker)**: Mendukung pengunggahan satu atau banyak file PDF, gambar (`PNG`, `JPG`, `WebP`), Markdown/CSV, maupun arsip ke memori peramban.
- **Perencanaan & Eksekusi Otomatis (*Auto-Execute*)**: Saat model AI atau parser intent memetakan instruksi menjadi langkah tool/pipeline, kartu **Aksi Otomasi Dokumen** mengeksekusinya langsung di perangkat Anda melalui `runPipeline(...)`.
- **Kartu Hasil & Unduhan Instan**: Menampilkan tombol **Unduh** per file, **Unduh Semua (ZIP)** untuk multi-output, serta tombol **Kirim File Ini ke Visual Pipeline Studio** (`#pipeline`) untuk penyuntingan lanjutan.
- **Penyimpanan Lokal Aman**: Konfigurasi (`tenggoo_ai_chat_config_v3`) dan riwayat chat (`tenggoo_ai_chat_history_v3`) disimpan lokal di `localStorage` browser tanpa mengirim berkas fisik ke server luar.

### Empat Pilihan Engine / Backend AI

Buka ikon roda gigi (**Pengaturan AI & Model**) di pojok kanan atas **AI Chat Studio** untuk memilih dan mengonfigurasi backend AI:

#### A. OpenCode (`opencode serve`) — Direkomendasikan
Menghubungkan Chat Studio ke server backend [OpenCode](https://opencode.ai) sehingga Anda bisa memakai model unggulan (Claude, GPT, DeepSeek, Gemini, dll.) yang sudah aktif di konfigurasi OpenCode Anda.

1. Jalankan OpenCode server di terminal dengan izin CORS menuju URL aplikasi web:
   ```bash
   opencode serve --port 4096 --cors http://localhost:5174
   ```
   *(Sesuaikan port asal seperti `5173` atau `5174` dengan port Vite yang sedang aktif).*
2. Di pengaturan **AI Chat Studio**:
   - **URL Server OpenCode**: default `http://127.0.0.1:4096`
   - **Password (Opsional)**: isi jika menjalankan OpenCode dengan `OPENCODE_SERVER_PASSWORD` (autentikasi HTTP Basic untuk username `opencode`).
   - **Model OpenCode**: saat `opencode serve` aktif, daftar model otomatis dideteksi lewat `GET /provider` (dan bisa dimuat ulang lewat tombol **Muat Ulang Model**), atau bisa diketik manual.
3. Klik **Uji Koneksi** hingga status di bar atas berubah menjadi **Terhubung**.

#### B. Antigravity (Google Gemini)
Memakai endpoint OpenAI-compatible resmi Google Gemini (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`) lengkap dengan dukungan *function calling* untuk memanggil katalog tool Tenggoo.

- **Model yang tersedia di dropdown**:
  - `gemini-2.0-flash` *(Default Antigravity — Cepat & Cerdas)*
  - `gemini-2.0-pro-exp-02-05` *(Penalaran Rumit & Cekatan)*
  - `gemini-2.0-flash-thinking-exp-01-21` *(Deep Reasoning)*
  - `gemini-1.5-pro` *(Context Window Besar)*
  - `gemini-1.5-flash` *(Hemat & Cepat)*
- **Google Gemini API Key**: Masukkan kunci API Anda; kunci hanya disimpan lokal di `localStorage` browser dan dikirim langsung via header `Authorization: Bearer ...` ke Google API.

#### C. Local LLM (Ollama / LM Studio)
Cocok untuk menjalankan model *open-weight* secara privat di mesin sendiri melalui antarmuka `/v1` yang kompatibel dengan OpenAI.

- **Base URL Endpoint**:
  - Ollama: `http://127.0.0.1:11434/v1`
  - LM Studio: `http://127.0.0.1:1234/v1`
- **Daftar Model**: Otomatis mengambil daftar model terpasang dari `GET /models` (contoh default: `qwen2.5-coder:7b`).
- Pastikan variabel lingkungan `OLLAMA_ORIGINS=*` aktif saat menjalankan Ollama jika diakses melalui browser web.

#### D. Built-in Offline Mode (Fallback Otomatis)
Jika tidak ada server AI eksternal yang berjalan (atau API eksternal gagal dijangkau), parser intent lokal bawaan di `AIChatStudio.tsx` tetap memproses perintah bahasa Indonesia dan Inggris untuk tugas populer:
- Gabung PDF / Gambar ke PDF (`gabung`, `merge`, `satukan`)
- Watermark miring teks kustom (`watermark`, `cap`, `stempel`, `'RAHASIA'`, `'DRAFT'`)
- Penomoran halaman (`nomor halaman`, `page number`, `halaman di bawah`)
- Kompresi PDF & gambar (`kompres`, `compress`, `perkecil`, `hemat`)
- Konversi PDF ke JPG + arsip ZIP (`pdf ke gambar`, `to image`, + `zip`/`arsip`)
- Ekstraksi teks & deteksi tabel (`ekstrak teks`, `tabel`)
- Pembuatan QR Code (`qr`, `qrcode`, `barcode`)

---

## 2. Integrasi MCP Server (`bin/tenggoo-mcp.mjs`)

Server MCP di [src/agent/mcp-server.ts](../src/agent/mcp-server.ts) (dijalankan via wrapper [bin/tenggoo-mcp.mjs](../bin/tenggoo-mcp.mjs)) menggunakan protokol **`stdio` newline-delimited JSON-RPC 2.0** dan mengekspose **39 MCP tools**:
- **38 tool individu** dengan format nama `tenggoo_<kategori>_<nama>` (contoh: `tenggoo_pdf_merge`, `tenggoo_image_scan_enhance`, `tenggoo_util_qr_generate`).
- **1 tool pipeline `tenggoo_pipeline_run`** untuk merangkai urutan langkah PDF, Image, dan Utility dalam satu pemanggilan.

### Prilaku Penulisan File Tool Inspeksi
Tool yang bersifat hanya-baca / inspeksi otomatis melewati penulisan file ke disk apabila argumen `output_path` tidak diberikan, dan langsung mengembalikan metadata hasil di respons JSON:
- `pdf.extract_text`
- `pdf.extract_tables`
- `pdf.form_inspect`
- `pdf.diff_text`
- `pdf.metadata` *(ketika `action` bernilai `'inspect'` atau kosong)*
- `image.info`
- `util.hash_checksum`

### Contoh Konfigurasi untuk OpenCode (`opencode.json`)
OpenCode menggunakan blok `mcp` pada `opencode.json` (global maupun tingkat proyek):

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

### Contoh Konfigurasi untuk Antigravity, Claude Desktop, & Cursor
Tambahkan entri berikut pada bagian `mcpServers` di file konfigurasi klien MCP Anda:

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

---

## 3. Integrasi CLI (`bin/tenggoo.mjs`)

CLI *headless* di [src/agent/cli.ts](../src/agent/cli.ts) (dapat dipanggil via `node bin/tenggoo.mjs` atau `npm run tenggoo -- ...`) cocok untuk agen yang bekerja di terminal maupun skrip otomasi CI/lokal.

### Perintah Dasar
```bash
# Lihat seluruh 38 tool beserta skema parameter JSON lengkap
node bin/tenggoo.mjs list --json
node bin/tenggoo.mjs list --category pdf --json

# Lihat detail skema input/output satu tool tertentu
node bin/tenggoo.mjs describe pdf.redact_text --json
```

### Menjalankan Satu Tool (`run`)
```bash
# Gabung 2 PDF
node bin/tenggoo.mjs run pdf.merge -i dokumen_a.pdf dokumen_b.pdf -o hasil.pdf --json

# Sensor otomatis PII (NIK, Email, Telepon)
node bin/tenggoo.mjs run pdf.redact_text -i kontrak.pdf -o aman.pdf --presetPattern all_pii --json

# Generate QR Code
node bin/tenggoo.mjs run util.qr_generate --text "https://tenggoo.my.id" -o qr.png --json
```

### Menjalankan Multi-Step Pipeline (`pipeline`)
Output dari langkah `N` diteruskan otomatis sebagai input untuk langkah `N+1`:

```bash
# Menggunakan --step berulang
node bin/tenggoo.mjs pipeline \
  -i scan1.jpg scan2.jpg \
  --step "image.scan_enhance:mode=whiten-bg" \
  --step "image.grid_sheet:columns=2,rows=1,pageSize=A4" \
  --step "pdf.from_images:pageSize=A4,margin=20" \
  --step "pdf.watermark:text=CONFIDENTIAL,opacity=0.25" \
  -o laporan_final.pdf --json

# Atau membaca daftar langkah dari file JSON (misalnya hasil ekspor Pipeline Studio)
node bin/tenggoo.mjs pipeline -i input.pdf --steps-file workflow.json -o output.pdf --json
```

Untuk tabel lengkap seluruh **38 Tool ID**, nama MCP, serta parameter masing-masing tool, lihat [skills/tenggoo-toolkit/SKILL.md](../skills/tenggoo-toolkit/SKILL.md).

---

## 4. Pemecahan Masalah (Troubleshooting)

1. **Error CORS saat `AI Chat Studio` mengakses OpenCode / Ollama di Browser**
   - Pastikan server dijalankan dengan mengizinkan *origin* Vite aktif:
     - OpenCode: `opencode serve --port 4096 --cors http://localhost:5174` (sesuaikan port jika Vite berjalan di `5173` atau lainnya).
     - Ollama: jalankan dengan env `OLLAMA_ORIGINS=*`.
   - Sebagai alternatif tanpa pembatasan CORS browser, jalankan aplikasi dalam mode desktop Tauri (`npm run desktop:dev`).

2. **PowerShell Memblokir Eksekusi `npm` di Windows (`ExecutionPolicy`)**
   - Jika muncul error `npm.ps1 cannot be loaded because running scripts is disabled`, jalankan perintah melalui `cmd /c` atau panggil langsung via `node`:
     ```bash
     cmd /c "npm run dev"
     node bin/tenggoo.mjs list --json
     ```

3. **Membutuhkan Node.js 22+ untuk CLI & MCP Server**
   - [bin/tenggoo.mjs](../bin/tenggoo.mjs) dan [bin/tenggoo-mcp.mjs](../bin/tenggoo-mcp.mjs) menjalankan file TypeScript secara langsung menggunakan flag `--experimental-strip-types`, yang membutuhkan **Node.js 22 ke atas**.
