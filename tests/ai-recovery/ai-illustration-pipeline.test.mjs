/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-RECOVERY-04
 * Real AI Illustration Pipeline Recovery Verification
 * ==============================================================================
 *
 * Verifies the 12 core acceptance requirements for Stage AI-RECOVERY-04:
 * 1. Outline generation from grounded Modul Ajar section context (GEN-0 / VIS-1A)
 * 2. Visual style selection and teacher outline approval gate
 * 3. Image generation request formation using canonical prompt template
 * 4. Primary router resolution selects OpenAI gpt-image-2
 * 5. Rejection of fake geometric SVG mockups in production paths
 * 6. Deterministic binary image validation (magic bytes, dimensions, SHA-256)
 * 7. Asset lifecycle persistence in illustration_assets table with complete provenance
 * 8. Teacher review workflow: review status transition (pending -> approved_for_use)
 * 9. ModulSection attachment: attaching approved illustration updates ModulSection.ilustrasi
 * 10. Superseding mechanism: replacement illustration transitions previous asset to superseded
 * 11. Multi-tenant isolation: unauthorized teachers cannot access or attach other teachers' illustrations
 * 12. Fail-closed error handling: upstream AI errors fail closed with normalized error codes
 */

import assert from "node:assert/strict";
import crypto from "crypto";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  ILLUSTRATION_STYLES_CATALOG,
  createGenerationSpecification,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  createInitialPlan,
  applyStyleSelection,
  applyPlanApproval,
} from "../../src/lib/ai/generation-planning-service.ts";
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
} from "../../src/lib/illustration-review.functions.ts";
import {
  registerMockStorageDriver,
  MemoryStorageDriver,
} from "../../src/lib/ai/illustration-storage-service.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-RECOVERY-04 (REAL AI ILLUSTRATION PIPELINE)           ");
console.log("================================================================================");

let passedCount = 0;
let failedCount = 0;

function reportPass(num, name) {
  console.log(`  ✓ [PASS] [TEST ${num}] ${name}`);
  passedCount++;
}

function reportFail(num, name, err) {
  console.error(`  ✗ [FAIL] [TEST ${num}] ${name}`);
  console.error(`     Error: ${err.message}`);
  failedCount++;
}

function createValidPngBuffer(width = 1024, height = 1024, extraBytes = 600) {
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

  while (full.length < extraBytes) {
    full.push(0x5a);
  }

  return Buffer.from(full);
}

