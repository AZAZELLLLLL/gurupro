/**
 * ==============================================================================
 * GURUPRO AI: POLLINATIONS IMAGE GENERATION PROVIDER ADAPTER (VIS-1B FALLBACK)
 * ==============================================================================
 *
 * Implements the IllustrationGenerationProvider boundary interface using
 * Pollinations.ai (Flux / SDXL model) as a free, resilient, zero-credit-card
 * fallback provider.
 *
 * Features:
 * - Generates real 2D educational raster illustrations (JPEG/PNG)
 * - Zero mock SVG, zero fake HTML
 * - Validated using assertValidImageBinary
 * - Bounded timeouts & transient retries
 * - Seamless drop-in into the router chain
 */

import { AI_ERROR_CODES, AiServiceError } from "../error-taxonomy";
import { assertValidImageBinary } from "../image-validator";
import { getServerEnv } from "../ai-service";
import type {
  IllustrationGenerationProvider,
  IllustrationGenerationRequest,
  IllustrationGenerationResult,
  IllustrationAspectRatio,
} from "../illustration-generation-contract";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_BOUNDED_RETRIES = 2;

export interface PollinationsImageProviderOptions {
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  geminiApiKey?: string;
}

export class PollinationsImageProvider implements IllustrationGenerationProvider {
  readonly providerName = "pollinations";
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly geminiApiKey?: string;

  constructor(options?: PollinationsImageProviderOptions) {
    this.model = options?.model || "flux";
    this.baseUrl = options?.baseUrl || "https://image.pollinations.ai";
    this.fetchFn = options?.fetchFn || globalThis.fetch;
    this.geminiApiKey = options?.geminiApiKey || getServerEnv("GEMINI_API_KEY");
  }

  private resolveDimensions(aspectRatio: IllustrationAspectRatio): { width: number; height: number } {
    switch (aspectRatio) {
      case "16:9":
        return { width: 1280, height: 720 };
      case "9:16":
        return { width: 720, height: 1280 };
      case "4:3":
        return { width: 1024, height: 768 };
      case "3:4":
        return { width: 768, height: 1024 };
      case "1:1":
      default:
        return { width: 1024, height: 1024 };
    }
  }

  async validateRequest(request: IllustrationGenerationRequest): Promise<{ valid: boolean; reason?: string }> {
    if (!request) {
      return { valid: false, reason: "Permintaan generasi gambar kosong." };
    }
    if (request.targetType !== "illustration") {
      return {
        valid: false,
        reason: `Target '${request.targetType}' tidak didukung oleh provider gambar.`,
      };
    }
    if (!request.assembledPrompt || !request.assembledPrompt.fullPrompt) {
      return { valid: false, reason: "Prompt terstruktur belum dirakit." };
    }
    return { valid: true };
  }

  private async buildRefinedPrompt(request: IllustrationGenerationRequest): Promise<string> {
    const raw = request.assembledPrompt?.fullPrompt || "";
    const outline = (request as any).outlineSnapshot || {};
    
    // Extract core subject, points, and style
    const topic = (outline.mainSubject || outline.title || request.assembledPrompt?.subjectDescription || "")
      .replace(/^(\d+[\.\)]|\s*Bab\s*\d+:?)\s*/i, "")
      .replace(/^Ilustrasi:\s*/i, "")
      .trim();

    const supporting = Array.isArray(outline.supportingElements) && outline.supportingElements.length > 0
      ? outline.supportingElements.join(", ")
      : "";

    const styleName = request.assembledPrompt?.styleDirectives?.split(".")[0]?.replace("Style Name: ", "") || "Flat Educational";

    // 1. Attempt prompt refinement via active Gemini text model if key is present
    const geminiKey = this.geminiApiKey || getServerEnv("GEMINI_API_KEY");

