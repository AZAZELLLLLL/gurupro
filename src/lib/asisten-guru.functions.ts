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

const ChatInputSchema = z.object({
  messages: z.array(ChatMessageSchema),
  contextMateri: z.string().optional(),
});

export interface ChatResponse {
  reply: string;
  model: string;
  provider: string;
}

const SYSTEM_PROMPT_GURUPRO = `Anda adalah "GuruPro AI Asisten Guru", asisten kecerdasan buatan profesional yang dirancang khusus untuk mendampingi guru-guru di Indonesia dalam merancang pembelajaran Kurikulum Merdeka.

Peran & Keahlian Anda:
1. Penyusunan Modul Ajar, RPP, dan Alur Tujuan Pembelajaran (ATP) yang berpusat pada siswa (student-centered).
2. Perancangan bahan ajar interaktif, ide presentasi slide PPT, dan lembar kerja peserta didik (LKPD).
3. Perancangan ide ilustrasi edukatif, diagram alur (flowchart), dan infografis visual yang jelas dan pedagogis.
4. Pembuatan soal asesmen HOTS (Higher Order Thinking Skills), kuis formatif, dan rubrik asesmen autentik.
5. Pendekatan pembelajaran aktif seperti Problem-Based Learning (PBL) dan Project-Based Learning (PjBL).

Pedoman Komunikasi:
- Berbicaralah dengan bahasa Indonesia yang ramah, sopan, terstruktur, dan profesional (sapa pengguna dengan "Bapak/Ibu Guru").
- Gunakan format Markdown yang rapi (judul, poin-poin tebal, tabel, dan contoh konkret).
- Jika guru meminta dibuatkan modul atau materi, berikan konten yang substantif, mendalam, dan langsung siap dipakai di kelas.
- Berikan saran tindak lanjut atau tawaran bantuan berikutnya di akhir jawaban (misal: "Apakah Bapak/Ibu ingin saya buatkan juga contoh soal asesmen atau rangkuman slide presentasi untuk materi ini?").`;

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
