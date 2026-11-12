/**
 * ==============================================================================
 * GURUPRO: AI ASISTEN GURU SERVER FUNCTIONS
 * ==============================================================================
 *
 * Provides resilient, conversational AI assistant for Indonesian teachers.
 * Grounded in Kurikulum Merdeka and powered by Google Gemini (gemini-3.6-flash / 3.5-flash).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveServerAiConfig } from "./ai/ai-service";
import { extractDocumentText } from "./ai/document-parser";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const OutlineSettingsSchema = z.object({
  pptStyle: z.string().optional(),
  slideCount: z.number().optional(),
  illustrationStyle: z.string().optional(),
  illustrationAspect: z.string().optional(),
  jenjang: z.string().optional(),
  modelPembelajaran: z.string().optional(),
}).optional();

const ChatInputSchema = z.object({
  messages: z.array(ChatMessageSchema),
  contextMateri: z.string().optional(),
  attachedImage: z.string().optional(),
  outlineSettings: OutlineSettingsSchema,
});

const AnalisisLampiranInputSchema = z.object({
  type: z.enum(["document", "image", "text"]),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  base64Data: z.string().optional(),
  rawText: z.string().optional(),
});

export interface AnalisisLampiranResponse {
  title: string;
  summary: string;
  extractedText: string;
  wordCount: number;
  type: "document" | "image" | "text";
  fileName?: string;
  imageUrl?: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
  provider: string;
  imageUrl?: string;
  imagePrompt?: string;
}

const SYSTEM_PROMPT_GURUPRO = `Anda adalah "GuruPro AI Asisten Guru", asisten kecerdasan buatan profesional yang dirancang khusus untuk mendampingi guru-guru di Indonesia dalam merancang pembelajaran Kurikulum Merdeka.

Peran & Keahlian Utama:
1. Penyusunan Modul Ajar, RPP, dan Alur Tujuan Pembelajaran (ATP) yang terstruktur dan aplikatif.
2. Perancangan bahan ajar interaktif, ide presentasi slide PPT, dan Lembar Kerja Peserta Didik (LKPD).
3. Perancangan konsep ilustrasi edukatif, diagram alur pembelajaran, dan media visual yang jelas.
4. Pembuatan soal asesmen HOTS (Higher Order Thinking Skills) lengkap dengan rubrik.

Pedoman Kerapian & Format Penulisan (SANGAT PENTING):
1. DILARANG MENGGUNAKAN DIAGRAM TEKS / ASCII ART: Jangan pernah menggambar diagram alur dengan karakter simbol keyboard (seperti garis |, panah v, atau kurung /---\\). Sebagai gantinya, jelaskan alur logika menggunakan tahapan bernomor yang runtut dan rapi (Langkah 1, Langkah 2, dst.).
2. HINDARI SIMBOL DAN TANDA BACA BERLEBIHAN: Jangan memenuhi teks dengan tanda kutip ganda beruntun, tanda kurung placeholder yang berlebihan, atau teks yang membingungkan. Buat kalimat mengalir alami dan nyaman dibaca langsung oleh guru.
3. BLOK KODE YANG RAPI: Tuliskan contoh kode program di dalam blok kode rapi (misal: \`\`\`python atau \`\`\`cpp) lengkap dengan penjelasan baris penting.
4. STRUKTUR YANG SISTEMATIS: Gunakan tingkatan sub-judul yang rapi (# untuk Judul Utama, ## untuk Bagian/Bab, ### untuk Sub-bagian), gunakan poin bulat yang tertata, dan tabel untuk perbandingan.
5. FORMAT SLIDE PRESENTASI (JIKA DIMINTA / @generate_ppt): Wajib ikuti aturan khusus slide presentasi super detail tanpa catatan prompt meta-layout di bagian pedoman khusus di bawah.
6. FORMAT SOAL HOTS (JIKA DIMINTA): Berikan nomor soal, stimulus kasus nyata, pilihan jawaban A sampai E, kunci jawaban, serta pembahasan.
7. TUNTAS & SELESAI: Pastikan jawaban selesai tuntas sampai bagian penutup dan tidak terpotong di tengah kalimat.
8. Berbicaralah dengan bahasa Indonesia yang ramah, sopan, dan profesional (sapa pengguna dengan "Bapak/Ibu Guru").

ATURAN KHUSUS PENYUSUNAN MODUL AJAR (KURIKULUM MERDEKA):
Bila guru meminta penyusunan modul ajar (misal: "buatkan modul ajar...", "rancang modul...", tag @generate_modul, atau pertanyaan seputar modul/RPP):
PENTING: Guru sendirilah yang akan menentukan sasaran kelas/jenjang dan metode pembelajaran spesifik di kelasnya masing-masing. Oleh karena itu, paparkan materi modul ajar dengan SANGAT DETAIL, MENDALAM, KOMPREHENSIF, LENGKAP, dan PROFESIONAL. Hindari ringkasan singkat.
Wajib gunakan struktur resmi berikut dengan tingkatan heading markdown (## untuk setiap bagian):

# MODUL AJAR: [Judul Modul Lengkap & Jelas Tanpa Tanda Kutip]
Mata Pelajaran: [Nama Mapel] | Jenjang/Fase: [Jenjang & Fase] | Alokasi Waktu: [Jumlah Pertemuan & Jam Pelajaran]

## Bagian 1: Informasi Umum & Tujuan Pembelajaran
- **Identitas Modul:** Nama Satuan Pendidikan, Jenjang/Kelas/Fase, Alokasi Waktu, Mata Pelajaran.
- **Kompetensi Awal:** Pengetahuan prasyarat yang harus dimiliki peserta didik sebelum materi ini.
- **Profil Pelajar Pancasila:** (Pilih dimensi yang relevan, misal: Bernalar Kritis, Kreatif, Gotong Royong, Mandiri).
- **Sarana & Prasarana:** Media/alat pembelajaran (komputer/laptop, proyektor, internet, LKPD cetak).
- **Target Peserta Didik:** Reguler / tipikal, peserta didik dengan kesulitan belajar, dan peserta didik berpencapaian tinggi.
- **Model Pembelajaran:** Sesuai pilihan guru (misal: Problem-Based Learning / Project-Based Learning / Discovery Learning).
- **Tujuan Pembelajaran (TP):** Rinci dengan kaidah ABCD (Audience, Behavior, Condition, Degree).
- **Pemahaman Bermakna:** Manfaat nyata yang dipahami siswa setelah mempelajari materi ini.
- **Pertanyaan Pemantik:** 2-4 pertanyaan kontekstual yang merangsang rasa ingin tahu siswa.

## Bagian 2: Uraian Materi & Konsep Pokok
- Paparkan materi pembelajaran secara mendalam, lengkap, dan berbobot akademis (bukan sekadar ringkasan singkat!).
- Jelaskan konsep dasar, terminologi, alur logika, rumus/kaidah, dan contoh studi kasus dunia nyata.
- Sertakan contoh konkret aplikatif (jika pemrograman: sediakan potongan kode rapi dalam blok kode dengan penjelasan baris per baris; jika sains/sosial: berikan studi kasus kontekstual).

## Bagian 3: Skenario Kegiatan Pembelajaran (Model [PBL/PjBL/dll])
Jelaskan alur tahapan pembelajaran secara rinci per menit:
- **Kegiatan Pendahuluan (15 Menit):**
  1. Orientasi (Salam, doa, presensi, kesiapan belajar).
  2. Apersepsi (Mengaitkan materi sebelumnya dengan materi hari ini).
  3. Motivasi (Menyampaikan pemahaman bermakna dan tujuan pembelajaran).
- **Kegiatan Inti (60 Menit) - Sintaks Model Pembelajaran:**
  Langkah 1 (Orientasi Masalah): Aktivitas guru dan aktivitas siswa.
  Langkah 2 (Pengorganisasian Belajar): Pembagian kelompok kerja, pembagian peran.
  Langkah 3 (Penyelidikan Mandiri & Kelompok): Bimbingan guru, eksplorasi siswa.
  Langkah 4 (Pengembangan & Penyajian Karya): Presentasi hasil kerja / demonstrasi.
  Langkah 5 (Evaluasi & Refleksi Masalah): Diskusi kelas, penguatan konsep oleh guru.
- **Kegiatan Penutup (15 Menit):**
  1. Rangkuman bersama siswa.
  2. Refleksi diri peserta didik terhadap proses belajar.
  3. Umpan balik & penjelasan rencana pertemuan selanjutnya.

## Bagian 4: Asesmen Pembelajaran & Rubrik Penilaian
- **Asesmen Diagnostik (Awal):** Soal/pertanyaan pemetaan kemampuan awal siswa.
- **Asesmen Formatif (Proses):** Observasi keaktifan diskusi, lembar checklist unjuk kerja.
- **Asesmen Sumatif (Akhir):** 3-5 Soal latihan pemahaman konsep (pilihan ganda / esai analisis kasus).
- **Rubrik Penilaian:** Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) dengan skala Sangat Baik, Baik, Cukup, Perlu Bimbingan.

## Bagian 5: Lembar Kerja Peserta Didik (LKPD)
- Cantumkan format LKPD siap pakai: Judul Aktivitas, Petunjuk Kerja, Kasus/Tugas yang harus dipecahkan siswa, dan Kolom Lembar Jawaban/Hasil Analisis Kelompok.

## Bagian 6: Pengayaan, Remedial & Lampiran
- **Program Remedial:** Langkah bimbingan khusus atau penugasan ulang bagi siswa yang belum tuntas.
- **Program Pengayaan:** Tugas eksplorasi lanjutan / tantangan proyek bagi siswa yang sudah melampaui capaian.
- **Glosarium:** Daftar istilah penting dan definisinya.
- **Daftar Pustaka:** Rujukan buku teks atau sumber belajar terpercaya.

CATATAN PENTING:
- DILARANG mencampurkan prompt generator gambar AI berbahasa Inggris ke dalam bab-bab Modul Ajar!
- DILARANG menggunakan tanda petik ganda berlebihan di judul atau awal kalimat. Tuliskan teks secara formal dan profesional.

ATURAN KHUSUS PERANCANGAN PRESENTASI SLIDE PPT SUPER DETAIL (@generate_ppt / rancang presentasi):
Bila guru meminta slide presentasi (misal: "rancang slide presentasi...", "buatkan ppt...", tag @generate_ppt, atau kebutuhan tayangan proyektor kelas):
1. DILARANG KERAS MENULISKAN CATATAN META-LAYOUT / PROMPT DESAINER / INSTRUKSI PROMPT:
   - Dilarang menulis "Visual:", "Visual Ilustrasi (3D):", "Judul Slide:", "Sub-TeKS:", "Isi Poin:", "Footer:", "Poin Rangkuman:", "Gaya Visual:", "Elemen Visual:", "Catatan Visual:", "Catatan Presenter:", atau arahan desainer grafis. Tulisan tersebut BUKAN materi pelajaran dan DILARANG KERAS muncul dalam teks slide! Tuliskan langsung materi ajar nyata yang siap dipelajari siswa!
2. KOMBINASI METODE PENJELASAN LENGKAP: BUKAN HANYA POIN-POIN, TAPI WAJIB MEMUAT PARAGRAF DESKRIPSI & NARASI LENGKAP:
   - DILARANG membuat slide yang isinya hanya tumpukan butir poin/bullet centang ringkas!
   - Setiap slide wajib mengombinasikan:
     a) **Paragraf Deskripsi & Uraian Mendalam (Metode Narasi Teks Lengkap)**: Tuliskan 1 hingga 2 paragraf deskriptif utuh (3-5 kalimat komprehensif, akademis, dan bernas) yang menjelaskan latar belakang, teori dasar, logika konsep, dan signifikansinya secara menyeluruh. TULIS LANGSUNG DALAM BENTUK PARAGRAF TEKS BIASA TANPA TANDA BULLET.
     b) **Poin Kunci & Karakteristik (Key Takeaways)**: 2-3 poin penting terstruktur menggunakan format \`- **[Label Kunci]**: [Penjelasan spesifik]\`.
     c) **Studi Kasus / Penerapan Riil / Contoh Konkret**: 1 blok contoh aplikatif dunia nyata atau studi kasus industri. Jika materi pemrograman/IT, sertakan blok kode rapi (\`\`\`python ... \`\`\`).
3. JUMLAH SLIDE FLEKSIBEL & WAJIB TUNTAS:
   - Jumlah slide TIDAK DIBATASI KAKU (jangan dibatasi hanya 1-2 slide atau 5 slide). Wajib membuat seluruh rangkaian slide dari awal sampai akhir secara komprehensif (minimal 6 hingga 10+ slide terstruktur) sehingga mencakup seluruh pokok bahasan tuntas dari pengantar, konsep inti, prinsip kerja/sintaks, studi kasus kontekstual, hingga rangkuman dan refleksi penutup.
   - DILARANG BERHENTI DI TENGAH JALAN: Seluruh slide wajib dituliskan tuntas sampai bagian penutup dan apresiasi akhir.
   - Tuliskan REAL PEMBAHASAN MATERI SECARA MENDALAM yang siap dibaca, dipahami, dan dipelajari oleh siswa di proyektor kelas.
4. STRUKTUR FORMAT SLIDE WAJIB MENGGUNAKAN HEADING RESMI DI BARIS BARU:
   Setiap slide WAJIB diawali dengan heading: \`### Slide [Nomor]: [Judul Slide Lengkap]\` di baris baru agar sistem parser mengenali setiap slide secara sempurna. Contoh struktur format ideal:

   ### Slide 1: [Judul Topik Pembelajaran yang Lengkap & Formal]
   Subjudul: [Tagline Pembelajaran Kontekstual yang Jelas]

   [Uraian pengantar komprehensif 1-2 paragraf mengenai fokus materi yang akan dipelajari pada presentasi ini, relevansinya bagi peserta didik, serta peta jalan pembahasan.]

   Poin Kunci:
   - **Tujuan Pembelajaran**: [Target kompetensi esensial yang akan dikuasai peserta didik.]
   - **Peta Konsep**: [Ringkasan cakupan materi dari awal hingga akhir.]

   ### Slide 2: [Latar Belakang & Definisi Konsep Inti]
   Subjudul: [Tagline Konseptual yang Menarik]

   [Uraian paragraf narasi mendalam 1-2 paragraf (3-5 kalimat) yang menjelaskan sejarah lahirnya konsep, permasalahan awal yang memicu penemuannya, dan bagaimana konsep ini berevolusi menjadi standar penting di dunia modern.]

   Poin Kunci:
   - **Landasan Teori**: [Penjelasan rinci mengenai terminologi kunci dan prinsip dasar.]
   - **Karakteristik Kunci**: [Faktor pembeda utama konsep ini dibandingkan metode konvensional.]

   Studi Kasus:
   [Uraian contoh konkret penerapan nyata di industri atau kehidupan sehari-hari, bagaimana konsep ini memecahkan masalah nyata.]

   ### Slide 3: [Prinsip Kerja & Mekanisme Operasional]
   Subjudul: [Tagline Cara Kerja Sistematis]

   [Uraian paragraf deskriptif lengkap mengenai alur mekanisme kerja, logika langkah-demi-langkah, dan korelasi antar komponen saat konsep dijalankan.]

   Poin Kunci:
   - **Komponen Utama**: [Penjabaran elemen atau variabel pembangun sistem.]
   - **Alur Eksekusi**: [Tahapan sistematis dari input, proses pemrosesan, hingga output.]

   Studi Kasus:
   [Contoh nyata implementasi atau skenario pemecahan masalah praktis.]
   (Lanjutkan ke Slide 4, 5, 6, 7 dst. hingga seluruh materi tuntas dibahas secara mendalam)

ATURAN KHUSUS PERINTAH @generate_ilustrasi:
Jika pengguna menyertakan tag "@generate_ilustrasi" atau meminta pembuatan ilustrasi/gambar/diagram materi:
1. Analisis konsep materi dan gaya visual dari konfigurasi outline yang dipilih guru (misal: Flat Educational, 3D Educational, Modern Vector, Infografis Bertingkat, dsb.) serta rasio aspeknya.
2. Jelaskan konsep visual tersebut secara komprehensif dalam bahasa Indonesia (tujuan pembelajaran, elemen diagram/objek utama, dan rekomendasi penggunaan di kelas).
3. DI BAGIAN PALING AKHIR JAWABAN, WAJIB sertakan blok kode khusus yang mendeskripsikan prompt visual untuk engine image generator (FLUX.1) dalam format berikut:
\`\`\`ai_image_prompt
[Deskripsi prompt visual konkret dalam Bahasa Inggris untuk model difusi FLUX.1. Wajib sebutkan elemen fisik/diagram spesifik: jika materi pemrograman/algoritma, sebutkan flowchart belah ketupat diamond decision node, panah hijau TRUE dan panah merah FALSE ke kotak aksi proses; jika materi biologi/sains, sebutkan penampang diagram berlabel; tata letak clean white background, educational textbook vector infographic, high contrast, no watermark, no logo, no blurry artifacts, no abstract rings]
\`\`\``;

// ==============================================================================
// 2. HELPER FUNCTIONS & DIRECT IMAGE GENERATION (FLUX.1 SCHNELL / SERVERLESS)
// ==============================================================================

const GenerateChatImageInputSchema = z.object({
  prompt: z.string().min(3),
  aspectRatio: z.enum(["16:9", "1:1", "4:3", "9:16", "3:4"]).optional().default("16:9"),
  style: z.string().optional().default("vector"),
});

export interface GenerateChatImageResponse {
  imageUrl: string;
  prompt: string;
  aspectRatio: string;
  provider: string;
  model: string;
}

function resolveImageDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9":
      return { width: 1024, height: 576 };
    case "9:16":
      return { width: 576, height: 1024 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

function resolveImageStylePrompt(style: string): string {
  switch (style) {
    case "flat":
      return "flat 2D educational vector art, clean student-friendly shapes, vibrant balanced pastel colors";
    case "3d":
      return "3D rounded Pixar-style educational animation render, soft studio lighting, pedagogical clarity, high fidelity";
    case "infographic":
      return "modern digital infographic diagram layout, step-by-step process flowchart, numbered badges, clean graphic markers, high readability";
    case "handdrawn":
      return "gentle hand-drawn artistic colored pencil textbook sketch, soft warm watercolor tones";
    case "chalkboard":
      return "classroom chalkboard chalk diagram sketch, neat annotations, clean outlines";
    case "vector":
    default:
      return "clean educational vector line art, precise geometric diagram, modern textbook illustration";
  }
}

/**
 * Offline curriculum knowledge fallback:
 * Maps Indonesian lesson concepts to verified English visual diagram scene prompts.
 */
