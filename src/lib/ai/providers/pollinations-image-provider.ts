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
}

export class PollinationsImageProvider implements IllustrationGenerationProvider {
  readonly providerName = "pollinations";
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: PollinationsImageProviderOptions) {
    this.model = options?.model || "flux";
    this.baseUrl = options?.baseUrl || "https://image.pollinations.ai";
    this.fetchFn = options?.fetchFn || globalThis.fetch;
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

  private buildPromptString(request: IllustrationGenerationRequest): string {
    const raw = request.assembledPrompt.fullPrompt || "";
    // Clean prompt for public text-to-image models
    const cleaned = raw
      .replace(/\[SYSTEM_INSTRUCTION\]:?[^[\n]*/gi, "")
      .replace(/\[VISUAL_STYLE\]:?/gi, "")
      .replace(/\[EDUCATIONAL_SUBJECT\]:?/gi, "")
      .replace(/\[PEDAGOGICAL_PURPOSE\]:?/gi, "")
      .replace(/\[COMPOSITION_RULES\]:?/gi, "")
      .replace(/\[COLOR_PALETTE\]:?/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const subject = cleaned.length > 20 ? cleaned : `Educational illustration for ${request.generationParameters.aspectRatio || "classroom"}`;
    return subject.substring(0, 1000);
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
    const promptText = this.buildPromptString(request);
    const encodedPrompt = encodeURIComponent(promptText);
    const seed = Math.floor(Math.random() * 1000000);
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${this.model}&nologo=true&seed=${seed}`;

    const genId = `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const now = new Date().toISOString();

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= MAX_BOUNDED_RETRIES) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const res = await this.fetchFn(endpoint, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Pollinations API returned HTTP ${res.status}: ${res.statusText}`);
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
          model: this.model,
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
      model: this.model,
      createdAt: now,
      error: {
        code: AI_ERROR_CODES.GENERATION_FAILED,
        message: `Gagal menghasilkan ilustrasi via provider ${this.providerName}: ${lastError?.message || "Koneksi timeout"}`,
        isRetryable: true,
      },
    };
  }
}