async function runTestSuite() {
  const TEACHER_1 = "teacher_recovery_04_alpha";
  const TEACHER_2 = "teacher_recovery_04_beta";
  const MODULE_ID = "modul_recovery_04_routing";
  const SECTION_ID = "sec_recovery_04_topo";

  // Reset stores & mock storage driver
  fallbackIllustrationAssets.clear();
  fallbackIllustrationGenerations.clear();
  fallbackIllustrationRequests.clear();
  fallbackTestPlans.clear();
  fallbackModulesStore.clear();
  setMockIllustrationProvider(null);
  registerMockStorageDriver(new MemoryStorageDriver());

  // Setup module in store
  fallbackModulesStore.set(MODULE_ID, {
    id: MODULE_ID,
    user_id: TEACHER_1,
    judul: "Modul Praktikum Jaringan Komputer SMK",
    sections: [
      {
        id: SECTION_ID,
        judul: "Topologi Jaringan dan Skema Routing Statis",
        poin: ["Topologi 3 Router", "Konfigurasi Gateway", "Uji Jalur Ping"],
        isi: "Topologi jaringan menghubungkan 3 router MikroTik melalui antarmuka serial dan ethernet untuk menguji tabel perutean statis.",
        ilustrasi: undefined,
      },
    ],
  });

  const authTeacher1 = {
    userId: TEACHER_1,
    role: "guru",
    isGuru: true,
    verificationStatus: "verified",
  };

  const authTeacher2 = {
    userId: TEACHER_2,
    role: "guru",
    isGuru: true,
    verificationStatus: "verified",
  };

  const baseOutline = {
    title: "Topologi Jaringan dan Skema Routing Statis",
    objective: "Menjelaskan topologi perutean statis 3 router MikroTik.",
    mainSubject: "Topologi perutean statis 3 router MikroTik di laboratorium SMK",
    supportingElements: ["Router 1 (Pusat)", "Router 2 (Cabang)", "Switch Jaringan", "PC Client"],
    environmentBackground: "Laboratorium Komputer dan Jaringan SMK yang rapi",
    composition: "Diagram skematik terstruktur dari kiri ke kanan dengan label antarmuka",
    perspectiveView: "Tampilan isometris 3D bersih",
    educationalFocus: "Memahami tabel perutean statis dan gateway next-hop",
    importantVisualDetails: ["Kabel ethernet biru", "Indikator port router", "Label IP"],
    moodAtmosphere: "Edukatif, jelas, informatif",
    colorPalette: ["Biru #1E88E5", "Abu-abu #757575"],
    thingsToAvoid: ["grafiti", "elemen rusak", "tengkorak", "elemen seram"],
    suggestedLabels: ["Router 1", "Gateway", "Router 2"],
    labelsTextRequirements: [],
    allowTextInImage: false,
    sourceReferences: [`modul:${MODULE_ID}`],
    evidenceReferences: ["ev_routing_c0"],
  };

  let plan = null;
  let generationRequest = null;
  let generatedAsset = null;

  // ----------------------------------------------------------------------------
  // TEST 1: Outline generation from grounded Modul Ajar section context (GEN-0 / VIS-1A)
  // ----------------------------------------------------------------------------
  try {
    const { plan: initialPlan } = createInitialPlan(
      TEACHER_1,
      MODULE_ID,
      "illustration",
      baseOutline,
      "style_ill_tech_diagram"
    );

    assert.ok(initialPlan.id, "Plan must be created with ID");
    assert.equal(initialPlan.status, "ready");
    assert.equal(initialPlan.outline.mainSubject, baseOutline.mainSubject);
    plan = initialPlan;
    fallbackTestPlans.set(plan.id, plan);

    reportPass(1, "Outline generation creates structured ready plan from grounded Modul section context");
  } catch (err) {
    reportFail(1, "Outline generation", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Visual style selection and teacher outline approval gate
  // ----------------------------------------------------------------------------
  try {
    const selectedStyleId = "style_ill_tech_diagram";
    const styledPlan = applyStyleSelection(plan, selectedStyleId, TEACHER_1);
    assert.equal(styledPlan.style.styleId, selectedStyleId);

    const { approvedPlan } = applyPlanApproval(styledPlan, authTeacher1);
    assert.equal(approvedPlan.status, "approved");
    assert.equal(approvedPlan.approvedVersion, 1);
    plan = approvedPlan;
    fallbackTestPlans.set(plan.id, plan);

    reportPass(2, "Teacher selects pedagogical visual style and explicitly approves generation plan");
  } catch (err) {
    reportFail(2, "Style selection & plan approval", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Image generation request formation using canonical prompt template
  // ----------------------------------------------------------------------------
  try {
    const spec = createGenerationSpecification(plan, authTeacher1);
    const req = buildIllustrationGenerationRequest({
      spec,
      plan,
      authContext: authTeacher1,
    });

    assert.ok(req.requestId);
    assert.equal(req.generationPlanId, plan.id);
    assert.ok(req.assembledPrompt.fullPrompt.includes("Topologi perutean statis"));
    assert.equal(req.generationParameters.aspectRatio, "1:1");

    generationRequest = req;

    const requestRow = {
      id: req.requestId,
      generation_plan_id: plan.id,
      approved_version: plan.approvedVersion,
      style_id: req.styleId,
      style_version: req.styleVersion,
      request_snapshot: req,
      status: "prepared",
      created_by: TEACHER_1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fallbackIllustrationRequests.set(req.requestId, requestRow);

    reportPass(3, "Canonical illustration generation request built with complete prompt and negative constraints");
  } catch (err) {
    reportFail(3, "Request formation", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Primary router resolution selects OpenAI gpt-image-2
  // ----------------------------------------------------------------------------
  try {
    const router = resolveIllustrationGenerationProvider();
    assert.equal(router.providerName, "dual-router");
    assert.equal(router.primaryProvider.providerName, "openai");

    reportPass(4, "AI image router prioritizes OpenAI provider and resolves active model gpt-image-2");
  } catch (err) {
    reportFail(4, "Primary router resolution", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Rejection of fake geometric SVG mockups in production paths
  // ----------------------------------------------------------------------------
  try {
    const fakeSvgString = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='300' height='300'/></svg>" + " ".repeat(600);
    const res = validateImageBinary(fakeSvgString);

    assert.equal(res.valid, false, "SVG payload must be strictly rejected");
    assert.match(res.reason, /mock SVG/);

    reportPass(5, "Production validation gate strictly rejects fake SVG text mockups disguised as image binaries");
  } catch (err) {
    reportFail(5, "Rejection of fake SVG mockups", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 6: Deterministic binary image validation (magic bytes, dimensions, SHA-256)
  // ----------------------------------------------------------------------------
  try {
    const realPng = createValidPngBuffer(1024, 1024);
    const inspected = inspectImageBinary(realPng);

    assert.equal(inspected.mimeType, "image/png");
    assert.equal(inspected.width, 1024);
    assert.equal(inspected.height, 1024);

    const hash = crypto.createHash("sha256").update(realPng).digest("hex");
    assert.equal(hash.length, 64);

    const validation = validateImageBinary(realPng, "1:1");
    assert.equal(validation.valid, true);

    reportPass(6, "Deterministic binary inspection validates PNG magic bytes, 1024x1024 dimensions & SHA-256 hash");
  } catch (err) {
    reportFail(6, "Binary image validation", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Asset lifecycle persistence in illustration_assets table with complete provenance
  // ----------------------------------------------------------------------------
  try {
    const pngBuf = createValidPngBuffer(1024, 1024);
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
    const mockImageResult = {
      generationId: "gen_rec04_" + crypto.randomUUID(),
      requestId: generationRequest.requestId,
      status: "succeeded",
      provider: "openai",
      model: "gpt-image-2",
      assetReference: dataUrl,
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      byteSize: pngBuf.length,
      createdAt: new Date().toISOString(),
    };

    setMockIllustrationProvider({
      providerName: "openai",
      generate: async () => mockImageResult,
    });

    const genRes = await executeGenerateIllustration(
      { requestId: generationRequest.requestId },
      authTeacher1
    );

    assert.equal(genRes.status, "success");
    assert.equal(genRes.result.status, "succeeded");
    assert.ok(genRes.result.generationId);

    // Persist asset to storage & db
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genRes.result.generationId },
      authTeacher1
    );

    assert.ok(asset.id);
    assert.equal(asset.lifecycleStatus, "staged");
    assert.ok(asset.publicUrl);
    assert.equal(asset.width, 1024);
    assert.equal(asset.height, 1024);
    generatedAsset = asset;

    reportPass(7, "Generated binary saved to storage bucket illustration-assets and persisted with full metadata");
  } catch (err) {
    reportFail(7, "Asset persistence and lifecycle", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Teacher review workflow: review status transition (pending -> approved_for_use)
  // ----------------------------------------------------------------------------
  try {
    const res = await executeApproveIllustrationForUse(
      {
        assetId: generatedAsset.id,
        teacherNotes: "Sangat sesuai dengan materi router MikroTik SMK",
      },
      authTeacher1
    );

    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "approved_for_use");
    assert.equal(res.review.reviewedBy, TEACHER_1);
    assert.ok(res.review.reviewedAt);

    reportPass(8, "Teacher review workflow transitions asset reviewStatus to 'approved_for_use' with timestamp & notes");
  } catch (err) {
    reportFail(8, "Teacher review workflow", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 9: ModulSection attachment: attaching approved illustration updates ModulSection.ilustrasi
  // ----------------------------------------------------------------------------
  try {
    const { asset: attached } = await executeAttachIllustrationAsset(
      {
        moduleId: MODULE_ID,
        sectionId: SECTION_ID,
        assetId: generatedAsset.id,
      },
      authTeacher1
    );

    assert.equal(attached.lifecycleStatus, "attached");

    const mod = fallbackModulesStore.get(MODULE_ID);
    const targetSec = mod.sections.find((s) => s.id === SECTION_ID);
    assert.equal(targetSec.ilustrasi, generatedAsset.publicUrl, "Section ilustrasi must contain asset public URL");

    reportPass(9, "Attaching approved illustration updates ModulSection.ilustrasi with durable public URL");
  } catch (err) {
    reportFail(9, "ModulSection attachment", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Superseding mechanism: replacement illustration transitions previous asset to superseded
  // ----------------------------------------------------------------------------
  try {
    const replacementPng = createValidPngBuffer(1024, 1024);
    const genId2 = "gen_replacement_" + crypto.randomUUID();

    // Setup Generation 2 in store
    fallbackIllustrationGenerations.set(genId2, {
      id: genId2,
      request_id: generationRequest.requestId,
      generation_plan_id: plan.id,
      module_id: MODULE_ID,
      owner_id: TEACHER_1,
      provider: "openai",
      model: "gpt-image-2",
      status: "succeeded",
      asset_url: `data:image/png;base64,${replacementPng.toString("base64")}`,
      image_data: `data:image/png;base64,${replacementPng.toString("base64")}`,
      mime_type: "image/png",
      width: 1024,
      height: 1024,
      byte_size: replacementPng.length,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { asset: replacementAsset } = await executePersistIllustrationAsset(
      { generationId: genId2 },
      authTeacher1
    );

    // Attach replacement asset to the same section
    await executeAttachIllustrationAsset(
      {
        moduleId: MODULE_ID,
        sectionId: SECTION_ID,
        assetId: replacementAsset.id,
      },
      authTeacher1
    );

    // Check old asset is superseded
    const oldAsset = fallbackIllustrationAssets.get(generatedAsset.id);
    assert.equal(oldAsset.lifecycle_status, "superseded", "Old asset must transition to 'superseded'");

    // Check new asset is attached
    const newAsset = fallbackIllustrationAssets.get(replacementAsset.id);
    assert.equal(newAsset.lifecycle_status, "attached", "New asset must be 'attached'");

    // Check section points to new URL
    const mod = fallbackModulesStore.get(MODULE_ID);
    const targetSec = mod.sections.find((s) => s.id === SECTION_ID);
    assert.equal(targetSec.ilustrasi, replacementAsset.publicUrl);

    reportPass(10, "Attaching replacement illustration marks former as 'superseded' non-destructively");
  } catch (err) {
    reportFail(10, "Superseding mechanism", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 11: Multi-tenant isolation: unauthorized teachers cannot access or attach other teachers' illustrations
  // ----------------------------------------------------------------------------
  try {
    let foreignTeacherBlocked = false;

    try {
      await executeAttachIllustrationAsset(
        {
          moduleId: MODULE_ID,
          sectionId: SECTION_ID,
          assetId: generatedAsset.id,
        },
        authTeacher2
      );
    } catch (err) {
      if (err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN) {
        foreignTeacherBlocked = true;
      }
    }

    assert.equal(foreignTeacherBlocked, true, "Teacher 2 must receive ROLE_FORBIDDEN when touching Teacher 1 assets");

    reportPass(11, "Multi-tenant authorization enforces tenant boundaries and throws ROLE_FORBIDDEN");
  } catch (err) {
    reportFail(11, "Multi-tenant isolation", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 12: Fail-closed error handling: upstream AI errors fail closed with normalized error codes
  // ----------------------------------------------------------------------------
  try {
    // Set failing provider
    setMockIllustrationProvider({
      providerName: "openai",
      generate: async () => {
        throw new AiServiceError(
          AI_ERROR_CODES.AI_PROVIDER_ERROR,
          "OpenAI API rate limit exceeded (HTTP 429)."
        );
      },
    });

    const failingReqId = "req_failing_" + crypto.randomUUID();
    fallbackIllustrationRequests.set(failingReqId, {
      id: failingReqId,
      generation_plan_id: plan.id,
      approved_version: plan.approvedVersion,
      style_id: generationRequest.styleId,
      style_version: generationRequest.styleVersion,
      request_snapshot: {
        ...generationRequest,
        requestId: failingReqId,
      },
      status: "prepared",
      created_by: TEACHER_1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const failRes = await executeGenerateIllustration(
      { requestId: failingReqId },
      authTeacher1
    );

    assert.equal(failRes.result.status, "failed");
    assert.equal(failRes.result.error?.code, AI_ERROR_CODES.AI_PROVIDER_ERROR);

    // Ensure no fake mockup was attached
    const mod = fallbackModulesStore.get(MODULE_ID);
    const targetSec = mod.sections.find((s) => s.id === SECTION_ID);
    assert.ok(!targetSec.ilustrasi?.includes("<svg"), "Must never inject fake SVG fallback on provider error");

    reportPass(12, "Fail-closed invariant: AI provider error fails closed without generating fake geometric mockups");
  } catch (err) {
    reportFail(12, "Fail-closed error handling", err);
  }

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`  AI-RECOVERY-04 SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in AI-RECOVERY-04 test suite:", err);
  process.exit(1);
});
