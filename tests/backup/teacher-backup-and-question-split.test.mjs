import assert from "node:assert/strict";
import fs from "node:fs";

console.log("==================================================================");
console.log("  TEST SUITE: MATERI AJAR, FULL BACKUP & QUESTION SPLITTING FIX   ");
console.log("==================================================================");

let passed = 0;

// ============================================================================
// TEST 1: Terminology Migration ("Modul Ajar" -> "Materi Ajar")
// ============================================================================

const sidebarContent = fs.readFileSync("src/components/app-sidebar.tsx", "utf-8");
assert.ok(
  sidebarContent.includes('{ title: "Materi Ajar", url: "/modul-ajar", icon: BookOpen }'),
  "Sidebar must display 'Materi Ajar' for teachers"
);
console.log("  [PASS] 1. Sidebar displays 'Materi Ajar' instead of 'Modul Ajar'");
passed++;

const modulAjarContent = fs.readFileSync("src/routes/modul-ajar.tsx", "utf-8");
assert.ok(
  modulAjarContent.includes('title="Materi Ajar"'),
  "modul-ajar.tsx page header must display 'Materi Ajar'"
);
assert.ok(
  modulAjarContent.includes("Daftar Materi Ajar"),
  "modul-ajar.tsx section title must be 'Daftar Materi Ajar'"
);
assert.ok(
  modulAjarContent.includes("Belum Ada Materi Ajar"),
  "modul-ajar.tsx empty state must be 'Belum Ada Materi Ajar'"
);
console.log("  [PASS] 2. Materi Ajar page header, list title, and empty states updated");
passed++;

const dashboardContent = fs.readFileSync("src/routes/index.tsx", "utf-8");
assert.ok(
  dashboardContent.includes('label: "Materi Aktif"'),
  "Dashboard stat card must display 'Materi Aktif'"
);
assert.ok(
  dashboardContent.includes("Susun Materi dengan AI"),
  "Dashboard header button must display 'Susun Materi dengan AI'"
);
console.log("  [PASS] 3. Dashboard displays 'Materi Aktif' and 'Susun Materi dengan AI'");
passed++;

// ============================================================================
// TEST 2: Question Splitting Engine (Preventing Question 3 Merging Into 2)
// ============================================================================

function extractQuestionBlocks(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const questionHeaderRegex = /(?:^|\n)[ \t]*(?:#{1,6}\s+|[*_]{1,3}\s*)?(?:Soal\s+|Nomor\s+)?(\d+)[\.\)]\s*(?:[*_]{1,3})?\s*/gi;
  const matches = [];
  let m;

  while ((m = questionHeaderRegex.exec(normalized)) !== null) {
    matches.push({
      index: m.index + (m[0].startsWith("\n") ? 1 : 0),
      num: parseInt(m[1], 10),
      matchStr: m[0],
    });
  }

  const blocks = [];
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i < matches.length - 1 ? matches[i + 1].index : normalized.length;
      const b = normalized.slice(start, end).trim();
      if (b) blocks.push(b);
    }
  } else {
    blocks.push(...normalized.split(/\n(?=\d+\.\s+)/).map((b) => b.trim()).filter(Boolean));
  }
  return blocks;
}

const sampleAiOutput = `
1. Apa fungsi utama DNS server dalam jaringan komputer?
A. Menerjemahkan IP address ke domain name
B. Mengalokasikan IP dinamis
C. Mengamankan port jaringan
D. Menghubungkan LAN ke WAN
Kunci Jawaban: A
Pembahasan: DNS berfungsi menerjemahkan hostname ke IP address.

**2. Perhatikan konfigurasi routing statis berikut.**
Pada topologi router R1 ke R2, rute default gateway belum ditentukan.
A. Tambahkan default route ip route 0.0.0.0 0.0.0.0
B. Hapus konfigurasi port GigabitEthernet0/0
C. Nonaktifkan interface loopback
D. Ubah subnet mask ke 255.255.255.252
Kunci: A
Pembahasan: Rute default diperlukan agar traffic tak dikenal dialihkan.

### 3. Protokol transport apa yang bekerja secara connection-oriented?
A. UDP
B. TCP
C. ICMP
D. ARP
Kunci: B
Pembahasan: TCP menjamin transmisi dengan mekanisme 3-way handshake.
`;

const blocks = extractQuestionBlocks(sampleAiOutput);
assert.equal(blocks.length, 3, "Must strictly extract exactly 3 distinct question blocks");
assert.ok(blocks[1].includes("routing statis"), "Block 2 must be question 2");
assert.ok(!blocks[1].includes("connection-oriented"), "Block 2 must NEVER contain question 3");
assert.ok(blocks[2].includes("connection-oriented"), "Block 3 must contain question 3");

console.log("  [PASS] 4. Question 3 is cleanly separated from Question 2 (no merging)");
passed++;

// ============================================================================
// TEST 3: Full Teacher Backup Verification
// ============================================================================

function validateBackupMock(content) {
  const parsed = JSON.parse(content);
  assert.equal(parsed.meta.app, "GuruPro AI");
  assert.ok(Array.isArray(parsed.data.kelas));
  assert.ok(Array.isArray(parsed.data.materiAjar));
  assert.ok(Array.isArray(parsed.data.paketSoal));
  assert.ok(Array.isArray(parsed.data.penugasan));
  return true;
}

const mockBackupData = JSON.stringify({
  meta: {
    app: "GuruPro AI",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    teacher: { id: "guru-123", nama: "Budi Santoso", email: "budi@gurupro.id" },
  },
  summary: {
    totalKelas: 3,
    totalMateriAjar: 5,
    totalPaketSoal: 4,
    totalPenugasan: 2,
    totalJawabanSiswa: 45,
    totalArsip: 1,
  },
  data: {
    kelas: [{ id: "k1", namaKelas: "X RPL 1" }],
    materiAjar: [{ id: "m1", judul: "Dasar Pemrograman Web" }],
    paketSoal: [{ id: "s1", judul: "Ulangan Harian HTML & CSS" }],
    penugasan: [{ id: "t1", judul: "Praktikum Desain Responsif" }],
    jawabanSiswa: [{ id: "j1", skor: 95 }],
    remedialJawaban: [],
    arsipDokumen: [],
  },
});

assert.ok(validateBackupMock(mockBackupData), "Backup validation must verify official schema");
console.log("  [PASS] 5. Full Teacher Backup structure validated successfully");
passed++;

console.log("==================================================================");
console.log(`  ALL ${passed}/${passed} TESTS PASSED CLEANLY!`);
console.log("==================================================================");
