import assert from "node:assert/strict";
import {
  parseQuestionsFromMarkdown,
  sanitizeAndUnbundleSoal,
  sanitizeAndUnbundleSoalList,
  extractTrailingAnswerKeys,
} from "../../src/lib/soal-parser.ts";

console.log("==================================================================");
console.log("     TEST SUITE: SOAL UNBUNDLE & BOUNDARY SANITIZATION            ");
console.log("==================================================================");

const screenshotSample = `
Kebutuhan B:* Sistem kendali mesin microcontroller pada perangkat medis real-time yang memiliki kapasitas RAM sangat terbatas (kurang dari 2 MB) dan membutuhkan kecepatan respons mikrodetik. Berdasarkan karakteristik bahasa Python yang telah kamu pelajari, bagaimana rekomendasi penerapan Python yang paling tepat untuk kasus di atas? A. Gunakan Python untuk Kebutuhan A dan Kebutuhan B, karena Python adalah bahasa serbaguna tanpa keterbatasan kecepatan dan memori. B. Gunakan Python untuk Kebutuhan A (karena ekosistem library AI/Data sangat kaya), namun hindari Python untuk Kebutuhan B (karena Python bersifat interpreted dan membutuhkan konsumsi memori tinggi). C. Gunakan Python hanya untuk Kebutuhan B, karena sintaks Python ringkas sehingga cocok untuk perangkat keras berukuran mikro. D. Hindari Python pada kedua kebutuhan tersebut, karena Python tidak memiliki library pendukung untuk AI maupun pengolahan data. E. Gunakan Python untuk Kebutuhan B, sedangkan Kebutuhan A lebih cocok menggunakan HTML dan CSS. --- #### SOAL 5 (Kategori: Refactoring / Penyederhanaan Kode - C6) Seorang pengembang pemula membuat kode Python untuk mengecek apakah seseorang tergolong usia dewasa (17 tahun ke atas) sebagai berikut: \`\`\`python
umur = 19
if umur >= 17:
    isdewasa = True
else:
    isdewasa = False
\`\`\` Sebagai seorang pengembang senior yang memahami filosofi Python ("Readability counts" dan efisiensi sintaks), manakah 1 baris kode di bawah ini yang paling tepat untuk menggantikan 5 baris kode pengkondisian if-else di atas tanpa mengubah logika program? A. isdewasa = umur >= 17 B. isdewasa = print(umur >= 17) C. isdewasa == True if umur >= 17 D. isdewasa = (umur == 17) E. str(isdewasa) = umur >= 17 --- --- #### 🔑 KUNCI JAWABAN & PEMBAHASAN MENDALAM #### Jawaban Soal 1: B (20205) Pembahasan Mendalam: Dalam Python, variabel a berisi string "20". Ketika string dikalikan dengan bilangan bulat ("20" 2), Python melakukan String Replication (pengulangan string), sehingga hasilnya adalah "2020" (bukan perkalian matematika 40). str(b) mengubah angka 5 menjadi string "5". Operator + di antara dua tipe data string berfungsi melakukan String Concatenation (penggabungan teks). Maka, "2020" + "5" menghasilkan "20205". Pelajaran HOTS: Menguji pemahaman siswa tentang perilaku operator overloading berdasarkan tipe data di Python. #### Jawaban Soal 2: A Pembahasan Mendalam: Python tidak menggunakan kurung kurawal {} untuk menandai struktur blok kode (seperti C++/Java), melainkan menggunakan Indentasi (spasi/tab). Ketika perintah print("Pertahankan nilai Anda.") tidak lagi menjorok ke dalam (di sejajarkan dengan baris if), Python menganggap perintah tersebut berada di luar blok pengkondisian. Akibatnya, perintah tersebut dieksekusi secara berurutan (sequential) tanpa memedulikan apakah kondisi if bernilai True atau False. Pelajaran HOTS: Menguji kejelian siswa dalam mengidentifikasi logical error akibat pelanggaran aturan indentasi Python. #### Jawaban Soal 3: A (80000) Pembahasan Mendalam: Langkah 1 (Kondisi Utama): Evaluasi totalbelanja > 100000. Karena 80000 > 100000 adalah False, maka program langsung melompat ke blok else utama (mengabaikan blok if bagian dalam). Langkah 2 (Kondisi Dalam): Di dalam blok else utama, ada evaluasi if ismember:. Karena ismember diubah menjadi False, maka program masuk ke blok else turunan, sehingga diskon = 0. Langkah 3 (Kalkulasi): $\\text{total\\_bayar} = 80000 - (80000 \\times \\frac{0}{100}) = 80000 - 0 = 80000$. Pelajaran HOTS: Menguji kemampuan code tracing (penelusuran logika bersarang/nested condition) secara sistematis. #### Jawaban Soal 4: B Pembahasan Mendalam: Kebutuhan A: Python sangat unggul di bidang Data Science & AI karena memiliki ekosistem pustaka (library) kaya seperti NumPy, Pandas, dan TensorFlow. Kebutuhan B: Python adalah bahasa interpreted yang memiliki overhead memori cukup besar dan eksekusi relatif lebih lambat dibanding bahasa C/C++. Untuk sistem real-time berbasis mikroprosesor dengan RAM < 2 MB, C/C++ jauh lebih efisien dalam manajemen memori tingkat rendah (low-level memory). Pelajaran HOTS: Menguji kemampuan evaluasi kritis siswa dalam memilih teknologi tepat guna sesuai batasan sistem industri nyata. #### Jawaban Soal 5: A (isdewasa = umur >= 17) Pembahasan Mendalam: Operasi perbandingan umur >= 17 secara alami sudah menghasilkan nilai kembalian bertipe Boolean (True atau False). Jika umur bernilai 19, ekspresi 19 >= 17 bernilai True. Nilai True ini langsung disimpan ke dalam variabel isdewasa. Menuliskan if ...: isdewasa = True else: isdewasa = False adalah bentuk penyusunan kode yang redundan (mubazir). Menggunakan isdewasa = umur >= 17 mencerminkan filosofi Python (Pythonic code) yang bersih, ringkas, dan mudah dibaca. Pelajaran HOTS: Menguji kemampuan...
`;