export function fallbackTopicToEnglishPrompt(topic: string, style: string = "vector"): string {
  const t = topic.toLowerCase();
  if (/if[-_ ]?else|percabangan|kondisi|logika|percabangan if/i.test(t)) {
    return "A clean 2D educational flowchart infographic diagram of an IF-ELSE conditional logic branch in computer science. Top oval START node leading to a central diamond decision block with condition query, branching into a bright green TRUE arrow and a bright red FALSE arrow leading to rectangular action boxes, terminating at an oval END node. Minimalist flat vector layout on a clean white background, high contrast textbook diagram, pedagogical clarity, no watermarks, no blurry artifacts.";
  }
  if (/perulangan|looping|for loop|while loop/i.test(t)) {
    return "A clean 2D educational vector flowchart illustrating a programming loop algorithm (FOR and WHILE loop). Rectangular initialization box, central diamond loop condition check, circular return loop body, flat educational textbook design on white background, no watermarks.";
  }
  if (/algoritma|flowchart|diagram alur/i.test(t)) {
    return "A clear educational flowchart diagram illustrating a step-by-step programming algorithm. Rounded start and end nodes, rectangular process blocks, diamond decision blocks, labeled arrows, flat modern textbook vector design on white background, no watermarks.";
  }
  if (/jaringan|komputer|network|topologi/i.test(t)) {
    return "A clean educational diagram of a computer network topology, showing connected workstations, central router, switch, and cloud server, flat 2D vector style on white background, no watermarks.";
  }
  if (/fotosintesis|klorofil|daun|stomata/i.test(t)) {
    return "A clean educational vector diagram of plant photosynthesis. Cross-section of a green leaf showing chloroplasts, sunlight rays, water absorption from roots, carbon dioxide entry, and oxygen release. Textbook infographic style on clean white background, high readability, no watermarks.";
  }
  if (/sel\b|sel tumbuhan|sel hewan|organel/i.test(t)) {
    return "A detailed educational vector cross-section diagram of a biological cell with labeled nucleus, mitochondria, cytoplasm, and cell membrane. Textbook illustration on clean white background, no watermarks.";
  }
  if (/tatasurya|planet|astronomi|orbit/i.test(t)) {
    return "An educational vector infographic of the solar system with the sun and orbiting planets in scale, vibrant clean colors, labeled orbits, educational astronomy textbook illustration, no watermarks.";
  }
  if (/siklus air|hidrologi|daur air/i.test(t)) {
    return "A clear educational textbook diagram illustrating the water cycle: evaporation from ocean, cloud condensation, precipitation rain over mountains, runoff streams, clean flat vector art, no watermarks.";
  }
  if (/newton|gaya|gerak|fisika/i.test(t)) {
    return "An educational physics diagram showing a block on a surface with clearly labeled force vectors for applied force, gravity, normal force, and friction, clean textbook infographic on white background, no watermarks.";
  }
  if (/pancasila|garuda/i.test(t)) {
    return "An educational textbook vector illustration of the Indonesian Garuda Pancasila national emblem, clean golden shield with the five national principles symbols, clean crisp flat graphic, no watermarks.";
  }

  const cleanTopic = topic
    .replace(/@generate_ilustrasi/gi, "")
    .replace(/buatkan.*?(?:tentang|gambar|ilustrasi)/gi, "")
    .replace(/^[:\-–\s]+/, "")
    .trim();

  return `A clean, professional educational textbook vector illustration explaining ${cleanTopic || topic}. Modern flat vector art, clear pedagogical composition, soft balanced colors, clean white background, high readability for school students, no watermarks, no blur, no text artifacts.`;
}

