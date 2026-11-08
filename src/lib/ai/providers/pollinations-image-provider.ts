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
    const outline = (request as any).approvedOutline || (request as any).outlineSnapshot || {};
    
    // Extract core subject, points, and style
    const topic = (outline.mainSubject || outline.title || request.assembledPrompt?.subjectDescription || "")
      .replace(/^(\d+[\.\)]|\s*Bab\s*\d+:?)\s*/i, "")
      .replace(/^Ilustrasi:\s*/i, "")
      .trim();

    const supporting = Array.isArray(outline.supportingElements) && outline.supportingElements.length > 0
      ? outline.supportingElements.join(", ")
      : "";

    const details = Array.isArray(outline.importantVisualDetails) && outline.importantVisualDetails.length > 0
      ? outline.importantVisualDetails.join("; ")
      : "";

    const avoidList = Array.isArray(outline.thingsToAvoid) && outline.thingsToAvoid.length > 0
      ? outline.thingsToAvoid
      : [
          "Peta dunia atau bola dunia (globe) acak yang tidak berhubungan dengan topik",
          "Ruang kelas kosong",
          "Meja rapat kantor",
          "Teks berjejal",
          "Distorsi bentuk",
        ];

    const styleName =
      request.styleDefinition?.name ||
      request.assembledPrompt?.styleDirectives?.split(".")[0]?.replace("Style Name: ", "") ||
      "Flat Educational Vector";

    // 1. Attempt prompt refinement via intelligent LLM synthesis (Pollinations Text or Gemini)
    const promptInstruction = `You are an expert educational illustrator and technical prompt engineer for text-to-image models.
A teacher has designed and APPROVED a specific visual outline for an educational textbook lesson.
Your mission is to translate and synthesize this APPROVED OUTLINE into a rich, cohesive, faithful visual prompt in English (45 to 70 words).

TEACHER'S APPROVED OUTLINE (Strict Ground Truth):
- Lesson Subject: ${topic}
- Educational Focus: ${outline.educationalFocus || topic}
- Required Supporting Elements: ${supporting || topic}
- Key Visual Details from Lesson: ${details || topic}
- Visual Setting & Background: ${outline.environmentBackground || "Clean, high-contrast white pedagogical background"}
- Composition: ${outline.composition || "Balanced composition"}
- Visual Style: ${styleName}

CRITICAL RULES:
1. FIDELITY: Accurately depict the EXACT educational subject, authentic Indonesian national/civic symbols (e.g. Garuda Pancasila shield, heraldic emblems), or technical/scientific objects specified in the outline.
2. POSITIVE PROMPT ONLY: Describe ONLY what must be drawn. NEVER mention the words 'avoid', 'negative', 'do not', 'world map', 'globe', or include negative clauses.
3. VECTOR TEXTBOOK STYLE: Describe a flat 2D educational vector illustration for an Indonesian school textbook, vibrant colors, isolated on crisp clean white background, high contrast, crisp graphic design.
Output ONLY the raw descriptive prompt text, no quotes, no markdown.`;

    // Try free resilient Pollinations text endpoint first (or Gemini if available)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await this.fetchFn("https://text.pollinations.ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are an expert prompt engineer for educational illustrations. Output only raw descriptive prompt." },
            { role: "user", content: promptInstruction },
          ],
          model: "openai",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const candidate = (await res.text()).trim();
        if (candidate && candidate.length > 20 && !candidate.startsWith("{") && !candidate.startsWith("<")) {
          // Clean quotes and ensure no negative words
          const cleanPrompt = candidate
            .replace(/^["'`]|["'`]$/g, "")
            .replace(/\b(?:avoid|do not depict|negative prompt)\b.*$/i, "")
            .trim();
          if (cleanPrompt.length > 20) {
            return cleanPrompt.substring(0, 800);
          }
        }
      }
    } catch (pollErr: any) {
      console.warn("[PollinationsImageProvider] Pollinations text refinement notice:", pollErr.message);
    }

    // Secondary attempt via Gemini if key is available
    const geminiKey = this.geminiApiKey || getServerEnv("GEMINI_API_KEY");
    if (geminiKey && topic) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const geminiRes = await this.fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: promptInstruction }],
              }],
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidate && candidate.length > 20) {
            return candidate.replace(/^["'`]|["'`]$/g, "").replace(/\b(?:avoid|do not depict)\b.*$/i, "").trim().substring(0, 800);
          }
        }
      } catch (geminiErr: any) {
        console.warn("[PollinationsImageProvider] Gemini prompt refinement notice:", geminiErr.message);
      }
    }

    // 2. High-quality deterministic fallback prompt synthesis (Zero negative prompt keywords)
    const cleanBoilerplate = (str: string) =>
      str
        .replace(/dunia\s*(?:kerja|usaha|industri|dudi)/gi, "professional workshop")
        .replace(/ruang\s*kelas/gi, "")
        .replace(/lingkungan\s*kontekstual/gi, "")
        .replace(/terapan\s*materi/gi, "")
        .replace(/ruang\s*lingkup/gi, "")
        .replace(/standar\s*kompetensi/gi, "")
        .replace(/urgensi\s*pemahaman/gi, "")
        .replace(/relevansi\s*terhadap/gi, "")
        .replace(/tujuan\s*(?:umum|pembelajaran)/gi, "")
        .replace(/peta\s*dunia|bola\s*dunia|globe/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    let cleanTopic = cleanBoilerplate(topic || "Educational subject");
    let cleanElements = cleanBoilerplate(supporting || "");
    let cleanDetails = cleanBoilerplate(details || "");

    // Map common Indonesian curriculum topics to rich English educational terms
    const domainKeywords: Record<string, string> = {
      // PKn / Civics
      pancasila: "Garuda Pancasila national emblem, golden eagle, five heraldic symbols red and white shield, star, chain, banyan tree, bull head, rice and cotton, Bhinneka Tunggal Ika banner",
      garuda: "Garuda Pancasila golden eagle national emblem with red and white shield on chest",
      norma: "Indonesian civic harmony, diverse citizens practicing legal justice, moral ethics, and social courtesy",
      uud: "Indonesian 1945 constitution document, scales of justice, national civic order",
      hukum: "scales of justice, legal gavel, Indonesian law book, civic order",
      demokrasi: "democratic voting booth, citizen casting ballot in ballot box, civic participation",
      "gotong royong": "Indonesian community members working together harmoniously, cleaning village, mutual cooperation",
      "warga negara": "responsible Indonesian citizens, students in school uniforms, respectful community cooperation",
      hak: "balance of civic rights and responsibilities, scales of justice, community harmony",
      kewajiban: "civic duties, traffic discipline at traffic light, paying taxes, obeying laws",
      // Sejarah
      proklamasi: "Soekarno and Hatta reading 1945 Indonesian proclamation of independence manuscript with microphone and Indonesian flag",
      rengasdengklok: "historical discussion table in wooden house, Soekarno Hatta and youth leaders with proclamation draft and typewriter",
      "sumpah pemuda": "1928 youth pledge congress, passionate Indonesian historical youth delegates raising flag",
      kemerdekaan: "Indonesian independence celebration, red and white flag hoisting, national heroes",
      // Biologi / IPA
      pernapasan: "human respiratory system anatomy diagram, lungs, trachea, bronchus, alveoli gas exchange detail",
      paru: "human lungs and alveoli anatomy diagram, oxygen carbon dioxide exchange",
      ekskresi: "human excretory system diagram, kidneys, nephron, bladder anatomy",
      ginjal: "human kidney anatomy diagram, cortex, medulla, nephron filtration unit",
      darah: "human circulatory system diagram, heart chambers, arteries, veins blood flow",
      jantung: "human heart anatomy cross section diagram, atria, ventricles, cardiac valves",
      pencernaan: "human digestive system anatomy diagram, stomach, intestines, liver",
      sel: "biological cell anatomy diagram, nucleus, mitochondria, cell membrane",
      fotosintesis: "plant photosynthesis diagram, sunlight, chloroplast, glucose and oxygen cycle",
      ekosistem: "ecological food web diagram, producers, consumers, decomposers in natural habitat",
      "rantai makanan": "food chain diagram, grass, herbivores, predators, decomposers with trophic level arrows",
      tumbuhan: "plant anatomy diagram, roots, stem, leaves, flower reproductive organs",
      // Fisika / Kimia
      atom: "atomic structure diagram, central nucleus with protons and neutrons, orbiting electrons in energy shells",
      molekul: "chemical molecular 3D ball-and-stick model, covalent bonds, atoms",
      kimia: "chemistry laboratory apparatus, beakers, test tubes, chemical reaction formula diagram",
      listrik: "electrical circuit diagram, battery source, copper wires, resistors, switch, lightbulb",
      magnet: "magnetic field lines diagram around bar magnet, north and south poles, iron filings",
      "tata surya": "solar system diagram, glowing sun, eight orbiting planets in sequential order",
      tata_surya: "solar system diagram, glowing sun, eight orbiting planets in sequential order",
      gaya: "physics force vectors diagram, applied force, gravity, friction, normal force arrows",
      newton: "Sir Isaac Newton laws of motion demonstration diagram, action-reaction force vectors",
      // Matematika
      geometri: "geometric 3D shapes collection, cube, sphere, cylinder, cone, pyramid with dimension lines",
      pecahan: "fraction visual pie chart and bar models showing numerator and denominator divisions",
      grafik: "mathematical Cartesian coordinate plane with labeled X and Y axes and linear function line",
      statistika: "statistical bar graph, line chart, data distribution diagram with clear axes",
      // Jaringan & Komputer
      internet: "computer network architecture, data packets routing through servers and optical cables",
      jaringan: "computer network topology, connected nodes, MikroTik routers, switch, ethernet cables",
      routing: "network static routing topology diagram, multiple routers, client PCs, gateway IP connections",
      hardware: "computer hardware architecture diagram, motherboard, CPU processor, RAM chips, storage",
      perangkat: "computing devices, input output system architecture",
      algoritma: "step by step visual flowchart diagram, clear logic execution blocks",
      // Kejuruan / Bisnis / Teknik
      akuntansi: "accounting ledger worksheet diagram, debit and credit columns, financial balance sheet",
      jurnal: "accounting general journal ledger entry form, double entry bookkeeping format",
      pasar: "economic supply and demand curve graph, market equilibrium price and quantity intersect",
      uang: "financial currency exchange, bank vault, digital banking transactions diagram",
      bisnis: "business planning canvas diagram, revenue streams, customer segments, value proposition flowchart",
      wirausaha: "entrepreneurship visual diagram, innovative product design, artisan workshop tools",
      mesin: "automotive internal combustion engine cutaway diagram, pistons, valves, crankshaft",
      otomotif: "automotive workshop schematic, vehicle powertrain and brake caliper technical diagram",
      las: "welding technician in safety helmet and protective gear operating arc welding tool in workshop",
      listrik_instalasi: "building electrical installation schematic, circuit breaker panel, wiring conduit",
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
    const detailsClause = cleanDetails ? `, details: ${cleanDetails.slice(0, 150)}` : "";

    return `Flat 2D vector graphic design for Indonesian school textbook. Educational infographic illustrating ${visualSubject}${elementsClause}${detailsClause}. Clean graphic lines, vibrant colors, isolated on crisp clean white background, sharp vector details, high pedagogical clarity.`.substring(0, 800);
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