let passed = 0;

// Test 1: Extract trailing answer keys
const { questionContent, answerKeyMap } = extractTrailingAnswerKeys(screenshotSample);
assert.strictEqual(answerKeyMap.size, 5, "Must extract 5 answer keys");
assert.strictEqual(answerKeyMap.get(1)?.kunci, "B");
assert.strictEqual(answerKeyMap.get(2)?.kunci, "A");
assert.strictEqual(answerKeyMap.get(3)?.kunci, "A");
assert.strictEqual(answerKeyMap.get(4)?.kunci, "B");
assert.strictEqual(answerKeyMap.get(5)?.kunci, "A");
console.log("  [PASS] 1. Extracted 5 answer keys & explanations from trailing key section");
passed++;

// Test 2: Parse raw questions from screenshot markdown
const parsed = parseQuestionsFromMarkdown(screenshotSample);
assert.strictEqual(parsed.length, 2, "Must parse exactly 2 questions from the screenshot sample");
console.log("  [PASS] 2. Parsed exactly 2 distinct questions from screenshot sample");
passed++;

// Test 3: Validate Question 1 (Soal 2 from screenshot)
const q1 = parsed[0];
assert.ok(q1.pertanyaan.includes("Kebutuhan B:*"), "Q1 must contain question stem");
assert.ok(!q1.pertanyaan.includes("SOAL 5"), "Q1 stem must NOT contain SOAL 5");
assert.ok(!q1.pertanyaan.includes("KUNCI JAWABAN"), "Q1 stem must NOT contain answer key header");
assert.ok(!q1.pertanyaan.includes("A. Gunakan Python"), "Q1 stem must NOT contain inline options");
assert.strictEqual(q1.opsi.length, 5, "Q1 must have 5 extracted options (A through E)");
assert.ok(q1.opsi[0].includes("Gunakan Python untuk Kebutuhan A dan Kebutuhan B"), "Q1 option A must match");
assert.ok(q1.opsi[4].includes("HTML dan CSS"), "Q1 option E must match");
console.log("  [PASS] 3. Question 1 unbundled cleanly with 5 discrete options and no leaked text");
passed++;

// Test 4: Validate Question 2 (Soal 5 from screenshot)
const q2 = parsed[1];
assert.ok(q2.pertanyaan.includes("isdewasa = True"), "Q2 stem must contain code snippet");
assert.ok(!q2.pertanyaan.includes("KUNCI JAWABAN"), "Q2 stem must NOT contain answer key header");
assert.ok(!q2.pertanyaan.includes("A. isdewasa"), "Q2 stem must NOT contain inline options");
assert.strictEqual(q2.opsi.length, 5, "Q2 must have 5 extracted options (A through E)");
assert.strictEqual(q2.opsi[0], "isdewasa = umur >= 17", "Q2 option A must match");
assert.strictEqual(q2.opsi[4], "str(isdewasa) = umur >= 17", "Q2 option E must match");
assert.strictEqual(q2.kunci, "A", "Q2 answer key must be A");
assert.ok(q2.penjelasan?.includes("Operasi perbandingan umur >= 17"), "Q2 explanation must match answer key discussion");
console.log("  [PASS] 4. Question 2 (Soal 5) unbundled cleanly with code snippet, 5 options, key A, and explanation");
passed++;

// Test 5: Sanitize existing stored Soal object (mimicking user's current screen state in /soal)
const bloatedStoredSoal = {
  id: "soal-bloated-1",
  pertanyaan: screenshotSample,
  jenis: "Pilihan Ganda",
  opsi: ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
  kunci: "A",
  tingkat: "Sedang",
};

const unbundledList = sanitizeAndUnbundleSoalList([bloatedStoredSoal]);
assert.strictEqual(unbundledList.length, 2, "Bloated stored soal must be unbundled into 2 clean soal cards");
assert.strictEqual(unbundledList[0].id, "soal-bloated-1", "First unbundled soal must keep original id");
assert.notStrictEqual(unbundledList[1].id, "soal-bloated-1", "Second unbundled soal must have unique id");
assert.strictEqual(unbundledList[0].opsi.length, 5, "First unbundled soal must have 5 real options");
assert.strictEqual(unbundledList[1].opsi.length, 5, "Second unbundled soal must have 5 real options");
console.log("  [PASS] 5. sanitizeAndUnbundleSoalList successfully cleans and unfolds existing stored questions");
passed++;

console.log("\n==================================================================");
console.log(`TOTAL TESTS: ${passed} | PASSED: ${passed} | FAILED: 0`);
console.log("==================================================================");