/**
 * Autonomous AI Art Director:
 * Uses Gemini Flash to translate Indonesian lesson topics into highly descriptive
 * English scene prompts for FLUX.1 with concrete pedagogical elements.
 */
export async function synthesizeEducationalVisualPrompt(
  rawInput: string,
  style: string = "vector",
  contextMateri?: string
): Promise<string> {
  const cleaned = rawInput.replace(/@generate_ilustrasi/gi, "").trim();
  if (!cleaned) {
    return fallbackTopicToEnglishPrompt("Konsep Pembelajaran", style);
  }

  // If already a detailed English prompt (>15 words with visual terms), use directly
  const words = cleaned.split(/\s+/);
  const isEnglishVisual =
    words.length >= 15 &&
    !/[^\x00-\x7F]/.test(cleaned) &&
    /diagram|flowchart|vector|illustration|node|arrow|infographic/i.test(cleaned);
  if (isEnglishVisual) {
    return cleaned;
  }

  // 1. Synthesize via Gemini Flash
  try {
    const config = resolveServerAiConfig();
    const systemPrompt = `You are an Educational Visual Art Director for an AI image generator (FLUX.1).
Transform Indonesian school lesson topics (Kurikulum Merdeka) into a highly specific, concrete English image prompt for an educational textbook illustration or infographic diagram.

CRITICAL RULES:
1. Output ONLY the English prompt description. No preamble, no quotes, no markdown, no conversational filler.
2. Concrete Educational Elements: NEVER output abstract circles, blurry rings, or vague decorations.
   - For programming/logic (IF-ELSE, Percabangan, Looping, Algoritma): Explicitly describe a clear 2D flowchart diagram with Start/End oval nodes, central Diamond decision block ('Condition?'), branching green YES and red NO arrows leading to rectangular action boxes, clean minimalist vector layout.
   - For science/biology (Fotosintesis, Sel, Organ): Describe a clean cross-section textbook diagram with labeled structures.
   - For physics/math: Describe clean geometric vectors, coordinate axes, and diagrams.
   - For social/history: Describe a clear pedagogical scene in clean vector textbook art.
3. Keep it within 50-70 words. Mention: clean white background, high pedagogical readability, flat educational vector infographic, no watermark, no logo, no blurry artifacts.`;

    const userMsg = `Transform this topic into an English FLUX.1 prompt: "${cleaned}" (Visual Style: ${style})${
      contextMateri ? `\nLesson Context: "${contextMateri.slice(0, 400)}"` : ""
    }`;

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const json = (await res.json()) as any;
      const synthesized = json?.choices?.[0]?.message?.content?.trim();
      if (synthesized && synthesized.length > 20) {
        return synthesized.replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch (err) {
    console.warn("[synthesizeEducationalVisualPrompt] Gemini synthesis fallback:", err);
  }

  // 2. High-reliability deterministic fallback
  return fallbackTopicToEnglishPrompt(cleaned, style);
}

export async function executeDirectImageRender(
  prompt: string,
  aspectRatio: "16:9" | "1:1" | "4:3" | "9:16" | "3:4" = "16:9",
  style: string = "vector",
  contextMateri?: string
): Promise<GenerateChatImageResponse> {
  const dim = resolveImageDimensions(aspectRatio);
  const stylePrompt = resolveImageStylePrompt(style);

  // 1. Synthesize educational visual prompt into concrete English scene
  const synthesizedEnglishPrompt = await synthesizeEducationalVisualPrompt(prompt, style, contextMateri);

  // 2. Prompt enhancement for clean educational graphics
  const enhancedPrompt = `${synthesizedEnglishPrompt}, ${stylePrompt}, high resolution, sharp outlines, educational textbook visual diagram, no watermark, no logo, no blur`;

  let imageBuffer: Buffer | null = null;
  let mimeType = "image/jpeg";
  let providerUsed = "FLUX.1 (Serverless Engine)";

  // 3. Render with Pollinations FLUX.1 (100% Free, Zero Billing Required)
  const safePrompt = encodeURIComponent(enhancedPrompt.slice(0, 800));
  const pollUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=${dim.width}&height=${dim.height}&nologo=true&model=flux`;

  const pRes = await fetch(pollUrl, { signal: AbortSignal.timeout(60000) });
  if (!pRes.ok) {
    throw new Error(`Gagal menghasilkan gambar dari engine FLUX (${pRes.status}).`);
  }
  mimeType = pRes.headers.get("content-type") || "image/jpeg";
  const pAb = await pRes.arrayBuffer();
  if (pAb.byteLength < 512) {
    throw new Error("Hasil gambar terlalu kecil atau korup.");
  }
  imageBuffer = Buffer.from(pAb);

  const b64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;

  return {
    imageUrl: dataUrl,
    prompt,
    aspectRatio,
    provider: providerUsed,
    model: "black-forest-labs/FLUX.1",
  };
}

export const analisisLampiranMateriServerFn = createServerFn({
  method: "POST",
})
  .validator((input: unknown) => {
    const parsed = AnalisisLampiranInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Format data lampiran tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<AnalisisLampiranResponse> => {
    // 1. Handling for image/photo (Gemini Vision)
    if (data.type === "image") {
      if (!data.base64Data) {
        throw new Error("Berkas foto atau gambar kosong.");
      }
      const config = resolveServerAiConfig();
      const visionPayload = {
        model: config.model || "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Anda adalah GuruPro AI Vision & Analis Bahan Ajar. Tugas Anda adalah membaca, mentranskripsikan, dan menganalisis secara detail seluruh materi pembelajaran, ringkasan buku paket, tulisan papan tulis, catatan guru, rumus, diagram alur, tabel, atau butir soal yang tampak pada foto/gambar yang dilampirkan guru. Tuliskan transkripsi lengkap dan terstruktur dalam bahasa Indonesia yang siap diolah menjadi Modul Ajar Kurikulum Merdeka, Slide Presentasi PPT, maupun Media Ilustrasi.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Tolong baca, transkripsikan, dan ekstrak seluruh materi pembelajaran yang ada pada foto/gambar ini secara mendalam, rinci, dan terstruktur:",
              },
              {
                type: "image_url",
                image_url: {
                  url: data.base64Data,
                },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      };

      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify(visionPayload),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        let errDesc = "";
        try {
          const eb = await res.json();
          errDesc = eb?.error?.message || "";
        } catch {}
        throw new Error(
          `Gagal menganalisis foto/gambar dengan AI Vision (${res.status}): ${errDesc || res.statusText}`
        );
      }

      const json = (await res.json()) as any;
      const extractedText = json.choices?.[0]?.message?.content?.trim() || "";
      if (!extractedText) {
        throw new Error("AI tidak mendeteksi teks atau konten pembelajaran yang jelas pada foto tersebut.");
      }

      const lines = extractedText.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const firstLine = lines[0]?.replace(/^[#*\s\-–—:]+/, "").slice(0, 50).trim();
      const title = firstLine || data.fileName?.replace(/\.[^/.]+$/, "") || "Materi dari Foto Lampiran";
      const words = extractedText.split(/\s+/).filter(Boolean).length;
      const summary = extractedText.slice(0, 220).replace(/\n+/g, " ") + "...";

      return {
        title,
        summary,
        extractedText,
        wordCount: words,
        type: "image",
        fileName: data.fileName || "foto-materi.jpg",
        imageUrl: data.base64Data,
      };
    }

    // 2. Handling for document (.pdf, .docx, .txt, .md, .html)
    if (data.type === "document") {
      if (!data.base64Data) {
        throw new Error("Berkas dokumen kosong.");
      }
      const cleanB64 = data.base64Data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanB64, "base64");
      const lowerName = (data.fileName || "").toLowerCase();

      let extractedText = "";
      let title = data.fileName?.replace(/\.[^/.]+$/, "") || "Dokumen Materi";

      if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
        extractedText = buffer.toString("utf-8");
      } else {
        const docRes = await extractDocumentText({
          buffer,
          fileName: data.fileName || "dokumen",
          mimeType: data.fileType,
        });
        extractedText = docRes.text;
        if (docRes.suggestedTopic) title = docRes.suggestedTopic;
        else if (docRes.title) title = docRes.title;
      }

      if (!extractedText || extractedText.trim().length < 20) {
        throw new Error("Dokumen tidak memuat teks yang dapat diekstrak atau dokumen terlindungi kata sandi.");
      }

      const words = extractedText.split(/\s+/).filter(Boolean).length;
      const summary = extractedText.slice(0, 220).replace(/\n+/g, " ") + "...";

      return {
        title,
        summary,
        extractedText,
        wordCount: words,
        type: "document",
        fileName: data.fileName,
      };
    }

    // 3. Handling for manual text
    const raw = (data.rawText || "").trim();
    if (!raw || raw.length < 20) {
      throw new Error("Teks rujukan terlalu pendek (minimal 20 karakter).");
    }
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^[#*\s\-–—:]+/, "").slice(0, 50).trim() || "Catatan Rujukan Guru";
    const words = raw.split(/\s+/).filter(Boolean).length;
    const summary = raw.slice(0, 220).replace(/\n+/g, " ") + "...";

    return {
      title,
      summary,
      extractedText: raw,
      wordCount: words,
      type: "text",
    };
  });

export const chatWithGuruAiServerFn = createServerFn({
  method: "POST",
})
  .validator((input: unknown) => {
    const parsed = ChatInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Format pesan percakapan tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<ChatResponse> => {
    const config = resolveServerAiConfig();

    const conversationMessages = [
      { role: "system", content: SYSTEM_PROMPT_GURUPRO },
    ];

    if (data.contextMateri && data.contextMateri.trim()) {
      conversationMessages.push({
        role: "system",
        content: `Konteks Bahan Ajar Guru yang dilampirkan:\n${data.contextMateri.trim()}`,
      });
    }

    if (data.outlineSettings) {
      const parts: string[] = [];
      if (data.outlineSettings.pptStyle) {
        parts.push(`- Template Gaya Slide Presentasi (PPT): ${data.outlineSettings.pptStyle} (Jumlah slide fleksibel & mendalam sesuai keluasan materi)`);
      }
      if (data.outlineSettings.illustrationStyle) {
        parts.push(`- Gaya Visual Ilustrasi Edukasi: ${data.outlineSettings.illustrationStyle} (Rasio: ${data.outlineSettings.illustrationAspect || "16:9"})`);
      }
      if (parts.length > 0) {
        conversationMessages.push({
          role: "system",
          content: `Panduan Konfigurasi Outline & Gaya Aktif Pilihan Guru:\n${parts.join("\n")}\nInstruksi: Bila guru meminta pembuatan modul ajar, slide presentasi PPT, atau ilustrasi gambar (termasuk tag @generate_ilustrasi, @generate_ppt, @generate_modul), sesuaikan struktur, nuansa bahasa, dan kedalaman materi dengan konfigurasi aktif di atas. Guru sendirilah yang menentukan sasaran kelas dan metode pembelajaran di kelasnya, sehingga buatlah modul dan slide secara lengkap, komprehensif, dan sedetail mungkin.`,
        });
      }
    }

    // Append last 10 messages for context, attaching visual multimodal payload if present
    const recentMessages = data.messages.slice(-10);
    if (data.attachedImage && recentMessages.length > 0) {
      const cloned = [...recentMessages];
      const lastUserIdx = cloned.length - 1;
      const lastMsg = cloned[lastUserIdx];
      if (lastMsg && lastMsg.role === "user") {
        cloned[lastUserIdx] = {
          role: "user",
          content: [
            { type: "text", text: String(lastMsg.content) },
            {
              type: "image_url",
              image_url: { url: data.attachedImage },
            },
          ] as any,
        };
      }
      conversationMessages.push(...cloned);
    } else {
      conversationMessages.push(...recentMessages);
    }

    // Multi-model resilient cascade
    const candidateModels =
      config.provider === "gemini"
        ? [config.model, "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        : [config.model];

    const uniqueCandidates = Array.from(new Set(candidateModels));
    let lastError: Error | null = null;

    for (const modelCandidate of uniqueCandidates) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(config.endpoint, {
            method: "POST",
            headers: config.headers,
            body: JSON.stringify({
              model: modelCandidate,
              messages: conversationMessages,
              temperature: 0.7,
              max_tokens: 6500,
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (!res.ok) {
            let errBody: any = {};
            try {
              errBody = await res.json();
            } catch {}
            const errMsg =
              errBody?.error?.message || `HTTP ${res.status}: ${res.statusText}`;

            // Transient error retry (503 High Demand, 429 Rate Limit, 500+)
            if (
              res.status === 503 ||
              res.status === 429 ||
              res.status >= 500 ||
              errMsg.toLowerCase().includes("overloaded") ||
              errMsg.toLowerCase().includes("service unavailable")
            ) {
              lastError = new Error(errMsg);
              await new Promise((r) => setTimeout(r, 1000 * attempt));
              continue;
            }

            throw new Error(`Layanan AI mengembalikan error: ${errMsg}`);
          }

          const json = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };

          let reply = json.choices?.[0]?.message?.content?.trim();
          if (reply) {
            const lastUserMsg = data.messages.slice(-1)[0]?.content || "";
            const hasGenerateIlustrasiTag = /@generate_ilustrasi/i.test(lastUserMsg);
            const isIlustrasiIntent =
              hasGenerateIlustrasiTag ||
              /buatkan (?:sebuah )?(?:gambar|ilustrasi|diagram)|generate (?:sebuah )?(?:gambar|ilustrasi)|visualisasi materi/i.test(lastUserMsg);

            // Check if AI included the ```ai_image_prompt block
            const promptMatch = reply.match(/```(?:ai_image_prompt|image_prompt)\s*([\s\S]*?)```/i);
            let imagePromptToRun: string | null = promptMatch ? promptMatch[1].trim() : null;

            if (!imagePromptToRun && isIlustrasiIntent) {
              const cleanUserText = lastUserMsg.replace(/@generate_ilustrasi/gi, "").trim();
              imagePromptToRun = cleanUserText || "Materi Pembelajaran";
            }

            let generatedImageUrl: string | undefined;
            let generatedImagePrompt: string | undefined;

            if (imagePromptToRun) {
              // Strip the ```ai_image_prompt``` block from the displayed text reply so the teacher sees a clean chat
              if (promptMatch) {
                reply = reply.replace(/```(?:ai_image_prompt|image_prompt)\s*[\s\S]*?```/i, "").trim();
              }

              const aspect = (data.outlineSettings?.illustrationAspect || "16:9") as any;
              const style = data.outlineSettings?.illustrationStyle || "vector";

              try {
                const imgRes = await executeDirectImageRender(
                  imagePromptToRun,
                  aspect,
                  style,
                  data.contextMateri || reply.slice(0, 500)
                );
                if (imgRes && imgRes.imageUrl) {
                  generatedImageUrl = imgRes.imageUrl;
                  generatedImagePrompt = lastUserMsg.replace(/@generate_ilustrasi/gi, "").trim() || imgRes.prompt;
                }
              } catch (imgErr) {
                console.warn("[chatWithGuruAiServerFn] Direct image generation error:", imgErr);
              }
            }

            return {
              reply,
              model: modelCandidate,
              provider: config.provider,
              imageUrl: generatedImageUrl,
              imagePrompt: generatedImagePrompt,
            };
          }
        } catch (err: any) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(
      lastError?.message
        ? `Layanan AI sedang sibuk (${lastError.message}). Silakan kirim ulang dalam beberapa detik.`
        : "Layanan AI sedang sibuk. Silakan coba sesaat lagi."
    );
  });

export const generateChatImageServerFn = createServerFn({
  method: "POST",
})
  .validator((input: unknown) => {
    const parsed = GenerateChatImageInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Parameter prompt gambar tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<GenerateChatImageResponse> => {
    return executeDirectImageRender(data.prompt, data.aspectRatio, data.style);
  });