    if (geminiKey && topic) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const geminiRes = await this.fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are an expert educational illustrator and prompt engineer for student textbook graphics.
Lesson Topic: ${topic}
Key Educational Elements: ${supporting || topic}
Visual Style: ${styleName}

Task: Generate a concise, highly descriptive visual prompt in English (30 to 45 words) suitable for diffusion image models (Flux/SDXL).
CRITICAL RULES:
1. Directly illustrate the specific educational objects, diagrams, technical components, historical devices, or scientific models matching "${topic}".
2. NEVER illustrate an empty classroom, meeting room, generic desk, or boardroom.
3. Use a modern 2D educational vector style with clean shapes, vibrant pedagogical colors, and clean white background.
4. Output ONLY the raw English prompt text, no quotes, no markdown.`
                }]
              }]
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidate && candidate.length > 15) {
            return candidate.replace(/^["'`]|["'`]$/g, "").trim().substring(0, 800);
          }
        }
      } catch (geminiErr: any) {
        console.warn("[PollinationsImageProvider] Gemini prompt refinement notice:", geminiErr.message);
      }
    }

    // 2. High-quality deterministic fallback prompt synthesis
    let cleanTopic = (topic || "Educational subject")
      .replace(/ruang kelas/gi, "")
      .replace(/lingkungan kontekstual/gi, "")
      .replace(/terapan materi/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    let cleanElements = (supporting || "")
      .replace(/ruang kelas/gi, "")
      .replace(/lingkungan kontekstual/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    // Map common topics to rich English educational terms
    const domainKeywords: Record<string, string> = {
      internet: "computer network history, ARPANET mainframe computer, telegraph precursors, data packet routing diagram",
      jaringan: "computer network topology, connected nodes, routers, digital data cables",
      hardware: "computer hardware components, motherboard, CPU, RAM chips diagram",
      perangkat: "computing devices, input output system architecture",
      algoritma: "step by step visual flowchart diagram, clear logic execution blocks",
      sel: "biological cell anatomy diagram, nucleus, mitochondria, cell membrane",
      fotosintesis: "plant photosynthesis diagram, sunlight, chloroplast, glucose and oxygen cycle",
      atom: "atomic structure diagram, central nucleus, orbiting electrons",
    };

    let extraVisuals = "";
    const lowerTopic = cleanTopic.toLowerCase();
    for (const [kw, visual] of Object.entries(domainKeywords)) {
      if (lowerTopic.includes(kw)) {
        extraVisuals = visual;
        break;
      }
    }

    const visualSubject = extraVisuals ? `${cleanTopic} (${extraVisuals})` : cleanTopic;
    const elementsClause = cleanElements ? `, featuring ${cleanElements}` : "";

    return `Flat 2D educational vector infographic illustrating ${visualSubject}${elementsClause}. Modern textbook illustration style, clear pedagogical diagram, vibrant colors, clean white background, high contrast, no empty rooms, no text distortion.`.substring(0, 500);
  }

  async generate(request: IllustrationGenerationRequest): Promise<IllustrationGenerationResult> {
    const validation = await this.validateRequest(request);
    if (!validation.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        validation.reason || "Permintaan generasi ilustrasi tidak valid."
      );
    }

    const { width, height } = this.resolveDimensions(request.generationParameters.aspectRatio);
    const promptText = await this.buildRefinedPrompt(request);
    const encodedPrompt = encodeURIComponent(promptText);

    const genId = `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const now = new Date().toISOString();

    let activeModel = this.model;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= MAX_BOUNDED_RETRIES) {
      attempt++;
      const seed = Math.floor(Math.random() * 1000000);
      const modelQuery = activeModel ? `&model=${activeModel}` : "";
      const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/prompt/${encodedPrompt}?width=${width}&height=${height}${modelQuery}&nologo=true&seed=${seed}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const res = await this.fetchFn(endpoint, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limits or cooldowns
        if (!res.ok) {
          const status = res.status;
          let bodyText = "";
          try {
            bodyText = await res.text();
          } catch {}

          // If flux is rate limited (402 or 429), fall back to default model immediately
          if ((status === 402 || status === 429) && activeModel === "flux") {
            console.warn(`[PollinationsImageProvider] Flux model rate-limited (${status}). Switching to default model...`);
            activeModel = ""; // default model has no flux cooldown
            continue;
          }

          // If cooldown Retry-After is specified and <= 15s, wait and retry
          const retryMatch = bodyText.match(/retry after (\d+)s/i);
          if (retryMatch && parseInt(retryMatch[1], 10) <= 15) {
            const waitSec = parseInt(retryMatch[1], 10);
            console.info(`[PollinationsImageProvider] Cooldown active. Waiting ${waitSec}s before retrying...`);
            await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
            continue;
          }

          throw new Error(`Pollinations API returned HTTP ${status}: ${bodyText || res.statusText}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const b64Data = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = res.headers.get("content-type")?.includes("png") ? "image/png" : "image/jpeg";
        const assetRef = `data:${mimeType};base64,${b64Data}`;

        // Validate binary raster image
        const val = assertValidImageBinary(b64Data, request.generationParameters.aspectRatio);

        return {
          generationId: genId,
          requestId: request.requestId,
          status: "succeeded",
          assetReference: assetRef,
          mimeType: val.mimeType,
          width: val.width,
          height: val.height,
          provider: this.providerName,
          model: activeModel || "default",
          createdAt: now,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        console.warn(`[PollinationsImageProvider] Attempt ${attempt} failed: ${err.message}`);
        if (attempt <= MAX_BOUNDED_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    return {
      generationId: genId,
      requestId: request.requestId,
      status: "failed",
      provider: this.providerName,
      model: activeModel || this.model,
      createdAt: now,
      error: {
        code: AI_ERROR_CODES.GENERATION_FAILED,
        message: `Gagal menghasilkan ilustrasi via provider ${this.providerName}: ${lastError?.message || "Koneksi timeout"}`,
        isRetryable: true,
      },
    };
  }
}
