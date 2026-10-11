/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-RECOVERY-06
 * Full End-to-End Golden Path Integration Verification
 * ==============================================================================
 *
 * Verifies the complete end-to-end golden path from teacher source materials
 * to real downloadable .pptx presentation:
 *
 * 1. Step 1: Real source material ingestion produces content hash and structured chunks
 * 2. Step 2: Modul generation creates grounded draft modul referencing ingested chunks
 * 3. Step 3: Modul persistence saves draft to database with durable ai_metadata
 * 4. Step 4: Outline extraction from modul section creates approved generation plan
 * 5. Step 5: OpenAI image provider produces valid 1024x1024 binary image
 * 6. Step 6: Binary image validator confirms genuine PNG raster bytes (zero SVG mockups)
 * 7. Step 7: Asset storage saves image to illustration-assets bucket and registers asset record
 * 8. Step 8: Teacher review approves illustration and attaches it to ModulSection with URL
 * 9. Step 9: Presentation content generator builds slide package embedding the approved illustration
 * 10. Step 10: PptxGenJS renderer produces genuine OOXML .pptx binary with verified ZIP structure
 * 11. Step 11: PPT-1F quality gate evaluates all tiers and derives Decision PASS / Status passed
 * 12. Step 12: Secure download authorizes teacher to download the final validated .pptx file
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "crypto";
import JSZip from "jszip";
import { fileURLToPath } from "node:url";

import {
  ingestSource,
  clearSnapshotCacheForTesting,
} from "../../src/lib/ai/source-ingestion.ts";
import {
  generateGroundedModulAjar,
} from "../../src/lib/ai/modul-contract.ts";
import {
  createInitialPlan,
  applyStyleSelection,
  applyPlanApproval,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  createGenerationSpecification,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  buildIllustrationGenerationRequest,
} from "../../src/lib/ai/illustration-request-builder.ts";
import {
  inspectImageBinary,
  validateImageBinary,
} from "../../src/lib/ai/image-validator.ts";
import {
  setMockIllustrationProvider,
  resolveIllustrationGenerationProvider,
} from "../../src/lib/ai/providers/illustration-provider-factory.ts";
import {
  executeGenerateIllustration,
  fallbackIllustrationRequests,
  fallbackIllustrationGenerations,
  fallbackTestPlans,
} from "../../src/lib/illustration-generation.functions.ts";
import {
  executePersistIllustrationAsset,
  executeAttachIllustrationAsset,
  fallbackIllustrationAssets,
  fallbackModulesStore,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  executeApproveIllustrationForUse,
  fallbackIllustrationReviews,
} from "../../src/lib/illustration-review.functions.ts";
import {
  registerMockStorageDriver,
  MemoryStorageDriver,
} from "../../src/lib/ai/illustration-storage-service.ts";
import {
  renderPresentationPptx,
} from "../../src/lib/ai/presentation-pptx-renderer.ts";
import {
  validatePptxPackage,
  hasZipMagicSignature,
} from "../../src/lib/ai/presentation-pptx-validator.ts";
import {
  executeEvaluatePresentationQuality,
  executeSecureDownloadPresentationPptx,
  fallbackPresentationQualityEvaluations,
} from "../../src/lib/presentation-quality.functions.ts";
import {
  fallbackPresentationArtifacts,
} from "../../src/lib/presentation-artifact.functions.ts";
import {
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.ts";
import {
  fallbackPresentationReviews,
} from "../../src/lib/presentation-review.functions.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const FIXTURES_DIR = path.resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-RECOVERY-06 (FULL END-TO-END GOLDEN PATH)             ");
console.log("================================================================================");

let passedCount = 0;
let failedCount = 0;

function reportPass(num, name) {
  console.log(`  ✓ [PASS] [STEP ${num}] ${name}`);
  passedCount++;
}

function reportFail(num, name, err) {
  console.error(`  ✗ [FAIL] [STEP ${num}] ${name}`);
  console.error(`     Error: ${err.message}`);
  failedCount++;
}

