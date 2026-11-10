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
  outlineSettings: OutlineSettingsSchema,
});

export interface ChatResponse {
  reply: string;
  model: string;
  provider: string;
}

const SYSTEM_PROMPT_GURUPRO = `Anda adalah "GuruPro AI Asisten Guru", asisten kecerdasan buatan profesional yang dirancang khusus untuk mendampingi guru-guru di Indonesia dalam merancang pembelajaran Kurikulum Merdeka.

Peran & Keahlian Utama:
1. Penyusunan Modul Ajar, RPP, dan Alur Tujuan Pembelajaran (ATP) yang terstruktur dan aplikatif.
2. Perancangan bahan ajar interaktif, ide presentasi slide PPT, dan Lembar Kerja Peserta Didik (LKPD).
3. Perancangan konsep ilustrasi edukatif dan diagram alur pembelajaran yang jelas.
4. Pembuatan soal asesmen HOTS (Higher Order Thinking Skills) lengkap dengan rubrik.

Pedoman Kerapian & Format Penulisan (SANGAT PENTING):
1. DILARANG MENGGUNAKAN DIAGRAM TEKS / ASCII ART: Jangan pernah menggambar diagram alur dengan karakter simbol keyboard (seperti garis |, panah v, atau kurung /---\\). Sebagai gantinya, jelaskan alur logika menggunakan tahapan bernomor yang runtut dan rapi (Langkah 1, Langkah 2, dst.).
2. HINDARI SIMBOL DAN TANDA BACA BERLEBIHAN: Jangan memenuhi teks dengan tanda kutip ganda beruntun, tanda kurung placeholder yang berlebihan, atau teks yang membingungkan. Buat kalimat mengalir alami dan nyaman dibaca langsung oleh guru.
3. BLOK KODE YANG RAPI: Tuliskan contoh kode program di dalam blok kode rapi (misal: \`\`\`python atau \`\`\`cpp) lengkap dengan penjelasan baris penting.
4. STRUKTUR YANG SISTEMATIS: Gunakan tingkatan sub-judul yang rapi (# untuk Judul Utama, ## untuk Bagian, ### untuk Sub-bagian), gunakan poin bulat yang tertata, dan tabel untuk perbandingan.
5. FORMAT SLIDE PRESENTASI (JIKA DIMINTA): Susun setiap slide dengan format jelas:
   ### Slide [Nomor]: [Judul Slide]
   - **Poin Utama:** (butir-butir ringkas)
   - **Arah Visual / Catatan Presenter:** (penjelasan visual)
6. FORMAT SOAL HOTS (JIKA DIMINTA): Berikan nomor soal, stimulus kasus nyata, pilihan jawaban A sampai E, kunci jawaban, serta pembahasan.
7. TUNTAS & SELESAI: Pastikan jawaban selesai tuntas sampai bagian penutup dan tidak terpotong di tengah kalimat.
8. Berbicaralah dengan bahasa Indonesia yang ramah, sopan, dan profesional (sapa pengguna dengan "Bapak/Ibu Guru").`;

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
        parts.push(`- Template Gaya Slide Presentasi (PPT): ${data.outlineSettings.pptStyle} (Target: ${data.outlineSettings.slideCount || 5} slide)`);
      }
      if (data.outlineSettings.illustrationStyle) {
        parts.push(`- Gaya Visual Ilustrasi Edukasi: ${data.outlineSettings.illustrationStyle} (Rasio: ${data.outlineSettings.illustrationAspect || "16:9"})`);
      }
      if (data.outlineSettings.jenjang) {
        parts.push(`- Jenjang / Sasaran Siswa: ${data.outlineSettings.jenjang}`);
      }
      if (data.outlineSettings.modelPembelajaran) {
        parts.push(`- Model Pembelajaran: ${data.outlineSettings.modelPembelajaran}`);
      }
      if (parts.length > 0) {
        conversationMessages.push({
          role: "system",
          content: `Panduan Konfigurasi Outline & Gaya Aktif Pilihan Guru:\n${parts.join("\n")}\nInstruksi: Bila guru meminta pembuatan modul ajar, slide presentasi PPT, atau ilustrasi gambar, sesuaikan struktur, nuansa bahasa, dan kedalaman materi dengan konfigurasi aktif di atas.`,
        });
      }
    }

    // Append last 10 messages for context
    const recentMessages = data.messages.slice(-10);
    conversationMessages.push(...recentMessages);

    // Multi-model resilient cascade
    const candidateModels =
      config.provider === "gemini"
        ? [config.model, "gemini-3.5-flash", "gemini-3.6-flash"]
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
              max_tokens: 3500,
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

          const reply = json.choices?.[0]?.message?.content?.trim();
          if (reply) {
            return {
              reply,
              model: modelCandidate,
              provider: config.provider,
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
