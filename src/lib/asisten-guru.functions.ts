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
