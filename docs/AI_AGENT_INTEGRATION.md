# Panduan Integrasi AI Agent, Chat Studio & Visual Pipeline

**WorkTools** menyediakan ekosistem lengkap untuk otomasi dokumen berbasis AI — mulai dari antarmuka **AI Agent & Chat Studio (`#ai-chat`)**, **Visual Pipeline Studio (`#pipeline`)**, **MCP Server (`tenggoo-mcp`)**, hingga **CLI (`tenggoo`)** yang siap dihubungkan ke **OpenCode**, **Antigravity**, **Claude Code**, **Codex**, dan **Cursor**.

---

## 1. AI Agent & Chat Studio (`#ai-chat`)

Antarmuka percakapan bawaan di [src/components/AIChatStudio.tsx](../src/components/AIChatStudio.tsx) (dapat diakses lewat menu **AI Chat** di header [https://app.worktools.my.id/#ai-chat](https://app.worktools.my.id/#ai-chat) atau dari *landing page* [https://worktools.my.id](https://worktools.my.id)) memungkinkan pengguna memberi instruksi pemrosesan file dalam bahasa alami.

### Kemampuan Utama
- **Lampiran Multi-File (`Drag & Drop` & File Picker)**: Mendukung pengunggahan satu atau banyak file PDF, gambar (`PNG`, `JPG`, `WebP`), Markdown/CSV/JSON, maupun arsip ZIP ke memori peramban.
- **Function Calling Lengkap (38 Tools + Pipeline)**: Pada provider **Antigravity / Gemini** dan **Local LLM OpenAI-Compatible**, fungsi `buildAiFunctionTools()` di [src/utils/aiIntentParser.ts](../src/utils/aiIntentParser.ts) mengekspos seluruh **38 tool individu** serta **`tenggoo_pipeline_run`**, lengkap dengan informasi daftar file lampiran aktif di prompt konteks.
- **Log Eksekusi Per Langkah (`stepResults`)**: Kartu **Aksi Otomasi Dokumen** menampilkan ringkasan dan durasi tiap langkah yang dieksekusi oleh `runPipeline(...)`.
- **Pratinjau Teks Inline & Rantai Lanjutan**: Output bertipe teks (`.md`, `.txt`, `.csv`, `.json`) dapat dilihat dan disalin langsung dari dalam gelembung chat melalui tombol **Pratinjau** dan **Salin Isi**. Tersedia pula tombol **Jadikan Lampiran Berikutnya** untuk melanjutkan instruksi berikutnya di chat.
- **Handoff Langkah + File ke Visual Pipeline Studio**: Klik **Buka & Edit Langkah di Visual Pipeline Studio** pada kartu aksi AI (atau **Kirim ke Visual Pipeline Studio** pada kartu hasil) untuk membawa daftar langkah beserta file ke editor visual `#pipeline` dan menyempurnakan parameternya.
- **Penyimpanan Lokal Aman**: Konfigurasi disimpan di `tenggoo_ai_chat_config_v4` dan riwayat chat di `tenggoo_ai_chat_history_v3` (`localStorage`). Secara bawaan, kredensial (API key & password) hanya disimpan sementara di `sessionStorage` (`tenggoo_ai_chat_secrets_v1`) dan otomatis terhapus ketika tab ditutup, kecuali pengguna mengaktifkan opsi *Simpan API Key Permanen*.

### Empat Pilihan Engine / Backend AI

Buka ikon roda gigi (**Pengaturan AI & Model**) di pojok kanan atas **AI Chat Studio** untuk memilih backend AI (bawaan: **Built-in Offline**):

#### A. Built-in Offline Mode (Bawaan & Tanpa Server)
Engine intent lokal pintar di [src/utils/aiIntentParser.ts](../src/utils/aiIntentParser.ts) yang langsung aktif secara bawaan tanpa server eksternal, koneksi internet, maupun API key. Mendukung perintah multi-langkah dengan ekstraksi parameter serta kesadaran transisi tipe file antar-langkah (misalnya setelah `pdf.to_images`, kata kunci `"kompres"` otomatis memilih `image.compress`):
- Gabung PDF & Gambar ke PDF (`gabung`, `merge`, `satukan`, `gambar ke pdf`)
- Pisah / ekstrak halaman (`pisah`, `split`, `halaman 1-3`), urutkan halaman (`urutkan 3, 1, 2`), putar (`putar 90`), potong margin (`potong margin`), & N-up (`2 halaman per lembar`)
- Sensor PII / kata kunci permanen (`sensor nik`, `sensor email`, `sensor hp`, `sensor 'RAHASIA'`)
- Scan Enhancer & Grid Sheet (`rapikan scan`, `hitam putih`, `putihkan latar`, `grid a4`, `lembar ktp`)
- Watermark dengan deteksi posisi (`watermark 'RAHASIA'`, `atas`, `bawah`, `grid`, `kanan bawah` untuk gambar)
- Penomoran halaman dengan posisi & format (`nomor halaman kanan bawah`, `atas`, `n/total`)
- Kompresi PDF & Gambar adaptif (`kompres kuat/ekstrem` -> `low`, `ringan` -> `high`, resize `1280px` / `800x600`, crop `1:1`/`3:4`/`4:6`, konversi `webp`/`png`/`jpg`/`ico`)
- Ekstrak teks (`ekstrak teks markdown/json/txt`), ekstrak tabel (`tabel`), hash (`sha256`/`sha512`), QR code (`qr https://...`), Markdown/Tabel ke PDF, dan pack/unpack ZIP (termasuk nama file custom `*.zip`).

#### B. OpenCode (`opencode serve`)
Menghubungkan Chat Studio ke server backend [OpenCode](https://opencode.ai) untuk mengakses model seperti Claude, GPT, DeepSeek, atau Gemini melalui endpoint lokal.
1. **Mode Web:** Jalankan `opencode serve --port 4096 --cors https://app.worktools.my.id` (atau asal Vite `http://localhost:5173`), isi URL/Password jika ada, lalu klik **Uji Koneksi**. Model aktif otomatis dimuat melalui `GET /provider`.
2. **Mode Desktop Windows (`WorkTools.exe`):** Aplikasi Desktop memakai jembatan TCP Rust (`tauri_ai_ensure_opencode` & `tauri_ai_http_request`) sehingga dapat menyalakan dan menghubungi OpenCode di `127.0.0.1` tanpa hambatan CORS browser.

#### C. Antigravity (Google Gemini)
Memakai endpoint OpenAI-compatible resmi Google Gemini (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`) dengan dukungan *function calling* ke seluruh **38 tool** + **`tenggoo_pipeline_run`**.
- **Model tersedia:** `gemini-2.0-flash`, `gemini-2.0-pro-exp-02-05`, `gemini-2.0-flash-thinking-exp-01-21`, `gemini-1.5-pro`, `gemini-1.5-flash`.

#### D. Local LLM (Ollama / LM Studio)
Menghubungkan Chat Studio ke endpoint `/v1/chat/completions` milik Ollama (`http://127.0.0.1:11434/v1`) atau LM Studio (`http://127.0.0.1:1234/v1`) dengan deteksi model lewat `GET /models` dan dukungan *function calling* penuh (di web pastikan `OLLAMA_ORIGINS=*` aktif, atau gunakan Desktop App).

---

## 2. Visual Pipeline Studio (`#pipeline`)

Komponen [src/components/PipelineStudio.tsx](../src/components/PipelineStudio.tsx) menyediakan editor alur kerja multi-langkah di browser:
- **AI Pipeline Builder:** Ketik instruksi bahasa alami di kotak gelap bagian atas lalu klik **Buat Rangkaian** untuk langsung menghasilkan blok langkah terkonfigurasi lewat `resolveIntentFromPrompt(...)`.
- **6 Preset Bawaan + Resep Kustom:** Tersedia 6 preset (*Foto Dokumen -> PDF Rapi*, *Markdown + QR Stamp -> PDF*, *Kontrak Aman PII + Cap + Kompres*, *Scan KTP -> Grid A4 PDF*, *PDF -> Gambar Kompres -> ZIP*, *Pas Foto 3:4 & Privasi EXIF*), penyimpanan preset lokal (`tenggoo_custom_pipelines_v1`), serta ekspor/impor berkas `.pipeline.json`.
- **Kontrol Langkah & Validasi Kompatibilitas:** Setiap blok memiliki toggle **Aktif / Dilewati**, **Duplikat**, **Reset Parameter**, tombol geser **Naik/Turun**, label input -> output MIME, serta peringatan otomatis (`checkPipelineStepCompatibility`) bila output langkah sebelumnya tidak cocok dengan input langkah berikutnya.
- **Pratinjau Multi-File & Chaining:** Bila pipeline menghasilkan banyak file, pilih tab file untuk melihat pratinjau PDF (`iframe`), Gambar (`<img>`), atau teks/JSON dengan tombol salin, lalu klik **Jadikan Hasil sebagai Input Baru** untuk melanjutkan ke rangkaian berikutnya.
- **Ekspor CLI & MCP Sekali Klik:** Salin perintah terminal dalam format `--step Flags` maupun `--steps JSON`, atau salin payload JSON `tenggoo_pipeline_run`.

---

## 3. Integrasi MCP Server (`bin/tenggoo-mcp.mjs`)

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

## 4. Integrasi CLI (`bin/tenggoo.mjs`)

CLI *headless* di [src/agent/cli.ts](../src/agent/cli.ts) (dapat dipanggil via `node bin/tenggoo.mjs` atau `npm run tenggoo -- ...`) cocok untuk agen terminal maupun skrip otomasi CI/lokal.

```bash
# Lihat seluruh 38 tool beserta skema parameter JSON lengkap
node bin/tenggoo.mjs list --json
node bin/tenggoo.mjs list --category pdf --json

# Lihat detail skema input/output satu tool tertentu
node bin/tenggoo.mjs describe pdf.redact_text --json

# Jalankan satu tool
node bin/tenggoo.mjs run pdf.merge -i dokumen_a.pdf dokumen_b.pdf -o hasil.pdf --json
node bin/tenggoo.mjs run pdf.redact_text -i kontrak.pdf -o aman.pdf --presetPattern all_pii --json
node bin/tenggoo.mjs run util.qr_generate --text "https://worktools.my.id" -o qr.png --json

# Rangkai pipeline multi-langkah dengan --step atau --steps-file
node bin/tenggoo.mjs pipeline \
  -i scan1.jpg scan2.jpg \
  --step "image.scan_enhance:mode=whiten-bg" \
  --step "image.grid_sheet:columns=2,rows=1,pageSize=A4" \
  --step "pdf.from_images:pageSize=A4,margin=20" \
  --step "pdf.watermark:text=CONFIDENTIAL,opacity=0.25" \
  -o laporan_final.pdf --json
```

Untuk tabel lengkap seluruh **38 Tool ID**, nama MCP, serta parameter masing-masing tool, lihat [skills/tenggoo-toolkit/SKILL.md](../skills/tenggoo-toolkit/SKILL.md).

---

## 5. Pemecahan Masalah (Troubleshooting)

1. **Error CORS saat `AI Chat Studio` mengakses OpenCode / Ollama di Browser**
   - Jalankan OpenCode dengan asal domain yang sesuai: `opencode serve --port 4096 --cors https://app.worktools.my.id` (atau port lokal Vite), atau aktifkan `OLLAMA_ORIGINS=*` pada Ollama.
   - Alternatif terbaik: pasang aplikasi Desktop Windows (`WorkTools.exe`) yang menggunakan loopback bridge Rust (`tauri_ai_http_request`) tanpa pembatasan CORS browser.
2. **PowerShell Memblokir Eksekusi `npm` di Windows (`ExecutionPolicy`)**
   - Jalankan perintah via `cmd /c "npm run ..."` atau langsung via `node bin/tenggoo.mjs ...`.
3. **Membutuhkan Node.js 22+ untuk CLI & MCP Server**
   - [bin/tenggoo.mjs](../bin/tenggoo.mjs) dan [bin/tenggoo-mcp.mjs](../bin/tenggoo-mcp.mjs) memanfaatkan flag `--experimental-strip-types` bawaan Node.js 22+.
