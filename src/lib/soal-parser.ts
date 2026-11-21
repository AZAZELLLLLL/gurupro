import { uid } from "./cloud-store";
import type { JenisSoal, Soal, Tingkat } from "./soal-types";

export interface ParsedAnswerKey {
  num: number;
  kunci: string;
  pembahasan: string;
}

export interface ExtractedQuestionBlock {
  num?: number;
  pertanyaan: string;
  opsi: string[];
  kunci?: string;
  penjelasan?: string;
  jenis?: JenisSoal;
  tingkat?: Tingkat;
}

const PLACEHOLDER_OPTION_PREFIXES = [
  "opsi a",
  "opsi b",
  "opsi c",
  "opsi d",
  "opsi e",
  "pernyataan a",
  "pernyataan b",
  "pernyataan c",
  "pernyataan d",
  "pernyataan alternatif",
  "pernyataan analisis konsep",
  "pilihan a",
  "pilihan b",
  "pilihan c",
  "pilihan d",
];

export function isPlaceholderOptions(opsi: string[]): boolean {
  if (!Array.isArray(opsi) || opsi.length === 0) return true;
  return opsi.every((opt) => {
    const lower = opt.trim().toLowerCase();
    return PLACEHOLDER_OPTION_PREFIXES.some((prefix) => lower.startsWith(prefix));
  });
}

/**
 * Membersihkan garis pemisah markdown horizontal (---, ***, ___),
 * header markdown trailing, atau spasi berlebih pada teks soal.
 */
export function cleanQuestionStem(text: string): string {
  return text
    .replace(/(?:\r\n|\r|\n)+[-*_]{3,}\s*$/g, "") // strip trailing divider line
    .replace(/^[-*_]{3,}\s*(?:\r\n|\r|\n)+/g, "") // strip leading divider line
    .replace(/^(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Soal|Nomor|Pertanyaan)\s*\d+(?:[\.\)\:\-–\s]|\s*\([^\)]*\))*[:\-–]?\s*/i, "")
    .replace(/\s+---+\s*$/g, "")
    .trim();
}

/**
 * Membersihkan awalan huruf opsi seperti "A. ", "B) ", "c: ", "[D] "
 * dan trailing divider baris.
 */
export function cleanOptionText(text: string): string {
  return text
    .replace(/^[ \t]*\[?[A-Ea-e]\]?[\.\)\:\-–]\s*/, "")
    .replace(/\s*[-*_]{3,}\s*$/, "")
    .trim();
}

/**
 * Mendeteksi dan mengekstrak blok kunci jawaban di bagian akhir dokumen.
 * Contoh:
 * --- --- #### 🔑 KUNCI JAWABAN & PEMBAHASAN MENDALAM
 * #### Jawaban Soal 1: B (20205)
 * Pembahasan Mendalam: ...
 */
