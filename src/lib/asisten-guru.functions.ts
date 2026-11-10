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
4. STRUKTUR YANG SISTEMATIS: Gunakan tingkatan sub-judul yang rapi (# untuk Judul Utama, ## untuk Bagian, ### untuk Sub-bagian), gunakan poin bulat yang tertata, dan tabel untuk perbandingan.
5. FORMAT SLIDE PRESENTASI (JIKA DIMINTA / @generate_ppt): Susun setiap slide dengan format jelas:
   ### Slide [Nomor]: [Judul Slide]
   - **Poin Utama:** (butir-butir ringkas)
   - **Arah Visual / Catatan Presenter:** (penjelasan visual)
6. FORMAT SOAL HOTS (JIKA DIMINTA): Berikan nomor soal, stimulus kasus nyata, pilihan jawaban A sampai E, kunci jawaban, serta pembahasan.
7. TUNTAS & SELESAI: Pastikan jawaban selesai tuntas sampai bagian penutup dan tidak terpotong di tengah kalimat.
8. Berbicaralah dengan bahasa Indonesia yang ramah, sopan, dan profesional (sapa pengguna dengan "Bapak/Ibu Guru").

ATURAN KHUSUS PERINTAH @generate_ilustrasi:
Jika pengguna menyertakan tag "@generate_ilustrasi" atau meminta pembuatan ilustrasi/gambar/diagram materi:
1. Analisis konsep materi dan gaya visual dari konfigurasi outline yang dipilih guru (misal: Flat Educational, 3D Educational, Modern Vector, Infografis Bertingkat, dsb.) serta rasio aspeknya.
2. Jelaskan konsep visual tersebut secara komprehensif dalam bahasa Indonesia (tujuan pembelajaran, elemen diagram/objek utama, dan rekomendasi penggunaan di kelas).
3. DI BAGIAN PALING AKHIR JAWABAN, WAJIB sertakan blok kode khusus yang mendeskripsikan prompt visual untuk engine image generator (FLUX.1) dalam format berikut:
\`\`\`ai_image_prompt
[Deskripsi prompt gambar dalam Bahasa Inggris yang sangat mendetail untuk model difusi FLUX.1. Sebutkan subjek, gaya visual sesuai outline, tata letak, warna kontras edukatif, kualitas tinggi, educational vector textbook diagram, no watermark, no text artifacts]
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

export async function executeDirectImageRender(
  prompt: string,
  aspectRatio: "16:9" | "1:1" | "4:3" | "9:16" | "3:4" = "16:9",
  style: string = "vector"
): Promise<GenerateChatImageResponse> {
  const hfToken = process.env.HF_TOKEN || process.env.HG_API_KEY || "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";
  const dim = resolveImageDimensions(aspectRatio);
  const stylePrompt = resolveImageStylePrompt(style);

  // Prompt enhancement for clean educational graphics
  const enhancedPrompt = `${prompt}, ${stylePrompt}, high resolution, clear outlines, educational visual diagram, no watermark, no logo, no blur`;

  let imageBuffer: Buffer | null = null;
  let mimeType = "image/jpeg";
  let providerUsed = "FLUX.1-schnell (Hugging Face)";

  // 1. Try Hugging Face Inference router
  try {
    const hfRes = await fetch("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken.trim()}`,
        "Content-Type": "application/json",
        "x-use-cache": "false",
      },
      body: JSON.stringify({
        inputs: enhancedPrompt,
        parameters: { width: dim.width, height: dim.height },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (hfRes.ok) {
      mimeType = hfRes.headers.get("content-type") || "image/png";
      const ab = await hfRes.arrayBuffer();
      if (ab.byteLength > 1024) {
        imageBuffer = Buffer.from(ab);
      }
    }
  } catch (hfErr) {
    console.warn("[executeDirectImageRender] HF inference attempt:", hfErr);
  }

  // 2. High-resilience failover to Pollinations FLUX.1 (100% Free, Zero Billing Required)
  if (!imageBuffer) {
    providerUsed = "FLUX.1 (Serverless Engine)";
    const safePrompt = encodeURIComponent(enhancedPrompt.slice(0, 400));
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
  }

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
          content: `Panduan Konfigurasi Outline & Gaya Aktif Pilihan Guru:\n${parts.join("\n")}\nInstruksi: Bila guru meminta pembuatan modul ajar, slide presentasi PPT, atau ilustrasi gambar (termasuk tag @generate_ilustrasi, @generate_ppt, @generate_modul), sesuaikan struktur, nuansa bahasa, dan kedalaman materi dengan konfigurasi aktif di atas.`,
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
              if (cleanUserText) {
                imagePromptToRun = `${cleanUserText}, clean educational textbook illustration diagram`;
              }
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
                const imgRes = await executeDirectImageRender(imagePromptToRun, aspect, style);
                if (imgRes && imgRes.imageUrl) {
                  generatedImageUrl = imgRes.imageUrl;
                  generatedImagePrompt = imgRes.prompt;
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