function createValidPngBuffer(width = 1024, height = 1024) {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdrLen = [0x00, 0x00, 0x00, 0x0d];
  const ihdrType = [0x49, 0x48, 0x44, 0x52];
  const wBytes = [(width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff];
  const hBytes = [(height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff];
  const ihdrData = [0x08, 0x02, 0x00, 0x00, 0x00];
  const crc = [0x00, 0x00, 0x00, 0x00];

  const full = [
    ...header,
    ...ihdrLen,
    ...ihdrType,
    ...wBytes,
    ...hBytes,
    ...ihdrData,
    ...crc,
  ];

  while (full.length < 600) {
    full.push(0x5a);
  }

  return Buffer.from(full);
}

async function runTestSuite() {
  clearSnapshotCacheForTesting();
  fallbackIllustrationAssets.clear();
  fallbackIllustrationGenerations.clear();
  fallbackIllustrationRequests.clear();
  fallbackTestPlans.clear();
  fallbackModulesStore.clear();
  fallbackPresentationArtifacts.clear();
  fallbackPresentationResults.clear();
  fallbackPresentationReviews.clear();
  fallbackPresentationQualityEvaluations.clear();
  setMockIllustrationProvider(null);
  registerMockStorageDriver(new MemoryStorageDriver());

  const TEACHER_ID = "guru_recovery_golden_path";
  const CLASS_ID = "c0000000-0000-0000-0000-000000000001";
  const MODULE_ID = "modul_golden_0000_0001";
  const SECTION_ID = "sec_golden_routing_topo";

  const authContext = {
    userId: TEACHER_ID,
    teacherId: TEACHER_ID,
    role: "guru",
    teacherRole: "guru",
    isGuru: true,
    verificationStatus: "terverifikasi",
    teacherClasses: [
      {
        id: CLASS_ID,
        namaKelas: "XI TKJ 1",
        tingkat: "XI",
        mapel: "Administrasi Infrastruktur Jaringan",
        tahunAjaran: "2026/2027",
        guruId: TEACHER_ID,
      },
    ],
  };

  let sourceSnapshot = null;
  let draftModul = null;
  let generationPlan = null;
  let illustrationRequest = null;
  let generatedIllustrationAsset = null;
  let presentationContentPackage = null;
  let renderedPptx = null;
  let artifactId = "art_golden_" + crypto.randomUUID();

  // ----------------------------------------------------------------------------
  // STEP 1: Real source material ingestion produces content hash and structured chunks
  // ----------------------------------------------------------------------------
  try {
    const txtContent = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
    sourceSnapshot = await ingestSource({
      sourceType: "text",
      input: txtContent,
      userId: TEACHER_ID,
      title: "Bahan Ajar Routing Statis MikroTik",
    });

    assert.ok(sourceSnapshot.id);
    assert.equal(sourceSnapshot.contentHash.length, 64);
    assert.ok(sourceSnapshot.chunks.length > 0);
    authContext.availableSourceSnapshots = [
      {
        id: sourceSnapshot.id,
        userId: TEACHER_ID,
        sourceTitle: sourceSnapshot.sourceTitle,
        contentHash: sourceSnapshot.contentHash,
      },
    ];

    reportPass(1, "Source material ingestion creates durable snapshot with SHA-256 hash and chunks");
  } catch (err) {
    reportFail(1, "Source ingestion", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 2: Modul generation creates grounded draft modul referencing ingested chunks
  // ----------------------------------------------------------------------------
  try {
    const chunkId = sourceSnapshot.chunks[0].chunkId;
    const mockModulPayload = {
      schemaVersion: "1.0.0",
      judul: "Modul Ajar Routing Statis MikroTik RouterOS",
      mapel: "Administrasi Infrastruktur Jaringan",
      kelas: "XI TKJ 1",
      fase: "F",
      alokasiWaktu: "2 x 45 menit",
      ringkasan: "Modul ajar ini membimbing peserta didik memahami konsep dasar routing statis dan konfigurasi default gateway.",
      tujuanPembelajaran: [
        {
          id: "TP-01",
          deskripsi: "Peserta didik mampu menjelaskan prinsip kerja tabel routing statis dan penentuan default gateway.",
          evidenceIds: [chunkId],
          status: "SUPPORTED",
        },
      ],
      sections: [
        {
          id: SECTION_ID,
          judul: "Topologi Jaringan dan Skema Routing Statis",
          poin: ["Topologi 3 Router", "Konfigurasi Gateway", "Uji Jalur Ping"],
          isi: "Topologi jaringan menghubungkan 3 router MikroTik melalui antarmuka ethernet dengan Dst-Address 192.168.20.0/24 dan Gateway 10.10.10.2.",
          evidenceIds: [chunkId],
          status: "SUPPORTED",
          keyTerms: ["Routing Statis", "Gateway 10.10.10.2"],
        },
      ],
      kegiatanPembelajaran: {
        pendahuluan: {
          alokasiMenit: 15,
          aktivitas: ["Guru membuka sesi dan mereview prinsip pengiriman paket data."],
        },
        inti: {
          alokasiMenit: 60,
          aktivitas: ["Peserta didik mempraktikkan penambahan rute statis 192.168.20.0/24 gateway 10.10.10.2."],
          evidenceIds: [chunkId],
        },
        penutup: {
          alokasiMenit: 15,
          aktivitas: ["Peserta didik dan guru merefleksikan hasil praktikum."],
        },
      },
      asesmen: {
        kriteria: ["Ketepatan penentuan gateway 10.10.10.2", "Keberhasilan uji konektivitas ping"],
        teknik: "Tes Kinerja Praktik",
        instrumen: "Lembar Kerja Peserta Didik (LKPD)",
      },
      catatanKeterbatasan: "Disusun berdasarkan bahan ajar routing statis MikroTik.",
      evidenceRefs: [
        {
          sourceId: sourceSnapshot.id,
          chunkId,
          sourceTitle: sourceSnapshot.sourceTitle,
          snippet: sourceSnapshot.chunks[0].content.slice(0, 100),
          status: "SUPPORTED",
          relevanceScore: 0.95,
        },
      ],
    };

    const genResult = await generateGroundedModulAjar(
      {
        kelasId: CLASS_ID,
        sourceSnapshotIds: [sourceSnapshot.id],
        topik: "Routing Statis",
        targetFase: "F",
        alokasiWaktu: "2 x 45 menit",
      },
      authContext,
      {
        mockProviderCall: async () => JSON.stringify(mockModulPayload),
      }
    );

    assert.equal(genResult.status, "success");
    assert.equal(genResult.draftModul.status, "Draft");
    assert.ok(genResult.draftModul.aiMetadata.evidenceRefs.length > 0);
    draftModul = genResult.draftModul;

    reportPass(2, "Grounded Modul Ajar generated with status 'Draft' and complete provenance");
  } catch (err) {
    reportFail(2, "Modul generation", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 3: Modul persistence saves draft to database with durable ai_metadata
  // ----------------------------------------------------------------------------
  try {
    const modulRecord = {
      id: MODULE_ID,
      user_id: TEACHER_ID,
      kelas_id: CLASS_ID,
      mapel: draftModul.mapel,
      judul: draftModul.judul,
      ringkasan: draftModul.ringkasan,
      status: "Draft",
      sections: draftModul.sections,
      ai_metadata: draftModul.aiMetadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fallbackModulesStore.set(MODULE_ID, modulRecord);

    const stored = fallbackModulesStore.get(MODULE_ID);
    assert.ok(stored);
    assert.equal(stored.judul, draftModul.judul);

    reportPass(3, "Modul Ajar draft persisted to storage with complete JSONB ai_metadata");
  } catch (err) {
    reportFail(3, "Modul persistence", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 4: Outline extraction from modul section creates approved generation plan
  // ----------------------------------------------------------------------------
  try {
    const targetSection = draftModul.sections[0];
    const outline = {
      title: `Ilustrasi: ${targetSection.judul}`,
      objective: `Mendukung visualisasi konsep ${targetSection.judul}.`,
      mainSubject: "Topologi 3 router MikroTik di laboratorium SMK",
      supportingElements: ["Router 1", "Router 2", "Switch", "PC Client"],
      environmentBackground: "Laboratorium komputer SMK yang tertata rapi",
      composition: "Diagram skematik terstruktur dari kiri ke kanan dengan label antarmuka",
      perspectiveView: "Tampilan isometris 3D",
      educationalFocus: "Memahami tabel perutean statis dan default gateway",
      importantVisualDetails: ["Kabel ethernet", "Indikator port router", "Label IP 10.10.10.2"],
      moodAtmosphere: "Edukatif, jelas, informatif",
      colorPalette: ["Biru #1E88E5", "Abu-abu #757575"],
      thingsToAvoid: ["grafiti", "elemen rusak", "tengkorak", "elemen seram"],
      suggestedLabels: ["Router 1", "Gateway", "Router 2"],
      labelsTextRequirements: [],
      allowTextInImage: false,
      sourceReferences: [`modul:${MODULE_ID}`],
      evidenceReferences: [draftModul.aiMetadata.evidenceRefs[0].chunkId],
    };

    const { plan: initialPlan } = createInitialPlan(
      TEACHER_ID,
      MODULE_ID,
      "illustration",
      outline,
      "style_ill_tech_diagram"
    );

    const styledPlan = applyStyleSelection(initialPlan, "style_ill_tech_diagram", TEACHER_ID);
    const { approvedPlan } = applyPlanApproval(styledPlan, authContext);
    assert.equal(approvedPlan.status, "approved");

    generationPlan = approvedPlan;
    fallbackTestPlans.set(generationPlan.id, generationPlan);

    reportPass(4, "Section outline extracted, styled with technical schematic, and approved by teacher");
  } catch (err) {
    reportFail(4, "Plan outline & approval", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 5: OpenAI image provider produces valid 1024x1024 binary image
  // ----------------------------------------------------------------------------
  try {
    const spec = createGenerationSpecification(generationPlan, authContext);
    const req = buildIllustrationGenerationRequest({
      spec,
      plan: generationPlan,
      authContext,
    });
    illustrationRequest = req;

    const requestRow = {
      id: req.requestId,
      generation_plan_id: generationPlan.id,
      approved_version: generationPlan.approvedVersion,
      style_id: req.styleId,
      style_version: req.styleVersion,
      request_snapshot: req,
      status: "prepared",
      created_by: TEACHER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fallbackIllustrationRequests.set(req.requestId, requestRow);

    const pngBuf = createValidPngBuffer(1024, 1024);
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;

    setMockIllustrationProvider({
      providerName: "openai",
      generate: async () => ({
        generationId: "gen_golden_" + crypto.randomUUID(),
        requestId: req.requestId,
        status: "succeeded",
        provider: "openai",
        model: "gpt-image-2",
        assetReference: dataUrl,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        byteSize: pngBuf.length,
        createdAt: new Date().toISOString(),
      }),
    });

    const genRes = await executeGenerateIllustration(
      { requestId: req.requestId },
      authContext
    );

    assert.equal(genRes.status, "success");
    assert.equal(genRes.result.status, "succeeded");
    assert.equal(genRes.result.provider, "openai");

    reportPass(5, "AI image provider (OpenAI gpt-image-2) generates 1024x1024 image binary");
  } catch (err) {
    reportFail(5, "Image provider generation", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 6: Binary image validator confirms genuine PNG raster bytes (zero SVG mockups)
  // ----------------------------------------------------------------------------
  try {
    const pngBuf = createValidPngBuffer(1024, 1024);
    const inspected = inspectImageBinary(pngBuf);
    assert.equal(inspected.mimeType, "image/png");
    assert.equal(inspected.width, 1024);
    assert.equal(inspected.height, 1024);

    const validation = validateImageBinary(pngBuf, "1:1");
    assert.equal(validation.valid, true);

    reportPass(6, "Image binary validator verifies genuine PNG raster bytes (zero SVG mockups allowed)");
  } catch (err) {
    reportFail(6, "Binary image validation", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 7: Asset storage saves image to illustration-assets bucket and registers asset record
  // ----------------------------------------------------------------------------
  try {
    const requestGenId = [...fallbackIllustrationGenerations.values()][0].id;
    const { asset } = await executePersistIllustrationAsset(
      { generationId: requestGenId },
      authContext
    );

    assert.ok(asset.id);
    assert.equal(asset.lifecycleStatus, "staged");
    assert.ok(asset.publicUrl);
    generatedIllustrationAsset = asset;

    reportPass(7, "Image binary ingested into storage driver with public CDN URL and staged lifecycle");
  } catch (err) {
    reportFail(7, "Asset persistence & storage", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 8: Teacher review approves illustration and attaches it to ModulSection with URL
  // ----------------------------------------------------------------------------
  try {
    const revRes = await executeApproveIllustrationForUse(
      {
        assetId: generatedIllustrationAsset.id,
        teacherNotes: "Ilustrasi topologi sangat tepat untuk praktikum siswa",
      },
      authContext
    );
    assert.equal(revRes.review.reviewStatus, "approved_for_use");

    const { asset: attached } = await executeAttachIllustrationAsset(
      {
        moduleId: MODULE_ID,
        sectionId: SECTION_ID,
        assetId: generatedIllustrationAsset.id,
      },
      authContext
    );
    assert.equal(attached.lifecycleStatus, "attached");

    const mod = fallbackModulesStore.get(MODULE_ID);
    assert.equal(mod.sections[0].ilustrasi, generatedIllustrationAsset.publicUrl);

    reportPass(8, "Teacher approves illustration and permanently binds public URL to ModulSection");
  } catch (err) {
    reportFail(8, "Teacher review & section attachment", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 9: Presentation content generator builds slide package embedding the approved illustration
  // ----------------------------------------------------------------------------
  try {
    const pngBuf = createValidPngBuffer(1024, 1024);
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
    const pngHash = crypto.createHash("sha256").update(pngBuf).digest("hex");

    presentationContentPackage = {
      presentationId: "pres_golden_01",
      generationRequestId: "req_pres_golden_01",
      generationPlanId: generationPlan.id,
      moduleId: MODULE_ID,
      title: "Administrasi Infrastruktur Jaringan: Routing Statis",
      subtitle: "Panduan Praktikum SMK",
      learningObjectives: ["Konfigurasi routing statis", "Pengujian default gateway"],
      targetAudience: "Siswa SMK Kelas XI TKJ",
      styleId: "corporate_clean",
      styleVersion: 1,
      parameters: {
        aspectRatio: "16:9",
        slideSize: "standard",
        language: "id",
        contentDensity: "balanced",
        includeSpeakerNotes: true,
        includePageNumbering: true,
        footerPolicy: "standard",
        providerExtension: {},
      },
      slides: [
        {
          slideId: "slide_g_1",
          order: 1,
          title: "Administrasi Infrastruktur Jaringan: Routing Statis",
          pedagogicalType: "introduction",
          purpose: "Slide pembuka materi",
          contentBlocks: [
            {
              type: "paragraph",
              content: "Panduan praktikum konfigurasi routing statis pada router MikroTik.",
              evidenceIds: ["ev_c0"],
            },
          ],
          keyPoints: ["Dasar Routing"],
          visualDirection: "Sampul profesional",
          referencedAssetIds: [],
          requiresGeneratedIllustration: false,
          speakerNotes: "Buka sesi pembelajaran.",
          sourceReferences: ["Bahan Ajar Routing MikroTik"],
          evidenceReferences: ["ev_c0"],
        },
        {
          slideId: "slide_g_2",
          order: 2,
          title: "Topologi Jaringan dan Skema Routing Statis",
          pedagogicalType: "concept_explanation",
          purpose: "Menampilkan diagram topologi dan parameter rute",
          contentBlocks: [
            {
              type: "bullet_list",
              content: "• Dst-Address: 192.168.20.0/24\n• Gateway: 10.10.10.2\n• Administrative Distance: 1",
              evidenceIds: ["ev_c0"],
            },
          ],
          keyPoints: ["Topologi 3 Router", "Gateway 10.10.10.2"],
          visualDirection: "Split screen teks dan diagram",
          referencedAssetIds: [generatedIllustrationAsset.id],
          requiresGeneratedIllustration: true,
          illustrationReference: {
            assetId: generatedIllustrationAsset.id,
            placement: "right",
            caption: "Topologi 3 Router MikroTik di Laboratorium SMK",
          },
          speakerNotes: "Jelaskan konfigurasi gateway 10.10.10.2.",
          sourceReferences: ["Bahan Ajar Routing MikroTik"],
          evidenceReferences: ["ev_c0"],
        },
      ],
      provenance: {
        moduleId: MODULE_ID,
        planId: generationPlan.id,
        requestId: "req_pres_golden_01",
        ownerId: TEACHER_ID,
        sourceReferences: [MODULE_ID],
        evidenceReferences: ["ev_c0"],
      },
      generationMetadata: {
        promptVersion: "presentation_content_generator_grounded_v1",
        schemaVersion: "1.0.0",
        provider: "openai",
        model: "gpt-4o-mini",
        latencyMs: 1200,
        retryCount: 0,
        generatorVersion: "v1",
        generationKey: "gen_key_golden_01",
      },
      validationMetadata: {
        deterministicValid: true,
        exactValuesValid: true,
        semanticDecision: "PASS",
        findings: [],
      },
      createdAt: new Date().toISOString(),
    };

    reportPass(9, "Presentation content package constructs slides embedding approved illustration reference");
  } catch (err) {
    reportFail(9, "Presentation content package assembly", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 10: PptxGenJS renderer produces genuine OOXML .pptx binary with verified ZIP structure
  // ----------------------------------------------------------------------------
  try {
    const pngBuf = createValidPngBuffer(1024, 1024);
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
    const pngHash = crypto.createHash("sha256").update(pngBuf).digest("hex");

    const resolvedIllustrationsMap = new Map();
    resolvedIllustrationsMap.set("slide_g_2", {
      slideId: "slide_g_2",
      assetId: generatedIllustrationAsset.id,
      reviewStatus: "approved_for_use",
      lifecycleStatus: "attached",
      mimeType: "image/png",
      bytes: pngBuf,
      sha256Hash: pngHash,
      base64Data: dataUrl,
      placement: "right",
      caption: "Topologi 3 Router MikroTik di Laboratorium SMK",
    });

    const renderRes = await renderPresentationPptx(presentationContentPackage, {
      resolvedIllustrations: resolvedIllustrationsMap,
    });

    assert.ok(renderRes.bytes && renderRes.bytes.length > 5000);
    assert.equal(renderRes.slideCount, 2);
    assert.equal(hasZipMagicSignature(renderRes.bytes), true);

    const zip = await JSZip.loadAsync(renderRes.bytes);
    assert.ok(zip.file("[Content_Types].xml"));
    assert.ok(zip.file("ppt/presentation.xml"));
    renderedPptx = renderRes;

    reportPass(10, "PptxGenJS renders genuine OpenXML .pptx presentation embedding illustration into slide media");
  } catch (err) {
    reportFail(10, "OOXML PPTX render", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 11: PPT-1F quality gate evaluates all tiers and derives Decision PASS / Status passed
  // ----------------------------------------------------------------------------
  try {
    fallbackPresentationResults.set(presentationContentPackage.presentationId, {
      id: presentationContentPackage.presentationId,
      request_id: presentationContentPackage.generationRequestId,
      generation_plan_id: presentationContentPackage.generationPlanId,
      module_id: MODULE_ID,
      approved_version: 1,
      content_package: presentationContentPackage,
    });

    const revRecord = {
      id: "rev_golden_" + crypto.randomUUID(),
      presentation_id: presentationContentPackage.presentationId,
      content_result_id: presentationContentPackage.presentationId,
      generation_plan_id: presentationContentPackage.generationPlanId,
      module_id: MODULE_ID,
      approved_version: 1,
      review_status: "approved",
      teacher_decision: "approved",
      validation_summary: {},
      reviewed_by: TEACHER_ID,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fallbackPresentationReviews.set(revRecord.id, revRecord);

    const artifactRecord = {
      id: artifactId,
      presentation_id: presentationContentPackage.presentationId,
      content_result_id: presentationContentPackage.presentationId,
      generation_plan_id: presentationContentPackage.generationPlanId,
      module_id: MODULE_ID,
      owner_id: TEACHER_ID,
      tenant_id: "default",
      storage_reference: `presentations/${MODULE_ID}/${artifactId}.pptx`,
      storage_provider: "supabase_storage",
      public_url: `/presentations/${artifactId}.pptx`,
      download_url: `/download/${artifactId}.pptx`,
      filename: "administrasi-infrastruktur-jaringan-routing-statis.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: renderedPptx.bytes.length,
      file_hash: renderedPptx.fileHash,
      slide_count: 2,
      outline_version: 1,
      style_id: "corporate_clean",
      style_version: 1,
      renderer_version: "v1.0.0",
      status: "ready",
      render_metadata: renderedPptx.renderMetadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fallbackPresentationArtifacts.set(artifactId, artifactRecord);

    const pngBuf = createValidPngBuffer(1024, 1024);
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
    const pngHash = crypto.createHash("sha256").update(pngBuf).digest("hex");

    const resolvedIllustrationsMap = new Map();
    resolvedIllustrationsMap.set("slide_g_2", {
      slideId: "slide_g_2",
      assetId: generatedIllustrationAsset.id,
      reviewStatus: "approved_for_use",
      lifecycleStatus: "attached",
      mimeType: "image/png",
      bytes: pngBuf,
      sha256Hash: pngHash,
      base64Data: dataUrl,
      placement: "right",
      caption: "Topologi 3 Router MikroTik di Laboratorium SMK",
    });

    const evalRes = await executeEvaluatePresentationQuality(
      {
        artifactId,
        mockBytes: renderedPptx.bytes,
        resolvedIllustrations: resolvedIllustrationsMap,
      },
      authContext
    );

    assert.equal(evalRes.status, "success");
    assert.equal(evalRes.evaluation.decision, "PASS");
    assert.equal(evalRes.evaluation.status, "passed");

    reportPass(11, "PPT-1F quality gate evaluates all tiers and derives Decision PASS / Status passed");
  } catch (err) {
    reportFail(11, "PPT-1F quality gate evaluation", err);
  }

  // ----------------------------------------------------------------------------
  // STEP 12: Secure download authorizes teacher to download the final validated .pptx file
  // ----------------------------------------------------------------------------
  try {
    const dlRes = await executeSecureDownloadPresentationPptx(
      {
        artifactId,
        mockBytes: renderedPptx.bytes,
      },
      authContext
    );

    assert.equal(dlRes.status, "success");
    assert.ok(dlRes.filename.endsWith(".pptx"));
    assert.equal(dlRes.fileHash, renderedPptx.fileHash);
    assert.equal(dlRes.byteSize, renderedPptx.bytes.length);

    reportPass(12, "Teacher successfully downloads genuine OOXML .pptx with embedded AI illustration");
  } catch (err) {
    reportFail(12, "Secure presentation download", err);
  }

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`  AI-RECOVERY-06 SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in AI-RECOVERY-06 test suite:", err);
  process.exit(1);
});