export function extractTrailingAnswerKeys(content: string): {
  questionContent: string;
  answerKeyMap: Map<number, ParsedAnswerKey>;
} {
  const answerKeyMap = new Map<number, ParsedAnswerKey>();
  const normalized = content.replace(/\r\n/g, "\n");

  // Regex mendeteksi awal section kunci jawaban trailing
  const trailingSectionRegex = /(?:^|\n|\s+[-*_]{2,}\s*)[ \t]*(?:[-*_]{2,}\s*)*(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:[🔑🔍💡📌\s]*)(?:KUNCI\s+JAWABAN|DAFTAR\s+KUNCI|KUNCI\s+DAN\s+PEMBAHASAN)[\s\S]*$/i;
  const match = trailingSectionRegex.exec(normalized);

  if (!match) {
    return { questionContent: normalized, answerKeyMap };
  }

  const questionContent = normalized.slice(0, match.index).trim();
  const answerKeySection = normalized.slice(match.index);

  // Parse butir kunci jawaban per nomor
  const itemRegex = /(?:^|\n|\s+)(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Jawaban\s+(?:Soal\s+|Nomor\s+)?|Soal\s+|Nomor\s+)(\d+)[\.\)\:\-–\s]+([A-Ea-e])(?:\s*\([^\)]*\))?[\.\)\:\-–\s]*([\s\S]*?)(?=(?:\s*(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Jawaban\s+(?:Soal\s+|Nomor\s+)?|Soal\s+|Nomor\s+)\d+[\.\)\:\-–\s]+[A-Ea-e])|$)/gi;

  let im: RegExpExecArray | null;
  while ((im = itemRegex.exec(answerKeySection)) !== null) {
    const num = parseInt(im[1], 10);
    const rawKey = im[2].toUpperCase();
    let pembahasan = (im[3] || "").trim();

    // Bersihkan prefix pembahasan seperti "Pembahasan Mendalam:", "Pembahasan:", dsb
    pembahasan = pembahasan
      .replace(/^(?:[-*_]{2,}\s*)*(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Pembahasan(?:\s+Mendalam)?|Penjelasan|Alasan)\s*[:\-–]?\s*/i, "")
      .replace(/\s*[-*_]{2,}\s*$/, "")
      .trim();

    if (num && rawKey) {
      answerKeyMap.set(num, {
        num,
        kunci: rawKey,
        pembahasan: pembahasan || "Pertanyaan asesmen pemahaman konsep materi.",
      });
    }
  }

  return { questionContent, answerKeyMap };
}

/**
 * Ekstraksi opsi pilihan ganda dan stem pertanyaan dari sebuah blok soal.
 * Mendukung opsi multi-baris (A.\nB.\n...) dan inline (A. ... B. ... C. ...).
 */
