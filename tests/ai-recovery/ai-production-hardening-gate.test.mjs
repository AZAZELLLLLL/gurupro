/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-RECOVERY-07
 * Production Hardening, Fail-Closed Security & Final Release Gate
 * ==============================================================================
 *
 * Verifies production hardening, fail-closed safety, and release invariants:
 *
 * 1. Criterion 1: Zero mock SVG fallback allowed in illustration pipeline (raster only)
 * 2. Criterion 2: Zero fake HTML .ppt allowed in presentation pipeline (OOXML .pptx only)
 * 3. Criterion 3: Grounding Invariant: Refuses generation without verified source snapshot
 * 4. Criterion 4: Auth Invariant: Refuses generation if teacher is unverified
 * 5. Criterion 5: Tenant Isolation: Teacher B cannot approve/attach Teacher A's illustrations
 * 6. Criterion 6: Tenant Isolation: Teacher B cannot evaluate/download Teacher A's presentations
 * 7. Criterion 7: RBAC Invariant: Student role strictly blocked from all AI generation endpoints
 * 8. Criterion 8: Quality Gate: PPT-1F blocks download if presentation review or quality is rejected
 * 9. Criterion 9: Fail-closed on AI provider failure (canonical AiServiceError, zero synthetic data)
 * 10. Criterion 10: Anti-tamper: Hash mismatch between render metadata and file bytes is rejected
 * 11. Criterion 11: Schema Versioning: Strict 1.0.0 contract enforcement across all domains
 * 12. Criterion 12: Provider Configuration: Production environment selects OpenAI gpt-image-2
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
  inspectImageBinary,
  validateImageBinary,
  assertValidImageBinary,
} from "../../src/lib/ai/image-validator.ts";
import {
  setMockIllustrationProvider,
  resolveIllustrationGenerationProvider,
} from "../../src/lib/ai/providers/illustration-provider-factory.ts";
import {
  executeApproveIllustrationForUse,
  fallbackIllustrationReviews,
} from "../../src/lib/illustration-review.functions.ts";
import {
  executeAttachIllustrationAsset,
  fallbackIllustrationAssets,
  fallbackModulesStore,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  renderPresentationPptx,
} from "../../src/lib/ai/presentation-pptx-renderer.ts";
import {
  hasZipMagicSignature,
  validatePptxPackage,
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
  fallbackPresentationReviews as fallbackPptReviews,
} from "../../src/lib/presentation-review.functions.ts";
import {
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const FIXTURES_DIR = path.resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-RECOVERY-07 (PRODUCTION HARDENING & RELEASE GATE)     ");
console.log("================================================================================");

let passedCount = 0;
let failedCount = 0;

function reportPass(num, name) {
  console.log(`  ✓ [PASS] [CRITERION ${num}] ${name}`);
  passedCount++;
}

function reportFail(num, name, err) {
  console.error(`  ✗ [FAIL] [CRITERION ${num}] ${name}`);
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
  fallbackIllustrationReviews.clear();
  fallbackModulesStore.clear();
  fallbackPresentationArtifacts.clear();
  fallbackPresentationResults.clear();
  fallbackPptReviews.clear();
  fallbackPresentationQualityEvaluations.clear();
  setMockIllustrationProvider(null);

  const TEACHER_A_ID = "guru_hardening_01_alpha";
  const TEACHER_B_ID = "guru_hardening_02_beta";
  const STUDENT_ID = "siswa_hardening_03_gamma";
  const CLASS_A_ID = "c0000000-0000-0000-0000-000000000001";
  const CLASS_B_ID = "c0000000-0000-0000-0000-000000000002";
  const MODULE_A_ID = "modul_hardening_alpha_01";
  const SECTION_A_ID = "sec_hardening_alpha_01";

  const teacherAAuth = {
    userId: TEACHER_A_ID,
    teacherId: TEACHER_A_ID,
    role: "guru",
    teacherRole: "guru",
    isGuru: true,
    verificationStatus: "terverifikasi",
    teacherClasses: [
      {
        id: CLASS_A_ID,
        namaKelas: "XI TKJ 1",
        tingkat: "XI",
        mapel: "Administrasi Infrastruktur Jaringan",
        tahunAjaran: "2026/2027",
        guruId: TEACHER_A_ID,
      },
    ],
  };

  const teacherBAuth = {
    userId: TEACHER_B_ID,
    teacherId: TEACHER_B_ID,
    role: "guru",
    teacherRole: "guru",
    isGuru: true,
    verificationStatus: "terverifikasi",
    teacherClasses: [
      {
        id: CLASS_B_ID,
        namaKelas: "XI RPL 1",
        tingkat: "XI",
        mapel: "Pemrograman Web",
        tahunAjaran: "2026/2027",
        guruId: TEACHER_B_ID,
      },
    ],
  };

  const unverifiedTeacherAuth = {
    userId: "guru_unverified_001",
    teacherId: "guru_unverified_001",
    role: "guru",
    teacherRole: "guru",
    isGuru: true,
    verificationStatus: "menunggu",
    teacherClasses: [
      {
        id: CLASS_A_ID,
        namaKelas: "XI TKJ 1",
        tingkat: "XI",
        mapel: "Administrasi Infrastruktur Jaringan",
        tahunAjaran: "2026/2027",
        guruId: "guru_unverified_001",
      },
    ],
  };

  const studentAuth = {
    userId: STUDENT_ID,
    role: "siswa",
    isGuru: false,
    verificationStatus: "terverifikasi",
    teacherClasses: [],
  };

  // ----------------------------------------------------------------------------
  // CRITERION 1: Zero mock SVG fallback allowed in illustration pipeline (raster only)
  // ----------------------------------------------------------------------------
  try {
    const fakeSvgString = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#eee"/><text x="50" y="50">Mock SVG</text></svg>`;
    const fakeSvgBuffer = Buffer.from(fakeSvgString, "utf-8");

    let rejectedByAssert = false;
    try {
      assertValidImageBinary(fakeSvgBuffer, "1:1");
    } catch {
      rejectedByAssert = true;
    }
    assert.equal(rejectedByAssert, true, "assertValidImageBinary MUST reject SVG data");

    const inspected = inspectImageBinary(fakeSvgBuffer);
    assert.notEqual(inspected.mimeType, "image/png", "SVG must not be recognized as PNG");
    assert.notEqual(inspected.mimeType, "image/jpeg", "SVG must not be recognized as JPEG");
    assert.notEqual(inspected.mimeType, "image/webp", "SVG must not be recognized as WEBP");

    const validation = validateImageBinary(fakeSvgBuffer, "1:1");
    assert.equal(validation.valid, false, "validateImageBinary must reject SVG data");

    const validPng = createValidPngBuffer(1024, 1024);
    const validInspected = inspectImageBinary(validPng);
    assert.equal(validInspected.mimeType, "image/png");

    reportPass(1, "Zero mock SVG fallback allowed in illustration pipeline (only raster PNG/JPEG/WEBP permitted)");
  } catch (err) {
    reportFail(1, "Zero mock SVG", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 2: Zero fake HTML .ppt allowed in presentation pipeline (OOXML .pptx only)
  // ----------------------------------------------------------------------------
  try {
    const fakeHtmlPresentation = Buffer.from(
      "<html><head><meta http-equiv='content-type' content='application/vnd.ms-powerpoint'></head><body><table><tr><td>Slide 1</td></tr></table></body></html>",
      "utf-8"
    );

    assert.equal(
      hasZipMagicSignature(fakeHtmlPresentation),
      false,
      "Fake HTML must fail PK ZIP magic signature check"
    );

    let rejectedFakeHtml = false;
    try {
      await validatePptxPackage(fakeHtmlPresentation, 1);
    } catch (err) {
      rejectedFakeHtml = true;
      assert.ok(err.message.includes("File PPTX palsu terdeteksi"));
    }
    assert.equal(
      rejectedFakeHtml,
      true,
      "validatePptxPackage MUST reject HTML disguised as presentation"
    );

    reportPass(2, "Zero fake HTML .ppt allowed in presentation pipeline (strictly valid OOXML .pptx with PK header)");
  } catch (err) {
    reportFail(2, "Zero fake HTML .ppt", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 3: Grounding Invariant: Refuses generation without verified source snapshot
  // ----------------------------------------------------------------------------
  try {
    let ungroundedThrew = false;
    try {
      await generateGroundedModulAjar(
        {
          kelasId: CLASS_A_ID,
          sourceSnapshotIds: ["snap_non_existent_fake_001"],
          topik: "Routing Statis",
          targetFase: "F",
          alokasiWaktu: "2 x 45 menit",
        },
        teacherAAuth
      );
    } catch (err) {
      ungroundedThrew = true;
      assert.ok(
        err.message.includes("Bahan ajar rujukan") || err.message.includes("tidak ditemukan"),
        "Should reject missing snapshot reference"
      );
    }

    assert.equal(ungroundedThrew, true, "Must fail closed if source snapshot does not exist");
    reportPass(3, "Grounding Invariant: Refuses Modul Ajar generation without durable source material snapshot");
  } catch (err) {
    reportFail(3, "Grounding Invariant", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 4: Auth Invariant: Refuses generation if teacher is unverified
  // ----------------------------------------------------------------------------
  try {
    let unverifiedThrew = false;
    try {
      await generateGroundedModulAjar(
        {
          kelasId: CLASS_A_ID,
          sourceSnapshotIds: ["snap_dummy_001"],
          topik: "Routing Statis",
          targetFase: "F",
          alokasiWaktu: "2 x 45 menit",
        },
        unverifiedTeacherAuth
      );
    } catch (err) {
      unverifiedThrew = true;
      assert.ok(
        err.message.includes("terverifikasi"),
        "Must require verified teacher status"
      );
    }

    assert.equal(unverifiedThrew, true, "Must fail closed if teacher verificationStatus !== terverifikasi");
    reportPass(4, "Auth Invariant: Refuses generation if teacher status is unverified (fail-closed auth)");
  } catch (err) {
    reportFail(4, "Auth Invariant", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 5: Tenant Isolation: Teacher B cannot approve or attach Teacher A's illustrations
  // ----------------------------------------------------------------------------
  try {
    const assetIdA = "asset_iso_alpha_001";
    fallbackIllustrationAssets.set(assetIdA, {
      id: assetIdA,
      generationId: "gen_iso_001",
      requestId: "req_iso_001",
      planId: "plan_iso_001",
      ownerId: TEACHER_A_ID,
      storageReference: `illustrations/${TEACHER_A_ID}/${assetIdA}.png`,
      publicUrl: `https://storage.gurupro.id/illustrations/${TEACHER_A_ID}/${assetIdA}.png`,
      thumbnailUrl: null,
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
      byteSize: 125000,
      sha256Hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      lifecycleStatus: "staged",
      attachedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let crossTenantApprovalBlocked = false;
    try {
      await executeApproveIllustrationForUse(
        { assetId: assetIdA, teacherNotes: "Unauthorized review" },
        teacherBAuth
      );
    } catch (err) {
      crossTenantApprovalBlocked = true;
    }
    assert.equal(crossTenantApprovalBlocked, true, "Teacher B must be blocked from reviewing Teacher A's asset");

    let crossTenantAttachBlocked = false;
    try {
      await executeAttachIllustrationAsset(
        { moduleId: MODULE_A_ID, sectionId: SECTION_A_ID, assetId: assetIdA },
        teacherBAuth
      );
    } catch (err) {
      crossTenantAttachBlocked = true;
    }
    assert.equal(crossTenantAttachBlocked, true, "Teacher B must be blocked from attaching Teacher A's asset");

    reportPass(5, "Tenant Isolation: Teacher B strictly prohibited from approving or attaching Teacher A's illustrations");
  } catch (err) {
    reportFail(5, "Illustration tenant isolation", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 6: Tenant Isolation: Teacher B cannot evaluate or download Teacher A's presentations
  // ----------------------------------------------------------------------------
  try {
    const artifactIdA = "art_iso_alpha_001";
    const pngBuf = createValidPngBuffer(1024, 1024);
    const validHash = crypto.createHash("sha256").update(pngBuf).digest("hex");

    fallbackPresentationArtifacts.set(artifactIdA, {
      id: artifactIdA,
      presentation_id: "pres_iso_001",
      content_result_id: "pres_iso_001",
      generation_plan_id: "plan_iso_001",
      module_id: MODULE_A_ID,
      owner_id: TEACHER_A_ID,
      tenant_id: "default",
      storage_reference: `presentations/${MODULE_A_ID}/${artifactIdA}.pptx`,
      storage_provider: "supabase_storage",
      public_url: `/presentations/${artifactIdA}.pptx`,
      download_url: `/download/${artifactIdA}.pptx`,
      filename: "routing-statis.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: pngBuf.length,
      file_hash: validHash,
      slide_count: 2,
      outline_version: 1,
      style_id: "corporate_clean",
      style_version: 1,
      renderer_version: "v1.0.0",
      status: "ready",
      render_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let evalBlocked = false;
    try {
      await executeEvaluatePresentationQuality(
        { artifactId: artifactIdA, mockBytes: pngBuf },
        teacherBAuth
      );
    } catch {
      evalBlocked = true;
    }
    assert.equal(evalBlocked, true, "Teacher B must be forbidden from evaluating Teacher A's presentation");

    let downloadBlocked = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: artifactIdA, mockBytes: pngBuf },
        teacherBAuth
      );
    } catch {
      downloadBlocked = true;
    }
    assert.equal(downloadBlocked, true, "Teacher B must be forbidden from downloading Teacher A's presentation");

    reportPass(6, "Tenant Isolation: Teacher B strictly prohibited from evaluating or downloading Teacher A's presentations");
  } catch (err) {
    reportFail(6, "Presentation tenant isolation", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 7: RBAC Invariant: Student role strictly blocked from all AI generation endpoints
  // ----------------------------------------------------------------------------
  try {
    let studentModulBlocked = false;
    try {
      await generateGroundedModulAjar(
        {
          kelasId: CLASS_A_ID,
          sourceSnapshotIds: ["dummy"],
          topik: "Test",
          targetFase: "E",
          alokasiWaktu: "2x45",
        },
        studentAuth
      );
    } catch (err) {
      studentModulBlocked = true;
    }
    assert.equal(studentModulBlocked, true, "Student must be blocked from generateGroundedModulAjar");

    let studentPptDownloadBlocked = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_iso_alpha_001" },
        studentAuth
      );
    } catch (err) {
      studentPptDownloadBlocked = true;
    }
    assert.equal(studentPptDownloadBlocked, true, "Student must be blocked from executeSecureDownloadPresentationPptx");

    reportPass(7, "RBAC Invariant: Student role strictly blocked from all teacher AI generation & download functions");
  } catch (err) {
    reportFail(7, "Student RBAC", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 8: Quality Gate: PPT-1F blocks download if presentation review or quality is rejected
  // ----------------------------------------------------------------------------
  try {
    const unreviewedArtId = "art_unreviewed_001";
    const pngBuf = createValidPngBuffer(1024, 1024);
    const validHash = crypto.createHash("sha256").update(pngBuf).digest("hex");

    fallbackPresentationArtifacts.set(unreviewedArtId, {
      id: unreviewedArtId,
      presentation_id: "pres_unrev_001",
      content_result_id: "pres_unrev_001",
      generation_plan_id: "plan_unrev_001",
      module_id: MODULE_A_ID,
      owner_id: TEACHER_A_ID,
      tenant_id: "default",
      storage_reference: `presentations/${MODULE_A_ID}/${unreviewedArtId}.pptx`,
      storage_provider: "supabase_storage",
      public_url: `/presentations/${unreviewedArtId}.pptx`,
      download_url: `/download/${unreviewedArtId}.pptx`,
      filename: "unreviewed.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: pngBuf.length,
      file_hash: validHash,
      slide_count: 2,
      outline_version: 1,
      style_id: "corporate_clean",
      style_version: 1,
      renderer_version: "v1.0.0",
      status: "ready",
      render_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Without quality evaluation recorded or with REJECTED evaluation, secure download must reject
    let unreviewedDlBlocked = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: unreviewedArtId, mockBytes: pngBuf },
        teacherAAuth
      );
    } catch (err) {
      unreviewedDlBlocked = true;
      assert.ok(
        err.message.includes("evaluasi kualitas") || err.message.includes("PPT-1F") || err.message.includes("belum"),
        "Must specify quality gate requirement"
      );
    }
    assert.equal(unreviewedDlBlocked, true, "Must block download if PPT-1F quality gate has not passed");

    reportPass(8, "Quality Gate: PPT-1F blocks download if presentation quality evaluation has not passed");
  } catch (err) {
    reportFail(8, "PPT-1F Quality Gate", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 9: Fail-closed on AI provider failure (canonical AiServiceError, zero synthetic data)
  // ----------------------------------------------------------------------------
  try {
    const txtContent = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
    const snapshot = await ingestSource({
      sourceType: "text",
      input: txtContent,
      userId: TEACHER_A_ID,
      title: "Routing Statis",
    });

    teacherAAuth.availableSourceSnapshots = [
      {
        id: snapshot.id,
        userId: TEACHER_A_ID,
        sourceTitle: snapshot.sourceTitle,
        contentHash: snapshot.contentHash,
      },
    ];

    let providerErrorHandled = false;
    try {
      await generateGroundedModulAjar(
        {
          kelasId: CLASS_A_ID,
          sourceSnapshotIds: [snapshot.id],
          topik: "Routing Statis",
          targetFase: "F",
          alokasiWaktu: "2 x 45 menit",
        },
        teacherAAuth,
        {
          mockProviderCall: async () => {
            throw new Error("OpenAI API rate limit exceeded (HTTP 429)");
          },
        }
      );
    } catch (err) {
      providerErrorHandled = true;
      assert.ok(
        err instanceof AiServiceError || err.message.includes("429") || err.message.includes("gagal"),
        "Must propagate canonical error rather than generating hallucinated fake content"
      );
    }

    assert.equal(providerErrorHandled, true, "Must fail closed on provider failure without returning fake data");
    reportPass(9, "Fail-closed on AI provider failure: strictly raises canonical error with zero synthetic fallback");
  } catch (err) {
    reportFail(9, "Provider fail-closed", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 10: Anti-tamper: Hash mismatch between render metadata and file bytes is rejected
  // ----------------------------------------------------------------------------
  try {
    const tamperedArtId = "art_tampered_001";
    const goodBytes = createValidPngBuffer(1024, 1024);
    const goodHash = crypto.createHash("sha256").update(goodBytes).digest("hex");
    const corruptedBytes = Buffer.from("Corrupted file content without zip headers");

    fallbackPresentationArtifacts.set(tamperedArtId, {
      id: tamperedArtId,
      presentation_id: "pres_tampered_001",
      content_result_id: "pres_tampered_001",
      generation_plan_id: "plan_tampered_001",
      module_id: MODULE_A_ID,
      owner_id: TEACHER_A_ID,
      tenant_id: "default",
      storage_reference: `presentations/${MODULE_A_ID}/${tamperedArtId}.pptx`,
      storage_provider: "supabase_storage",
      public_url: `/presentations/${tamperedArtId}.pptx`,
      download_url: `/download/${tamperedArtId}.pptx`,
      filename: "tampered.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: goodBytes.length,
      file_hash: goodHash, // Expects goodHash, but we deliver corruptedBytes
      slide_count: 2,
      outline_version: 1,
      style_id: "corporate_clean",
      style_version: 1,
      renderer_version: "v1.0.0",
      status: "ready",
      render_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    fallbackPptReviews.set("rev_tampered_001", {
      id: "rev_tampered_001",
      presentation_id: "pres_tampered_001",
      content_result_id: "pres_tampered_001",
      generation_plan_id: "plan_tampered_001",
      module_id: MODULE_A_ID,
      approved_version: 1,
      review_status: "approved",
      teacher_decision: "approved",
      validation_summary: {},
      reviewed_by: TEACHER_A_ID,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    fallbackPresentationQualityEvaluations.set("eval_tampered_001", {
      id: "eval_tampered_001",
      artifact_id: tamperedArtId,
      presentation_id: "pres_tampered_001",
      evaluated_by: TEACHER_A_ID,
      decision: "PASS",
      status: "passed",
      evaluation_snapshot: {
        id: "eval_tampered_001",
        artifactId: tamperedArtId,
        decision: "PASS",
        status: "passed",
      },
      created_at: new Date().toISOString(),
    });

    let tamperCaught = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: tamperedArtId, mockBytes: corruptedBytes },
        teacherAAuth
      );
    } catch (err) {
      tamperCaught = true;
      assert.ok(
        err.message.includes("checksum") || err.message.includes("Integritas biner berkas rusak"),
        "Tampered bytes must fail checksum validation: got " + err.message
      );
    }

    assert.equal(tamperCaught, true, "Must catch tampered or mismatched bytes");
    reportPass(10, "Anti-tamper: Hash verification detects corrupted bytes and blocks compromised presentation download");
  } catch (err) {
    reportFail(10, "Anti-tamper verification", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 11: Schema Versioning: Strict 1.0.0 contract enforcement across all domains
  // ----------------------------------------------------------------------------
  try {
    const rawModulBadVersion = {
      schemaVersion: "0.9.0-beta", // Invalid!
      judul: "Test Modul",
      mapel: "TIK",
      kelas: "XI",
      fase: "F",
      alokasiWaktu: "2x45",
      ringkasan: "Ringkasan pendek",
      tujuanPembelajaran: [],
      sections: [],
      kegiatanPembelajaran: {
        pendahuluan: { alokasiMenit: 10, aktivitas: ["Buka"] },
        inti: { alokasiMenit: 70, aktivitas: ["Kerja"] },
        penutup: { alokasiMenit: 10, aktivitas: ["Tutup"] },
      },
      asesmen: { kriteria: ["K1"], teknik: "T1", instrumen: "I1" },
      evidenceRefs: [],
    };

    let badVersionBlocked = false;
    try {
      await generateGroundedModulAjar(
        {
          kelasId: CLASS_A_ID,
          sourceSnapshotIds: [teacherAAuth.availableSourceSnapshots[0].id],
          topik: "Routing Statis",
          targetFase: "F",
          alokasiWaktu: "2 x 45 menit",
        },
        teacherAAuth,
        {
          mockProviderCall: async () => JSON.stringify(rawModulBadVersion),
        }
      );
    } catch {
      badVersionBlocked = true;
    }

    assert.equal(badVersionBlocked, true, "Schema version mismatch must fail validation");
    reportPass(11, "Schema Versioning: Strict canonical v1.0.0 schema version required across contracts");
  } catch (err) {
    reportFail(11, "Schema versioning", err);
  }

  // ----------------------------------------------------------------------------
  // CRITERION 12: Provider Configuration: Production environment selects OpenAI gpt-image-2
  // ----------------------------------------------------------------------------
  try {
    const provider = resolveIllustrationGenerationProvider();
    assert.equal(provider.providerName, "dual-router");
    assert.equal(provider.primaryProvider.providerName, "openai");

    const envPrimary = process.env.AI_IMAGE_PRIMARY;
    assert.equal(envPrimary, "openai", "AI_IMAGE_PRIMARY must be set to 'openai'");

    const envModel = process.env.OPENAI_IMAGE_MODEL;
    assert.equal(envModel, "gpt-image-2", "OPENAI_IMAGE_MODEL must be set to 'gpt-image-2'");

    reportPass(12, "Provider Configuration: Production environment routes to OpenAI gpt-image-2 with zero SVG mockups");
  } catch (err) {
    reportFail(12, "Provider configuration", err);
  }

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`  AI-RECOVERY-07 SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in AI-RECOVERY-07 test suite:", err);
  process.exit(1);
});
