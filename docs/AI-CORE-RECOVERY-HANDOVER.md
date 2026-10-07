# GuruPro — AI Core Recovery Execution Handover Document
**File**: `docs/AI-CORE-RECOVERY-HANDOVER.md`  
**Date**: 2026-10-07  
**Workspace**: `c:\novara project\gurupro-ai-journal-main`  
**Target Goal**:
> *"Semua fitur berjalan tanpa ada error terutama fitur inti yaitu model AI untuk generate modul dengan lengkap detail serta akurat, terus AI generate ilustrasi yang menghasilkan gambar sesuai dengan modul dan materi yang ada, dan yang terakhir AI generate PPT sesuai dengan modul materi dan gambar sesuai materi yang ada."*

---

## 1. Status Terkini & Hasil Audit Lengkap

| Komponen | Status Lokal | Status Live Supabase / Cloud | Catatan Kritis |
|---|:---:|:---:|---|
| **Full Test Suite** | 48/48 PASS (100%) | N/A (Mock/RAM) | Semua unit test lulus menggunakan mock buffer dan RAM. |
| **Lint & Build** | PASS (0 Error) | PASS | Nitro SSR & TanStack Start build bersih (<23s). |
| **Auth & Core Tables** | PASS | PASS | `profiles`, `kelas`, `moduls`, `paket_soal`, `penugasan` aktif di live Supabase. |
| **16 Tabel Database AI** | Dideklarasikan di migrasi | **MISSING (HTTP 404)** | Tabel AI (`ai_source_snapshots`, `generation_plans`, `illustration_assets`, `presentation_artifacts`, dll.) belum dieksekusi di Supabase live. |
| **3 Bucket Storage AI** | Dikonfigurasi di kode | **MISSING (HTTP 404)** | Bucket `illustration-assets`, `presentation-artifacts`, dan `ai-source-materials` belum dibuat di Supabase Storage. |
| **AI Text Provider** | Gemini & OpenAI | **HTTP 200 (Active)** | Berfungsi untuk generate teks Modul Ajar dan Paket Soal. |
| **AI Image Provider** | Gemini (`gemini-3.1-flash-image`) | **HTTP 429 Quota Exceeded** | Kuota Gemini gratis habis saat probe. |
| **AI Image Provider** | OpenAI (`gpt-image-2`) | **HTTP 200 (Active & Valid)** | **Sukses menghasilkan binary PNG asli (1024x1024)**. |
| **UI Modul Editor** | Berfungsi sebagian | Terbagi 2 jalur | Masih ada tombol legacy fake: `buatSlides` (setTimeout 1.6s) dan `unduhPpt` (HTML di-rename jadi `.ppt`). |
| **PPTX Renderer** | Lengkap (`pptxgenjs`) | Belum terhubung penuh ke UI | Engine OOXML `.pptx` asli (PPT-1C) sudah ada di kode, tinggal dihubungkan ke UI dan storage. |

---

## 2. Urutan Eksekusi Tahapan Sesuai Plan (Stages 01 - 07)

```text
[Stage 01] Baseline, Parity & Security (Migrasi SQL + Bucket Storage + Konfigurasi AI Provider)
     ↓
[Stage 02] Real Source Ingestion & Grounding (Upload PDF/DOCX/URL/Teks -> ai_source_snapshots)
     ↓
[Stage 03] Real Modul Ajar Generation & Persistence (Grounded AI -> DB moduls -> Reload tahan banting)
     ↓
[Stage 04] Real AI Illustration Pipeline (Outline -> Approval -> OpenAI gpt-image-2 binary -> Storage)
     ↓
[Stage 05] Presentation Content & Real PPTX Renderer (PptxGenJS OOXML -> Embed Gambar -> Download .pptx Asli)
     ↓
[Stage 06] End-to-End Integration (Full Golden Path dari Materi hingga File PPTX)
     ↓
[Stage 07] Production Hardening & Final Gate (Fail-closed, zero mock in production, verifikasi rilis)
```

---

## 3. Checklist Tindakan untuk Memulai di Obrolan Baru

Di obrolan baru, eksekusi akan langsung dimulai dari **Stage AI-RECOVERY-01 & 02**:

1. **Aplikasi Migrasi Database**:
   - File migrasi: `supabase/migrations/20261007120000_ai_core_baseline_schema_recovery.sql`
   - Buat 16 tabel AI & 3 bucket storage di Supabase live.
2. **Set Konfigurasi Router AI**:
   - Set `AI_IMAGE_PRIMARY="openai"` dan `OPENAI_IMAGE_MODEL="gpt-image-2"` di `.env` agar generasi gambar langsung sukses tanpa terblokir kuota 429 Gemini.
3. **Pembersihan Jalur Palsu di UI**:
   - Edit `src/components/modul-editor.tsx`:
     - Hapus tombol "Generate PPT dengan Ilustrasi" (setTimeout / `buatSlides`).
     - Hapus `unduhPpt` (HTML disguised as .ppt).
     - Sambungkan tombol presentasi langsung ke `renderPresentationPptxServerFn` / PPTX viewer.
     - Hapus fallback mockup SVG `buatIlustrasi` dari jalur produksi.
4. **Verifikasi E2E Live**:
   - Uji pembuatan materi nyata -> Modul Ajar -> Ilustrasi AI nyata -> Unduh file `.pptx` nyata.

---

## 4. Prompt yang Dapat Ditempelkan ke Obrolan Baru

Salin teks berikut saat membuka obrolan baru:

```text
Halo, kita akan melanjutkan eksekusi rencana pemulihan AI Core GuruPro (AI Core Recovery & End-to-End Generation) secara berurutan sesuai dokumen docs/AI-CORE-RECOVERY-HANDOVER.md yang sudah disiapkan sebelumnya.

Target kita:
Semua fitur berjalan tanpa error, terutama:
1. Model AI untuk generate modul dengan lengkap, detail, serta akurat dari bahan ajar materi guru.
2. AI generate ilustrasi yang menghasilkan gambar nyata (bukan SVG mockup) sesuai modul dan materi.
3. AI generate PPT yang menghasilkan file .pptx asli (bukan HTML .ppt) dengan ilustrasi materi yang tersemat rapi di slide.

Silakan baca docs/AI-CORE-RECOVERY-HANDOVER.md dan langsung mulai eksekusi dari Stage AI-RECOVERY-01 dan AI-RECOVERY-02 secara berurutan.
```