export function extractOptionsAndStem(rawBlock: string): {
  pertanyaan: string;
  opsi: string[];
  inlineKunci?: string;
  inlinePembahasan?: string;
} {
  let text = rawBlock.trim();

  // 1. Cek kunci jawaban & pembahasan yang diletakkan langsung di dalam blok soal
  let inlineKunci: string | undefined;
  let inlinePembahasan: string | undefined;

  const kunciMatch = text.match(/(?:\n|^)[ \t]*(?:Kunci(?:\s+Jawaban)?|Jawaban\s+Benar)\s*[:\-–]?\s*([A-Ea-e])\b[^\n]*/i);
  if (kunciMatch) {
    inlineKunci = kunciMatch[1].toUpperCase();
    text = text.replace(kunciMatch[0], "").trim();
  }

  const pembMatch = text.match(/(?:\n|^)[ \t]*(?:Pembahasan|Penjelasan|Alasan)\s*[:\-–]?\s*([\s\S]+)$/i);
  if (pembMatch) {
    inlinePembahasan = pembMatch[1]
      .replace(/^(?:[-*_]{2,}\s*)*(?:#{1,6}\s+|[*_]{1,3}\s*)?/g, "")
      .replace(/\s*[-*_]{2,}\s*$/, "")
      .trim();
    text = text.replace(pembMatch[0], "").trim();
  }

  // 2. Cek opsi multi-baris standar (newline diawali A-E)
  const multilineRegex = /^[ \t]*([A-Ea-e])[.):\-–]\s*(.+)$/gm;
  const multilineMatches = Array.from(text.matchAll(multilineRegex));

  if (multilineMatches.length >= 3) {
    const firstOptIndex = multilineMatches[0].index ?? text.length;
    const stem = cleanQuestionStem(text.slice(0, firstOptIndex));
    const extractedOpsi = multilineMatches.map((m) => cleanOptionText(m[2])).filter(Boolean);

    return {
      pertanyaan: stem,
      opsi: extractedOpsi,
      inlineKunci,
      inlinePembahasan,
    };
  }

  // 3. Cek opsi inline (misal: "pertanyaan? A. Opsi 1 B. Opsi 2 C. Opsi 3 D. Opsi 4")
  const inlineLetterRegex = /(?:^|\s+)([A-Ea-e])[\.\)\:\-–]\s+/g;
  const occurrences: { letter: string; index: number; matchLen: number }[] = [];
  let lm: RegExpExecArray | null;

  while ((lm = inlineLetterRegex.exec(text)) !== null) {
    const letter = lm[1].toUpperCase();
    const offset = lm[0].indexOf(lm[1]);
    occurrences.push({
      letter,
      index: lm.index + offset,
      matchLen: lm[0].length - offset,
    });
  }

  // Cari sekuens yang memiliki minimal A, B, C berurutan
  let optStartIdx = -1;
  let optIndices: { letter: string; start: number; contentStart: number }[] = [];

  for (let i = 0; i < occurrences.length; i++) {
    if (occurrences[i].letter === "A") {
      const seq = [occurrences[i]];
      let expectedCharCode = "B".charCodeAt(0);

      for (let j = i + 1; j < occurrences.length; j++) {
        if (occurrences[j].letter.charCodeAt(0) === expectedCharCode) {
          seq.push(occurrences[j]);
          expectedCharCode++;
        }
      }

      if (seq.length >= 3) {
        optStartIdx = occurrences[i].index;
        optIndices = seq.map((s) => ({
          letter: s.letter,
          start: s.index,
          contentStart: s.index + s.matchLen,
        }));
        break;
      }
    }
  }

  if (optStartIdx >= 0 && optIndices.length >= 3) {
    const stem = cleanQuestionStem(text.slice(0, optStartIdx));
    const inlineOpsi: string[] = [];

    for (let k = 0; k < optIndices.length; k++) {
      const start = optIndices[k].contentStart;
      const end = k < optIndices.length - 1 ? optIndices[k + 1].start : text.length;
      const rawOpt = text.slice(start, end);
      const cleanOpt = cleanOptionText(rawOpt);
      if (cleanOpt) {
        inlineOpsi.push(cleanOpt);
      }
    }

    return {
      pertanyaan: stem,
      opsi: inlineOpsi,
      inlineKunci,
      inlinePembahasan,
    };
  }

  // Jika tidak ditemukan opsi pilihan ganda terstruktur
  return {
    pertanyaan: cleanQuestionStem(text),
    opsi: [],
    inlineKunci,
    inlinePembahasan,
  };
}

/**
 * Parsing lengkap teks markdown yang berisi butir-butir soal menjadi array Soal[] terstruktur.
 */
