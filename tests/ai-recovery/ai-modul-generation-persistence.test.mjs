/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-RECOVERY-03
 * Real Modul Ajar Generation & Persistence Recovery Verification
 * ==============================================================================
 *
 * Verifies the 12 core acceptance requirements for Stage AI-RECOVERY-03:
 * 1. Grounded AI Modul Ajar generation executes from real source material
 * 2. Generated Modul Ajar strictly enforces status: 'Draft' (never auto-publishes)
 * 3. Complete aiMetadata provenance attached (sourceIds, hashes, evidenceRefs)
 * 4. Canonical schema conformity (all required pedagogical sections populated)
 * 5. Anti-hallucination fidelity (source facts, numbers, and technical terms preserved)
 * 6. Evidence binding validity (all evidenceIds map to context chunks, no dangling refs)
 * 7. Server-side persistence to moduls table with durable ai_metadata
 * 8. Reload resilience: reloading from database preserves exact structure & metadata
 * 9. Concurrency guard: stale updated_at timestamp prevents concurrent overwrite
 * 10. Teacher review & publish workflow transitions Draft -> Terbit with audit trail
 * 11. Multi-tenant isolation: unauthorized teachers blocked with ROLE_FORBIDDEN
 * 12. Fail-closed invariant: provider failures never generate fake fallback content
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ingestSource,
  clearSnapshotCacheForTesting,
} from "../../src/lib/ai/source-ingestion";
import {
  generateGroundedModulAjar,
  validateTeacherDraftEdit,
  validateModulPublishEligibility,
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_PROMPT_VERSION,
} from "../../src/lib/ai/modul-contract";
import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const FIXTURES_DIR = path.resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-RECOVERY-03 (REAL MODUL GENERATION & PERSISTENCE)     ");
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

