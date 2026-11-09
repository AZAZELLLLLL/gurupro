/**
 * ==============================================================================
 * GURUPRO AI: HUGGING FACE IMAGE GENERATION PROVIDER (FLUX.1-SCHNELL / SDXL)
 * ==============================================================================
 *
 * Implements the IllustrationGenerationProvider boundary interface for Hugging Face
 * Serverless Inference API (such as black-forest-labs/FLUX.1-schnell).
 *
 * Features:
 * - 100% Free tier support using HF user access token (HF_TOKEN)
 * - Zero watermarks, zero logos (pure binary raster output)
 * - Pedagogical prompt grounding from approved Modul Ajar outline
 * - Bounded retry policy on model-loading (503) or transient errors
 * - Image binary validation before marking as succeeded
 */

import { AI_ERROR_CODES, AiServiceError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import { assertValidImageBinary } from "../image-validator";
import type {
  IllustrationGenerationProvider,
  IllustrationGenerationRequest,
  IllustrationGenerationResult,
  IllustrationAspectRatio,
} from "../illustration-generation-contract";

const MAX_BOUNDED_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 60000;

export interface HuggingFaceImageProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class HuggingFaceImageProvider implements IllustrationGenerationProvider {
  readonly providerName = "huggingface";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: HuggingFaceImageProviderOptions) {
    this.apiKey =
      options?.apiKey ||
      getServerEnv("HF_TOKEN") ||
      getServerEnv("HUGGINGFACE_API_KEY");
    this.model =
      options?.model ||
      getServerEnv("HF_IMAGE_MODEL") ||
      "black-forest-labs/FLUX.1-schnell";
    this.baseUrl =
      options?.baseUrl ||
      getServerEnv("HF_INFERENCE_ENDPOINT") ||
      "https://router.huggingface.co/hf-inference/models";
    this.fetchFn = options?.fetchFn || globalThis.fetch;
  }

  private resolveDimensions(aspectRatio: IllustrationAspectRatio): { width: number; height: number } {
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

  async validateRequest(
    request: IllustrationGenerationRequest
  ): Promise<{ valid: boolean; reason?: string }> {
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

  private isTransientError(status: number, message: string): boolean {
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    const lower = message.toLowerCase();
    if (
      lower.includes("timeout") ||
      lower.includes("loading") ||
      lower.includes("econnreset") ||
      lower.includes("rate limit")
    ) {
      return true;
    }
    return false;
  }

  async generate(
    request: IllustrationGenerationRequest
  ): Promise<IllustrationGenerationResult> {
    const key = this.apiKey;
    if (!key) {
      throw new AiServiceError(
        AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
        "Token Hugging Face (HF_TOKEN) belum dikonfigurasi di file .env server."
      );
    }

    const validation = await this.validateRequest(request);
    if (!validation.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        validation.reason || "Permintaan generasi gambar tidak valid."
      );
    }

    const promptParts = [request.assembledPrompt.fullPrompt];
    if (request.textPolicy.mustNotAppear && request.textPolicy.mustNotAppear.length > 0) {
      promptParts.push(
        `Negative: do not include ${request.textPolicy.mustNotAppear.join(", ")}`
      );
    }
    if (!request.textPolicy.allowModelInventedText) {
      promptParts.push(
        "Clean graphic composition, educational textbook vector illustration, high clarity."
      );
    }

    const fullPrompt = promptParts.join(". ");
    const dim = this.resolveDimensions(request.generationParameters.aspectRatio);

    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/${this.model}`;

    let attempt = 0;
    let lastError: Error | null = null;
    let rawBuffer: Buffer | null = null;
    let mimeType = "image/png";

    while (attempt <= MAX_BOUNDED_RETRIES) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const res = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key.trim()}`,
            "Content-Type": "application/json",
            "x-use-cache": "false",
          },
          body: JSON.stringify({
            inputs: fullPrompt,
            parameters: {
              width: dim.width,
              height: dim.height,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          let errData: any = {};
          try {
            errData = await res.json();
          } catch {}

          const status = res.status;
          const errMsg = errData?.error || `Hugging Face API HTTP ${status}: ${res.statusText}`;

          if (status === 401 || status === 403) {
            return {
              generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
              requestId: request.requestId,
              status: "failed",
              provider: this.providerName,
              model: this.model,
              createdAt: new Date().toISOString(),
              error: {
                code: AI_ERROR_CODES.AI_PROVIDER_ERROR,
                message:
                  "Token Hugging Face (HF_TOKEN) tidak valid atau belum memiliki izin 'Inference'. Pastikan token dibuat dengan preset Inference di huggingface.co.",
                isRetryable: false,
              },
            };
          }

          // If model is still loading (status 503)
          if (status === 503 && errData?.estimated_time) {
            const waitSec = Math.min(Math.ceil(errData.estimated_time), 15);
            console.log(`[HuggingFace] Model ${this.model} is loading. Waiting ${waitSec}s...`);
            await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
            continue;
          }

          if (this.isTransientError(status, errMsg) && attempt <= MAX_BOUNDED_RETRIES) {
            lastError = new Error(errMsg);
            await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
            continue;
          }

          return {
            generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
            requestId: request.requestId,
            status: "failed",
            provider: this.providerName,
            model: this.model,
            createdAt: new Date().toISOString(),
            error: {
              code: AI_ERROR_CODES.AI_PROVIDER_ERROR,
              message: errMsg,
              isRetryable: this.isTransientError(status, errMsg),
            },
          };
        }

        mimeType = res.headers.get("content-type") || "image/png";
        const arrayBuf = await res.arrayBuffer();
        rawBuffer = Buffer.from(arrayBuf);
        break;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
        const errMsg = isTimeout
          ? `Koneksi ke Hugging Face Inference API timeout (${DEFAULT_TIMEOUT_MS}ms).`
          : err.message || "Kegagalan jaringan ke Hugging Face.";

        if (attempt <= MAX_BOUNDED_RETRIES) {
          lastError = new Error(errMsg);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
          continue;
        }

        return {
          generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
          requestId: request.requestId,
          status: "failed",
          provider: this.providerName,
          model: this.model,
          createdAt: new Date().toISOString(),
          error: {
            code: isTimeout ? AI_ERROR_CODES.AI_TIMEOUT : AI_ERROR_CODES.AI_PROVIDER_ERROR,
            message: errMsg,
            isRetryable: true,
          },
        };
      }
    }

    if (!rawBuffer || rawBuffer.length < 512) {
      return {
        generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: new Date().toISOString(),
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: lastError?.message || "Hugging Face tidak mengembalikan binary gambar yang valid.",
          isRetryable: false,
        },
      };
    }

    const b64Data = rawBuffer.toString("base64");
    const assetRef = `data:${mimeType};base64,${b64Data}`;

    try {
      const val = assertValidImageBinary(b64Data, request.generationParameters.aspectRatio);
      return {
        generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
        requestId: request.requestId,
        status: "succeeded",
        assetReference: assetRef,
        mimeType: val.mimeType,
        width: val.width,
        height: val.height,
        provider: this.providerName,
        model: this.model,
        createdAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: new Date().toISOString(),
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: `Validasi binary gambar Hugging Face gagal: ${err.message}`,
          isRetryable: false,
        },
      };
    }
  }

  normalizeResult(
    rawOutput: any,
    request: IllustrationGenerationRequest
  ): IllustrationGenerationResult {
    return {
      generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
      requestId: request.requestId,
      status: "succeeded",
      assetReference: rawOutput.assetReference,
      mimeType: rawOutput.mimeType || "image/png",
      width: rawOutput.width || 1024,
      height: rawOutput.height || 1024,
      provider: this.providerName,
      model: this.model,
      createdAt: new Date().toISOString(),
    };
  }
}