export function parseQuestionsFromMarkdown(content: string): Soal[] {
  if (!content || typeof content !== "string") return [];

  // 1. Pisahkan section kunci jawaban trailing jika ada
  const { questionContent, answerKeyMap } = extractTrailingAnswerKeys(content);

  // 2. Deteksi batas-batas soal (question headers)
  // Mendukung: "1. ", "**2. ", "### 3. ", "4) ", "Soal 5:", "#### SOAL 5 (Kategori: ...)"
  const questionHeaderRegex = /(?:^|\n|\s+[-*_]{2,}\s+)[ \t]*(?:[-*_]{2,}\s*)*(?:(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Soal|Nomor|Pertanyaan)\s*(\d+)(?:[\.\)\:\-–\s]|\s*\([^\)]*\))*[:\-–]?\s*|(?:#{1,6}\s+|[*_]{1,3}\s*)(\d+)[\.\)\:\-–]\s*|(\d+)[\.\)]\s+)/gi;

  const matches: { index: number; num: number; matchStr: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = questionHeaderRegex.exec(questionContent)) !== null) {
    const rawNum = m[1] || m[2] || m[3];
    const num = parseInt(rawNum, 10);
    const startIdx = m.index + (m[0].startsWith("\n") ? 1 : 0);
    matches.push({
      index: startIdx,
      num,
      matchStr: m[0],
    });
  }

  const questionBlocks: { block: string; num: number }[] = [];

  if (matches.length > 0) {
    // Jika ada teks pertanyaan sebelum header pertama (misal Soal 2 tidak diawali tulisan "Soal 2" karena terpotong)
    if (matches[0].index > 0) {
      const preamble = questionContent.slice(0, matches[0].index).trim();
      if (preamble.length >= 5) {
        questionBlocks.push({
          block: preamble,
          num: matches[0].num > 1 ? matches[0].num - 1 : 1,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i < matches.length - 1 ? matches[i + 1].index : questionContent.length;
      const rawSlice = questionContent.slice(start, end).trim();
      if (rawSlice) {
        questionBlocks.push({
          block: rawSlice,
          num: matches[i].num || i + 1,
        });
      }
    }
  } else {
    // Fallback: split berdasarkan newline yang diikuti angka titik
    const fallbackParts = questionContent
      .split(/\n(?=\d+\.\s+)/)
      .map((b) => b.trim())
      .filter(Boolean);

    fallbackParts.forEach((part, idx) => {
      questionBlocks.push({ block: part, num: idx + 1 });
    });
  }

  const parsedSoal: Soal[] = [];

  for (const { block, num } of questionBlocks) {
    // Hapus awalan nomor/header dari blok
    const cleanBlock = block
      .replace(
        /^(?:[-*_]{2,}\s*)*(?:(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Soal|Nomor|Pertanyaan)\s*\d+(?:[\.\)\:\-–\s]|\s*\([^\)]*\))*[:\-–]?\s*|(?:#{1,6}\s+|[*_]{1,3}\s*)\d+[\.\)\:\-–]\s*|\d+[\.\)]\s+)/i,
        ""
      )
      .trim();

    const { pertanyaan, opsi, inlineKunci, inlinePembahasan } = extractOptionsAndStem(cleanBlock);

    if (!pertanyaan || pertanyaan.length < 5) continue;

    // Tentukan jenis soal
    const jenis: JenisSoal = opsi.length >= 2 ? "Pilihan Ganda" : "Esai";

    // Opsi normalisasi jika Pilihan Ganda
    let finalOpsi: string[] = [];
    if (jenis === "Pilihan Ganda") {
      finalOpsi = opsi.slice(0, 5); // Simpan hingga 5 opsi (A-E)
      if (finalOpsi.length < 4) {
        const fallbacks = [
          "Pernyataan alternatif A",
          "Pernyataan alternatif B",
          "Pernyataan alternatif C",
          "Pernyataan alternatif D",
        ];
        while (finalOpsi.length < 4) {
          finalOpsi.push(fallbacks[finalOpsi.length]);
        }
      }

      // Pastikan opsi unik
      const seen = new Set<string>();
      finalOpsi = finalOpsi.map((opt, idx) => {
        const lower = opt.toLowerCase();
        if (seen.has(lower)) {
          const unique = `${opt} (${String.fromCharCode(65 + idx)})`;
          seen.add(unique.toLowerCase());
          return unique;
        }
        seen.add(lower);
        return opt;
      });
    }

    // Tentukan kunci jawaban
    // Prioritas: 1) Inline kunci dalam blok soal, 2) Kunci dari trailing answerKeyMap, 3) Default "A"
    const fromMap = answerKeyMap.get(num);
    let validKunci = "A";

    if (inlineKunci && ["A", "B", "C", "D", "E"].includes(inlineKunci)) {
      validKunci = inlineKunci;
    } else if (fromMap?.kunci && ["A", "B", "C", "D", "E"].includes(fromMap.kunci)) {
      validKunci = fromMap.kunci;
    }

    // Tentukan pembahasan
    let validPembahasan =
      inlinePembahasan ||
      fromMap?.pembahasan ||
      "Pertanyaan asesmen pemahaman konsep materi.";

    parsedSoal.push({
      id: uid(),
      pertanyaan,
      jenis,
      opsi: finalOpsi,
      kunci: validKunci,
      penjelasan: validPembahasan,
      tingkat: "Sedang",
      evidenceIds: ["ev_chat_assistant"],
    });
  }

  return parsedSoal;
}

/**
 * Memeriksa apakah suatu Soal memiliki pertanyaan yang tercampur (mengandung nomor soal lain,
 * opsi inline yang belum terurai, atau section kunci jawaban) dan mengurainya menjadi soal-soal terpisah yang rapi.
 */
export function sanitizeAndUnbundleSoal(soal: Soal): Soal[] {
  if (!soal || typeof soal !== "object") return [];

  const rawP = String(soal.pertanyaan || "").trim();
  if (!rawP) return [soal];

  // Indikator 1: Terdapat nomor soal berikutnya di dalam pertanyaan
  // contoh: "--- #### SOAL 5 (Kategori: ...)" atau "\n2. " atau "Soal 3:"
  const hasEmbeddedHeader = /(?:^|\n|\s+---+\s+)(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Soal|Nomor|Pertanyaan)\s*\d+/i.test(
    rawP
  );

  // Indikator 2: Terdapat section kunci jawaban di dalam pertanyaan
  const hasAnswerKeySection = /(?:KUNCI\s+JAWABAN|DAFTAR\s+KUNCI|####\s+Jawaban\s+Soal\s*\d+)/i.test(
    rawP
  );

  // Indikator 3: Terdapat opsi inline "A. ... B. ... C. ..." sementara soal.opsi kosong atau hanya placeholder
  const hasInlineOptions = /(?:^|\s+)[A-Da-d][\.\)\:\-–]\s+[\s\S]+(?:\s+[B-Eb-e][\.\)\:\-–]\s+)/i.test(
    rawP
  );
  const needsOptionExtraction =
    hasInlineOptions && (!soal.opsi || soal.opsi.length < 3 || isPlaceholderOptions(soal.opsi));

  if (!hasEmbeddedHeader && !hasAnswerKeySection && !needsOptionExtraction) {
    // Soal sudah rapi, cukup bersihkan divider trailing jika ada
    return [
      {
        ...soal,
        pertanyaan: cleanQuestionStem(rawP),
      },
    ];
  }

  // Jalankan parser untuk mengurai teks yang bertumpuk
  const parsed = parseQuestionsFromMarkdown(rawP);

  if (parsed.length >= 2) {
    // Berhasil memecah menjadi 2 atau lebih soal mandiri
    return parsed.map((item, idx) => ({
      ...item,
      id: idx === 0 ? soal.id : item.id, // pertahankan id asli untuk soal pertama
      tingkat: soal.tingkat || item.tingkat || "Sedang",
      evidenceIds: soal.evidenceIds || item.evidenceIds,
    }));
  }

  if (parsed.length === 1) {
    // 1 Soal, namun opsi atau kunci jawabannya berhasil diekstrak keluar dari pertanyaan
    const single = parsed[0];
    return [
      {
        ...soal,
        pertanyaan: single.pertanyaan || cleanQuestionStem(rawP),
        opsi: single.opsi.length >= 2 ? single.opsi : soal.opsi,
        kunci: single.kunci || soal.kunci || "A",
        penjelasan: single.penjelasan || soal.penjelasan,
      },
    ];
  }

  // Fallback jika tidak terurai
  return [
    {
      ...soal,
      pertanyaan: cleanQuestionStem(rawP),
    },
  ];
}

/**
 * Melakukan sanitasi dan unbundling pada seluruh daftar soal.
 * Menjamin tidak ada soal yang bertumpuk atau bercampur menjadi satu.
 */
export function sanitizeAndUnbundleSoalList(soalList: Soal[]): Soal[] {
  if (!Array.isArray(soalList)) return [];

  const result: Soal[] = [];
  for (const s of soalList) {
    const unbundled = sanitizeAndUnbundleSoal(s);
    result.push(...unbundled);
  }

  return result;
}