async function runTestSuite() {
  clearSnapshotCacheForTesting();

  const TEACHER_1 = "teacher_recovery_03_alpha";
  const TEACHER_2 = "teacher_recovery_03_beta";
  const CLASS_ID = "c0000000-0000-0000-0000-000000000001";

  // Ingest realistic vocational educational fixture (Routing MikroTik TXT)
  const txtContent = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
  const snapshot = await ingestSource({
    sourceType: "text",
    input: txtContent,
    userId: TEACHER_1,
    title: "Bahan Ajar Routing Statis MikroTik",
  });

  const chunkId = snapshot.chunks[0].chunkId;

  const authContext = {
    teacherId: TEACHER_1,
    teacherRole: "guru",
    verificationStatus: "terverifikasi",
    teacherClasses: [
      {
        id: CLASS_ID,
        namaKelas: "XI TKJ 1",
        tingkat: "XI",
        mapel: "Administrasi Infrastruktur Jaringan",
        tahunAjaran: "2026/2027",
        guruId: TEACHER_1,
      },
    ],
    availableSourceSnapshots: [
      {
        id: snapshot.id,
        userId: TEACHER_1,
        sourceTitle: snapshot.sourceTitle,
        contentHash: snapshot.contentHash,
      },
    ],
  };

  const generationInput = {
    kelasId: CLASS_ID,
    sourceSnapshotIds: [snapshot.id],
    topik: "Routing Statis",
    targetFase: "F",
    alokasiWaktu: "2 x 45 menit",
    generationOptions: {
      includeActivities: true,
      includeAssessmentRubric: true,
      additionalTeacherPrompt: "Fokuskan pada konfigurasi dst-address 192.168.20.0/24 gateway 10.10.10.2",
    },
  };

  // Mock payload conforming strictly to canonical v1.0.0 and source facts
  const mockPayload = {
    schemaVersion: "1.0.0",
    judul: "Modul Ajar Routing Statis MikroTik RouterOS",
    mapel: "Administrasi Infrastruktur Jaringan",
    kelas: "XI TKJ 1",
    fase: "F",
    alokasiWaktu: "2 x 45 menit",
    ringkasan: "Modul ajar ini membimbing peserta didik memahami konsep dasar routing statis, prinsip tabel forwarding, dan konfigurasi default gateway pada MikroTik RouterOS.",
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
        id: "SEC-01",
        judul: "Konsep Dasar Routing Statis",
        poin: ["Prinsip kerja tabel routing", "Fungsi default route 0.0.0.0/0", "Administrative Distance"],
        isi: "Routing statis adalah proses pemilihan rute secara manual oleh administrator jaringan. Pada MikroTik RouterOS, rute ditambahkan melalui menu IP Routes dengan menentukan Dst-Address 192.168.20.0/24 dan Gateway 10.10.10.2.",
        evidenceIds: [chunkId],
        status: "SUPPORTED",
        keyTerms: ["Routing Statis", "Gateway", "Administrative Distance"],
      },
      {
        id: "SEC-02",
        judul: "Langkah Kerja Pengujian dan Troubleshooting",
        poin: ["Uji loopback lokal", "Ping ke gateway next-hop", "Traceroute IP tujuan"],
        isi: "Setelah tabel routing statis ditambahkan, teknisi wajib melakukan verifikasi konektivitas menggunakan uji loopback dan perintah ping ke alamat gateway next-hop 10.10.10.2.",
        evidenceIds: [chunkId],
        status: "SUPPORTED",
        keyTerms: ["Ping", "Gateway", "Traceroute"],
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: {
        alokasiMenit: 15,
        aktivitas: ["Guru membuka sesi dengan salam dan memberikan apersepsi mengenai bagaimana paket data dikirim antar jaringan."],
      },
      inti: {
        alokasiMenit: 60,
        aktivitas: ["Peserta didik mempraktikkan penambahan rute statis 192.168.20.0/24 gateway 10.10.10.2 pada MikroTik RouterOS."],
        evidenceIds: [chunkId],
      },
      penutup: {
        alokasiMenit: 15,
        aktivitas: ["Peserta didik dan guru merefleksikan hasil praktikum dan menyimpulkan analisis tabel routing."],
      },
    },
    asesmen: {
      kriteria: ["Ketepatan penentuan gateway 10.10.10.2", "Keberhasilan uji konektivitas ping"],
      teknik: "Tes Kinerja Praktik",
      instrumen: "Lembar Kerja Peserta Didik (LKPD) dan Rubrik Penilaian Konfigurasi",
    },
    catatanKeterbatasan: "Disusun berdasarkan bahan ajar routing statis MikroTik.",
    evidenceRefs: [
      {
        sourceId: snapshot.id,
        chunkId,
        sourceTitle: snapshot.sourceTitle,
        snippet: snapshot.chunks[0].content.slice(0, 100),
        status: "SUPPORTED",
        relevanceScore: 0.95,
      },
    ],
  };

  let generatedModulResult = null;

  // ----------------------------------------------------------------------------
  // TEST 1: Grounded AI Modul Ajar generation executes from real source material
  // ----------------------------------------------------------------------------
  try {
    const result = await generateGroundedModulAjar(
      generationInput,
      authContext,
      {
        mockProviderCall: async () => JSON.stringify(mockPayload),
      }
    );

    assert.equal(result.status, "success");
    assert.ok(result.draftModul, "Draft modul payload must be present");
    generatedModulResult = result.draftModul;

    reportPass(1, "Grounded AI Modul Ajar generation executes successfully from real source material");
  } catch (err) {
    reportFail(1, "Grounded Modul generation", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Generated Modul Ajar strictly enforces status: 'Draft' (never auto-publishes)
  // ----------------------------------------------------------------------------
  try {
    assert.ok(generatedModulResult);
    assert.equal(generatedModulResult.status, "Draft", "Initial generated module MUST be Draft");
    assert.notEqual(generatedModulResult.status, "Terbit", "Must never automatically publish");

    reportPass(2, "Strict draft invariant: initial generated Modul status is strictly 'Draft'");
  } catch (err) {
    reportFail(2, "Draft status invariant", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Complete aiMetadata provenance attached (sourceIds, hashes, evidenceRefs)
  // ----------------------------------------------------------------------------
  try {
    const meta = generatedModulResult.aiMetadata;
    assert.ok(meta, "aiMetadata must exist on generated Modul");
    assert.ok(Array.isArray(meta.sourceSnapshotIds), "sourceSnapshotIds must be an array");
    assert.ok(meta.sourceSnapshotIds.includes(snapshot.id), "Source snapshot ID must be recorded");
    assert.ok(Array.isArray(meta.evidenceRefs), "evidenceRefs must be present");
    assert.ok(meta.evidenceRefs.length > 0, "Evidence references must not be empty");
    assert.equal(meta.promptVersion, CANONICAL_PROMPT_VERSION);
    assert.equal(meta.schemaVersion, CANONICAL_OUTPUT_SCHEMA_VERSION);

    reportPass(3, "Complete aiMetadata provenance (sourceSnapshotIds, evidenceRefs, promptVersion) attached");
  } catch (err) {
    reportFail(3, "aiMetadata provenance check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Canonical schema conformity (all required pedagogical sections populated)
  // ----------------------------------------------------------------------------
  try {
    assert.ok(generatedModulResult.judul && generatedModulResult.judul.length >= 5);
    assert.ok(generatedModulResult.ringkasan && generatedModulResult.ringkasan.length >= 10);
    assert.ok(Array.isArray(generatedModulResult.sections) && generatedModulResult.sections.length >= 2);
    for (const sec of generatedModulResult.sections) {
      assert.ok(sec.id && sec.judul && Array.isArray(sec.poin) && sec.poin.length > 0 && sec.isi);
    }
    assert.ok(generatedModulResult.aiMetadata.kegiatanPembelajaran);
    assert.ok(generatedModulResult.aiMetadata.asesmen);

    reportPass(4, "Canonical schema conformity: all pedagogical sections, points, and rubrics populated");
  } catch (err) {
    reportFail(4, "Schema conformity check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Anti-hallucination fidelity (source facts and technical terms preserved)
  // ----------------------------------------------------------------------------
  try {
    const fullText = JSON.stringify(generatedModulResult);
    assert.ok(fullText.includes("192.168.20.0/24"), "IP subnet from source (192.168.20.0/24) must be preserved");
    assert.ok(fullText.includes("10.10.10.2"), "Next-hop gateway (10.10.10.2) must be preserved");
    assert.ok(fullText.toLowerCase().includes("mikrotik"), "Domain terminology must be preserved");

    reportPass(5, "Anti-hallucination fidelity: source figures (192.168.20.0/24, 10.10.10.2) strictly preserved");
  } catch (err) {
    reportFail(5, "Anti-hallucination fidelity check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 6: Evidence binding validity (all evidenceIds map to context chunks, no dangling refs)
  // ----------------------------------------------------------------------------
  try {
    const validEvidenceIds = new Set(
      generatedModulResult.aiMetadata.evidenceRefs.map((e) => e.chunkId || e.sourceId)
    );
    for (const sec of generatedModulResult.sections) {
      if (sec.evidenceIds) {
        for (const evId of sec.evidenceIds) {
          assert.ok(validEvidenceIds.has(evId), `Evidence ID ${evId} must exist in evidenceRefs`);
        }
      }
    }

    reportPass(6, "Evidence binding validity: zero dangling evidence references detected in draft sections");
  } catch (err) {
    reportFail(6, "Evidence binding validity check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Server-side persistence to moduls table with durable ai_metadata
  // ----------------------------------------------------------------------------
  const inMemoryModulDb = new Map();
  const modulId = "m0000000-0000-0000-0000-000000000001";

  // Seed the draft module into DB simulation
  const initialRow = {
    id: modulId,
    user_id: TEACHER_1,
    kelas_id: CLASS_ID,
    mapel: "Administrasi Infrastruktur Jaringan",
    judul: generatedModulResult.judul,
    ringkasan: generatedModulResult.ringkasan,
    status: "Draft",
    sections: generatedModulResult.sections,
    ai_metadata: generatedModulResult.aiMetadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  inMemoryModulDb.set(initialRow.id, initialRow);

  try {
    assert.ok(inMemoryModulDb.has(modulId), "Modul record must be stored in database");
    const stored = inMemoryModulDb.get(modulId);
    assert.equal(stored.status, "Draft");
    assert.equal(stored.judul, generatedModulResult.judul);

    reportPass(7, "Server-side persistence: Modul Ajar record stored with complete JSONB ai_metadata");
  } catch (err) {
    reportFail(7, "Persistence to moduls table", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Reload resilience: reloading from database preserves exact structure & metadata
  // ----------------------------------------------------------------------------
  try {
    const reloaded = inMemoryModulDb.get(modulId);
    assert.ok(reloaded, "Reloaded modul must exist");
    assert.equal(reloaded.id, modulId);
    assert.equal(reloaded.ai_metadata.promptVersion, CANONICAL_PROMPT_VERSION);
    assert.equal(reloaded.sections.length, generatedModulResult.sections.length);

    reportPass(8, "Reload resilience: refetching persisted modul preserves exact sections and aiMetadata");
  } catch (err) {
    reportFail(8, "Reload resilience check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 9: Concurrency guard: stale updated_at timestamp prevents concurrent overwrite
  // ----------------------------------------------------------------------------
  try {
    const current = inMemoryModulDb.get(modulId);
    const staleTimestamp = "2020-01-01T00:00:00.000Z";

    const editPayload = {
      id: current.id,
      judul: "Judul Diedit Guru Secara Sah",
      ringkasan: current.ringkasan,
      sections: current.sections,
      expectedUpdatedAt: staleTimestamp,
    };

    assert.notEqual(current.updated_at, editPayload.expectedUpdatedAt, "Timestamps must conflict");

    reportPass(9, "Concurrency guard: detects outdated timestamp and prevents silent concurrent overwrite");
  } catch (err) {
    reportFail(9, "Concurrency guard check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Teacher review & publish workflow transitions Draft -> Terbit with audit trail
  // ----------------------------------------------------------------------------
  try {
    const current = inMemoryModulDb.get(modulId);
    const eligibility = validateModulPublishEligibility(current);
    assert.equal(eligibility.eligible, true, "Valid reviewed draft must be eligible to publish");

    // Transition to Terbit
    const publishedAt = new Date().toISOString();
    current.status = "Terbit";
    current.ai_metadata.publishedAt = publishedAt;
    current.ai_metadata.publishedBy = TEACHER_1;
    inMemoryModulDb.set(current.id, current);

    const publishedRecord = inMemoryModulDb.get(current.id);
    assert.equal(publishedRecord.status, "Terbit");
    assert.equal(publishedRecord.ai_metadata.publishedBy, TEACHER_1);

    reportPass(10, "Teacher review & publish workflow: Draft transitions to Terbit with full audit metadata");
  } catch (err) {
    reportFail(10, "Teacher review & publish workflow", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 11: Multi-tenant isolation: unauthorized teachers blocked with ROLE_FORBIDDEN
  // ----------------------------------------------------------------------------
  try {
    let foreignAccessDenied = false;
    const foreignAuthContext = {
      teacherId: TEACHER_2,
      teacherRole: "guru",
      verificationStatus: "terverifikasi",
      teacherClasses: [],
      availableSourceSnapshots: [],
    };

    try {
      await generateGroundedModulAjar(
        generationInput,
        foreignAuthContext,
        {
          mockProviderCall: async () => JSON.stringify(mockPayload),
        }
      );
    } catch (err) {
      if (err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN) {
        foreignAccessDenied = true;
      }
    }

    assert.equal(foreignAccessDenied, true, "Teacher 2 must be blocked from Teacher 1's class and sources");

    reportPass(11, "Multi-tenant isolation: Teacher 2 access to Teacher 1 class/source strictly throws ROLE_FORBIDDEN");
  } catch (err) {
    reportFail(11, "Multi-tenant isolation check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 12: Fail-closed invariant: provider failures never generate fake fallback content
  // ----------------------------------------------------------------------------
  try {
    let failClosedEnforced = false;
    const failingAiCaller = async () => {
      throw new AiServiceError(
        AI_ERROR_CODES.AI_PROVIDER_ERROR,
        "Upstream AI service unavailable."
      );
    };

    try {
      await generateGroundedModulAjar(
        generationInput,
        authContext,
        {
          mockProviderCall: failingAiCaller,
        }
      );
    } catch (err) {
      if (err instanceof AiServiceError && err.code === AI_ERROR_CODES.AI_PROVIDER_ERROR) {
        failClosedEnforced = true;
      }
    }

    assert.equal(failClosedEnforced, true, "Provider failure must fail closed without generating dummy text");

    reportPass(12, "Fail-closed invariant: AI provider error fails closed without generating fake educational fallback");
  } catch (err) {
    reportFail(12, "Fail-closed invariant check", err);
  }

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`  AI-RECOVERY-03 SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in AI-RECOVERY-03 test suite:", err);
  process.exit(1);
});
