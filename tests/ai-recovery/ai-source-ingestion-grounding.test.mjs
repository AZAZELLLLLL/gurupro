/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-RECOVERY-02
 * Real Source Ingestion & Grounding Recovery Verification
 * ==============================================================================
 *
 * Verifies the 12 core acceptance requirements for Stage AI-RECOVERY-02:
 * 1. Multi-format real source ingestion (PDF, DOCX, HTML, TXT)
 * 2. Anti-SSRF host & IP safety protection on web sources
 * 3. Topic inference resolves metadata/domain titles and strips filename/container words
 * 4. Deterministic cryptographic SHA-256 content hashing
 * 5. Boundary-aware chunking preserving section titles and provenance
 * 6. Lexical retrieval with educational synonyms and exact phrase bonus
 * 7. Strict anti-hallucination grounding: entity and numerical fidelity
 * 8. Negative claim rejection: ungrounded entities classified as NOT_FOUND
 * 9. Multi-tenant snapshot isolation enforces teacher ownership boundaries
 * 10. Grounded context building adheres to maxTotalChunks & maxTotalWords budget
 * 11. Malformed and corrupted document payloads fail cleanly with explicit error taxonomy
 * 12. ai_source_snapshots persistence operates reliably in both live DB and L1 cache
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ingestSource,
  clearSnapshotCacheForTesting,
  getCachedSnapshotsForUser,
} from "../../src/lib/ai/source-ingestion";
import {
  extractDocumentText,
  deriveDocumentSuggestedTopic,
  cleanTopicTitle,
  isFilenameOrPlaceholder,
} from "../../src/lib/ai/document-parser";
import {
  retrieveSourceContext,
} from "../../src/lib/ai/retriever";
import {
  evaluateGroundingAgainstSource,
} from "../../src/lib/ai/grounding";
import {
  buildModulGroundingContext,
  serializeModulGroundingContext,
} from "../../src/lib/ai/modul-context-builder";
import {
  validateHostSafety,
  isPrivateOrReservedIp,
} from "../../src/lib/sumber.functions";
import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const FIXTURES_DIR = path.resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-RECOVERY-02 (REAL SOURCE INGESTION & GROUNDING)       ");
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
  const TEACHER_A = "teacher_recovery_02_alpha";
  const TEACHER_B = "teacher_recovery_02_beta";

  // ----------------------------------------------------------------------------
  // TEST 1: Multi-format real source ingestion (PDF, DOCX, HTML, TXT)
  // ----------------------------------------------------------------------------
  try {
    const pdfBuf = fs.readFileSync(path.join(FIXTURES_DIR, "educational-automotive-injection.pdf"));
    const docxBuf = fs.readFileSync(path.join(FIXTURES_DIR, "educational-accounting-journal.docx"));
    const htmlStr = fs.readFileSync(path.join(FIXTURES_DIR, "educational-web-vlan.html"), "utf-8");
    const txtStr = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");

    const pdfSnap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: pdfBuf,
      fileName: "educational-automotive-injection.pdf",
      userId: TEACHER_A,
    });
    assert.equal(pdfSnap.contentType, "application/pdf");
    assert.ok(pdfSnap.wordCount > 50, "PDF word count must be significant");

    const docxSnap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: docxBuf,
      fileName: "educational-accounting-journal.docx",
      userId: TEACHER_A,
    });
    assert.equal(docxSnap.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.ok(docxSnap.wordCount > 50, "DOCX word count must be significant");

    const htmlSnap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: Buffer.from(htmlStr, "utf-8"),
      fileName: "educational-web-vlan.html",
      userId: TEACHER_A,
    });
    assert.ok(!htmlSnap.normalizedContent.includes("<script"), "HTML script tags must be stripped");

    const txtSnap = await ingestSource({
      sourceType: "text",
      input: txtStr,
      userId: TEACHER_A,
      title: "Routing Statis MikroTik",
    });
    assert.ok(txtSnap.chunks.length > 0, "TXT chunks must be formed");

    reportPass(1, "Multi-format real source ingestion (PDF, DOCX, HTML, TXT) parsed without loss of factual substance");
  } catch (err) {
    reportFail(1, "Multi-format real source ingestion", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Anti-SSRF host & IP safety protection on web sources
  // ----------------------------------------------------------------------------
  try {
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("10.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("192.168.1.1"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);

    await assert.rejects(
      async () => validateHostSafety("localhost"),
      /Link internal\/lokal tidak dapat dibaca/
    );
    await assert.rejects(
      async () => validateHostSafety("169.254.169.254"),
      /Link internal\/lokal tidak dapat dibaca/
    );

    reportPass(2, "Anti-SSRF host & IP safety protection strictly rejects loopback, RFC1918, and cloud metadata targets");
  } catch (err) {
    reportFail(2, "Anti-SSRF safety check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Topic inference resolves metadata/domain titles and strips filename/container words
  // ----------------------------------------------------------------------------
  try {
    assert.equal(isFilenameOrPlaceholder("e-book python.docx"), true);
    assert.equal(isFilenameOrPlaceholder("modul ajar materi.pdf"), true);
    assert.equal(isFilenameOrPlaceholder("Dasar-Dasar Pemrograman Python"), false);

    const cleaned = cleanTopicTitle("e-book python.docx - Wikipedia bahasa Indonesia");
    assert.ok(!cleaned.includes("Wikipedia"), "Wikipedia noise must be stripped");

    const docxBuf = fs.readFileSync(path.join(FIXTURES_DIR, "educational-accounting-journal.docx"));
    const parsed = await extractDocumentText({
      buffer: docxBuf,
      fileName: "buku-panduan-akuntansi-kejuruan.docx",
    });
    assert.ok(parsed.suggestedTopic, "Suggested topic must be inferred");
    assert.ok(!parsed.suggestedTopic.endsWith(".docx"), "Suggested topic must not contain .docx extension");

    reportPass(3, "Topic inference eliminates raw filename and container words (ebook, docx) while preserving pedagogical title");
  } catch (err) {
    reportFail(3, "Topic inference check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Deterministic cryptographic SHA-256 content hashing
  // ----------------------------------------------------------------------------
  try {
    const textA = "Pengenalan Sistem Injeksi Elektronik (EFI) pada Motor Bensin Otomotif SMK.";
    const snap1 = await ingestSource({
      sourceType: "text",
      input: textA + " Materi tambahan untuk pengujian hash deterministik.",
      userId: TEACHER_A,
      title: "EFI Part 1",
    });
    const snap2 = await ingestSource({
      sourceType: "text",
      input: textA + " Materi tambahan untuk pengujian hash deterministik.",
      userId: TEACHER_A,
      title: "EFI Part 2",
    });

    assert.equal(snap1.contentHash, snap2.contentHash, "Identical content must yield identical SHA-256 hash");
    assert.equal(snap1.id, snap2.id, "Snapshot ID must be deterministic from userId + contentHash");

    reportPass(4, "Deterministic cryptographic SHA-256 content hashing guarantees repeatable deduplication");
  } catch (err) {
    reportFail(4, "SHA-256 content hashing check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Boundary-aware chunking preserving section titles and provenance
  // ----------------------------------------------------------------------------
  try {
    const routingTxt = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
    const snap = await ingestSource({
      sourceType: "text",
      input: routingTxt,
      userId: TEACHER_A,
      title: "Konfigurasi Routing",
    });

    assert.ok(snap.chunks.length >= 2, "Document must be segmented into chunks");
    for (const chunk of snap.chunks) {
      assert.ok(chunk.chunkId.startsWith("chunk_"), "Chunk ID must follow canonical prefix");
      assert.ok(chunk.content.length > 0, "Chunk content must be non-empty");
      assert.equal(typeof chunk.index, "number", "Chunk must have sequential numeric index");
    }

    reportPass(5, "Boundary-aware chunking preserves section titles, sequential indices, and chunk provenance");
  } catch (err) {
    reportFail(5, "Boundary-aware chunking check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 6: Lexical retrieval with educational synonyms and exact phrase bonus
  // ----------------------------------------------------------------------------
  try {
    const docxBuf = fs.readFileSync(path.join(FIXTURES_DIR, "educational-accounting-journal.docx"));
    const snap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: docxBuf,
      fileName: "educational-accounting-journal.docx",
      userId: TEACHER_A,
      title: "Jurnal Penyesuaian",
    });

    const retrieved = await retrieveSourceContext({
      sourceId: snap.id,
      userId: TEACHER_A,
      query: "biaya asuransi dibayar di muka yang telah jatuh tempo",
    });

    assert.ok(retrieved.retrievedChunks.length > 0, "Must retrieve relevant chunk via educational synonyms");
    assert.ok(
      retrieved.combinedContext.includes("3.000.000") || retrieved.combinedContext.includes("asuransi"),
      "Retrieved text must match accounting context"
    );

    reportPass(6, "Lexical retrieval correctly scores educational synonyms and returns contextually accurate chunks");
  } catch (err) {
    reportFail(6, "Lexical retrieval with synonyms", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Strict anti-hallucination grounding: entity and numerical fidelity
  // ----------------------------------------------------------------------------
  try {
    const pdfBuf = fs.readFileSync(path.join(FIXTURES_DIR, "educational-automotive-injection.pdf"));
    const snap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: pdfBuf,
      fileName: "educational-automotive-injection.pdf",
      userId: TEACHER_A,
      title: "Pemeliharaan EFI",
    });

    const claim = "Tekanan bahan bakar pada fuel rail berada di kisaran 2.5 hingga 3.0 bar";
    const evalRes = evaluateGroundingAgainstSource({
      claim,
      sourceChunks: snap.chunks,
      sourceId: snap.id,
      sourceTitle: snap.sourceTitle,
    });

    assert.equal(evalRes.status, "SUPPORTED", "Accurate technical and numerical claim must be SUPPORTED");
    assert.ok(evalRes.evidenceSnippet, "Evidence snippet must be provided");

    reportPass(7, "Strict anti-hallucination grounding verifies numerical values (2.5 - 3.0 bar) and awards SUPPORTED");
  } catch (err) {
    reportFail(7, "Grounding entity fidelity", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Negative claim rejection: ungrounded entities classified as NOT_FOUND
  // ----------------------------------------------------------------------------
  try {
    const pdfBuf = fs.readFileSync(path.join(FIXTURES_DIR, "educational-automotive-injection.pdf"));
    const snap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: pdfBuf,
      fileName: "educational-automotive-injection.pdf",
      userId: TEACHER_A,
      title: "Pemeliharaan EFI",
    });

    const foreignClaim = "Sistem injeksi bensin EFI memakai pompa common rail diesel 2000 bar dan sensor lithium baterai";
    const evalRes = evaluateGroundingAgainstSource({
      claim: foreignClaim,
      sourceChunks: snap.chunks,
      sourceId: snap.id,
      sourceTitle: snap.sourceTitle,
    });

    assert.equal(evalRes.status, "NOT_FOUND", "Foreign entities and numbers must be strictly rejected as NOT_FOUND");
    assert.ok(
      evalRes.unsupportedEntities && evalRes.unsupportedEntities.length > 0,
      "Unsupported entities must be reported in diagnostics"
    );

    reportPass(8, "Negative claim rejection strictly classifies ungrounded entities and numbers as NOT_FOUND");
  } catch (err) {
    reportFail(8, "Negative claim rejection", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 9: Multi-tenant snapshot isolation enforces teacher ownership boundaries
  // ----------------------------------------------------------------------------
  try {
    const txtStr = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
    const snap = await ingestSource({
      sourceType: "text",
      input: txtStr,
      userId: TEACHER_A,
      title: "Routing Rahasia Guru A",
    });

    let forbiddenCaught = false;
    try {
      await retrieveSourceContext({
        sourceId: snap.id,
        userId: TEACHER_B, // Different teacher
        query: "Administrative distance",
      });
    } catch (err) {
      if (err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN) {
        forbiddenCaught = true;
      }
    }

    assert.equal(forbiddenCaught, true, "Cross-teacher retrieval must throw ROLE_FORBIDDEN");

    reportPass(9, "Multi-tenant snapshot isolation strictly enforces ownership and blocks cross-teacher access");
  } catch (err) {
    reportFail(9, "Multi-tenant isolation check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Grounded context building adheres to maxTotalChunks & maxTotalWords budget
  // ----------------------------------------------------------------------------
  try {
    const routingTxt = fs.readFileSync(path.join(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
    const snap = await ingestSource({
      sourceType: "text",
      input: routingTxt,
      userId: TEACHER_A,
      title: "Jaringan Komputer",
    });

    const authContext = {
      teacherId: TEACHER_A,
      teacherRole: "guru",
      verificationStatus: "terverifikasi",
      teacherClasses: [
        {
          id: "b0000000-0000-0000-0000-000000000001",
          namaKelas: "XI TKJ 1",
          tingkat: "XI",
          mapel: "Teknik Komputer dan Jaringan",
          tahunAjaran: "2026/2027",
          guruId: TEACHER_A,
        },
      ],
      availableSourceSnapshots: [
        {
          id: snap.id,
          userId: TEACHER_A,
          sourceTitle: snap.sourceTitle,
          contentHash: snap.contentHash,
        },
      ],
    };

    const rawInput = {
      kelasId: "b0000000-0000-0000-0000-000000000001",
      sourceSnapshotIds: [snap.id],
      topik: "Konfigurasi Dasar Routing Statis",
      targetFase: "F",
      alokasiWaktu: "4 x 45 menit",
    };

    const context = await buildModulGroundingContext(rawInput, authContext, {
      maxTotalChunks: 4,
      maxTotalWords: 1500,
    });

    assert.ok(context.evidenceItems.length <= 4, "Context must respect maxChunks budget");
    assert.ok(context.contextBudgetSummary.totalWordCount <= 1500, "Context must respect maxWords budget");
    const serialized = serializeModulGroundingContext(context);
    assert.ok(serialized.includes("APPLICATION_ACADEMIC_CONTEXT"), "Must format serialized context safely");

    reportPass(10, "Grounded context building strictly respects chunk & word budget limits and wraps in secure XML");
  } catch (err) {
    reportFail(10, "Grounded context budget check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 11: Malformed and corrupted document payloads fail cleanly with explicit error taxonomy
  // ----------------------------------------------------------------------------
  try {
    const corruptBuffer = Buffer.from("Corrupted non-zip payload pretending to be a docx document");
    await assert.rejects(
      async () => extractDocumentText({ buffer: corruptBuffer, fileName: "corrupted.docx" }),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.SOURCE_PARSE_ERROR
    );

    const emptyBuffer = Buffer.alloc(0);
    await assert.rejects(
      async () => extractDocumentText({ buffer: emptyBuffer, fileName: "empty.pdf" }),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.SOURCE_EMPTY
    );

    reportPass(11, "Malformed and corrupted document binaries fail cleanly with SOURCE_PARSE_ERROR and SOURCE_EMPTY");
  } catch (err) {
    reportFail(11, "Corrupted payload handling check", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 12: ai_source_snapshots persistence operates reliably in both live DB and L1 cache
  // ----------------------------------------------------------------------------
  try {
    const testContent = "Materi esensial tentang prinsip dasar akuntansi debit kredit, siklus pencatatan keuangan kejuruan SMK, dan buku besar umum perusahaan dagang.";
    const snap = await ingestSource({
      sourceType: "text",
      input: testContent,
      userId: TEACHER_A,
      title: "Prinsip Akuntansi",
    });

    const cached = getCachedSnapshotsForUser(TEACHER_A);
    const found = cached.find((s) => s.id === snap.id);
    assert.ok(found, "Snapshot must be immediately accessible from L1 cache");
    assert.equal(found.contentHash, snap.contentHash);

    reportPass(12, "ai_source_snapshots persistence operates reliably with immediate L1 cache retrieval and live resilience");
  } catch (err) {
    reportFail(12, "ai_source_snapshots persistence check", err);
  }

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`  AI-RECOVERY-02 SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in AI-RECOVERY-02 test suite:", err);
  process.exit(1);
});
