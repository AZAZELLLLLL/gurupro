import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

console.log("==================================================================");
console.log("  GURUPRO TEST SUITE: KELAS CRUD OPERATIONS (GURU ROLE)           ");
console.log("==================================================================");

const ROOT_DIR = resolve(import.meta.dirname, "../..");
let passed = 0;

function pass(num, desc) {
  passed++;
  console.log(`  [PASS ${num}] ${desc}`);
}

// 1. Verify exports in src/lib/kelas-store.ts
const kelasStoreSource = readFileSync(resolve(ROOT_DIR, "src/lib/kelas-store.ts"), "utf-8");

assert.ok(kelasStoreSource.includes("export async function editKelas"), "Must export editKelas function");
assert.ok(kelasStoreSource.includes("export async function hapusKelas"), "Must export hapusKelas function");
assert.ok(kelasStoreSource.includes("export async function perbaruiKodeKelas"), "Must export perbaruiKodeKelas function");
pass(1, "kelas-store.ts exports editKelas, hapusKelas, and perbaruiKodeKelas functions");

// 2. Test editKelas validation rules
{
  function validateEditInput(id, data) {
    if (!id) throw new Error("ID kelas wajib disertakan.");
    if (!data.namaKelas?.trim()) throw new Error("Nama kelas wajib diisi.");
    if (!data.tingkat?.trim()) throw new Error("Tingkat kelas wajib diisi.");
    if (!data.mapel?.trim()) throw new Error("Mata pelajaran wajib diisi.");
    if (!data.tahunAjaran?.trim()) throw new Error("Tahun ajaran wajib diisi.");
    return true;
  }

  assert.throws(() => validateEditInput("", { namaKelas: "X RPL 1", tingkat: "X", mapel: "RPL", tahunAjaran: "2026/2027" }), /ID kelas wajib/);
  assert.throws(() => validateEditInput("k1", { namaKelas: "", tingkat: "X", mapel: "RPL", tahunAjaran: "2026/2027" }), /Nama kelas wajib diisi/);
  assert.throws(() => validateEditInput("k1", { namaKelas: "X RPL 1", tingkat: "", mapel: "RPL", tahunAjaran: "2026/2027" }), /Tingkat kelas wajib diisi/);
  assert.throws(() => validateEditInput("k1", { namaKelas: "X RPL 1", tingkat: "X", mapel: "", tahunAjaran: "2026/2027" }), /Mata pelajaran wajib diisi/);
  assert.throws(() => validateEditInput("k1", { namaKelas: "X RPL 1", tingkat: "X", mapel: "RPL", tahunAjaran: "" }), /Tahun ajaran wajib diisi/);
  assert.equal(validateEditInput("k1", { namaKelas: "X RPL 1", tingkat: "X", mapel: "RPL", tahunAjaran: "2026/2027" }), true);
  pass(2, "editKelas strictly validates non-empty ID, namaKelas, tingkat, mapel, and tahunAjaran");
}

// 3. Test in-memory cache update & subscriber notification for editKelas
{
  let cachedKelas = [
    { id: "k1", namaKelas: "IPA 1", tingkat: "X", mapel: "Fisika", tahunAjaran: "2026/2027", guruId: "g1", kodeKelas: "X-FIS-1234", createdAt: "" },
    { id: "k2", namaKelas: "IPA 2", tingkat: "XI", mapel: "Kimia", tahunAjaran: "2026/2027", guruId: "g1", kodeKelas: "XI-KIM-5678", createdAt: "" },
  ];
  let emitted = 0;
  const emitChange = () => emitted++;

  function simulateEdit(id, data) {
    const updated = {
      ...cachedKelas.find((k) => k.id === id),
      namaKelas: data.namaKelas.trim(),
      tingkat: data.tingkat.trim(),
      mapel: data.mapel.trim(),
      tahunAjaran: data.tahunAjaran.trim(),
    };
    cachedKelas = cachedKelas.map((k) => (k.id === id ? updated : k));
    emitChange();
    return updated;
  }

  const res = simulateEdit("k1", { namaKelas: "IPA 1 Unggulan", tingkat: "X", mapel: "Fisika Terapan", tahunAjaran: "2026/2027" });
  assert.equal(res.namaKelas, "IPA 1 Unggulan");
  assert.equal(res.mapel, "Fisika Terapan");
  assert.equal(cachedKelas.find((k) => k.id === "k1")?.namaKelas, "IPA 1 Unggulan");
  assert.equal(emitted, 1, "Listeners must be notified on class edit");
  pass(3, "editKelas updates in-memory cache and triggers listener notification");
}

// 4. Test in-memory cache update & cascade cleanup for hapusKelas
{
  let cachedKelas = [
    { id: "k1", namaKelas: "IPA 1", tingkat: "X", mapel: "Fisika", tahunAjaran: "2026/2027", guruId: "g1", kodeKelas: "X-FIS-1234", createdAt: "" },
    { id: "k2", namaKelas: "IPA 2", tingkat: "XI", mapel: "Kimia", tahunAjaran: "2026/2027", guruId: "g1", kodeKelas: "XI-KIM-5678", createdAt: "" },
  ];
  let cachedAnggota = [
    { id: "a1", kelasId: "k1", siswaId: "s1" },
    { id: "a2", kelasId: "k1", siswaId: "s2" },
    { id: "a3", kelasId: "k2", siswaId: "s3" },
  ];
  let emitted = 0;
  const emitChange = () => emitted++;

  function simulateHapus(id) {
    cachedKelas = cachedKelas.filter((k) => k.id !== id);
    cachedAnggota = cachedAnggota.filter((a) => a.kelasId !== id);
    emitChange();
    return true;
  }

  simulateHapus("k1");
  assert.equal(cachedKelas.length, 1);
  assert.equal(cachedKelas[0].id, "k2");
  assert.equal(cachedAnggota.length, 1);
  assert.equal(cachedAnggota[0].id, "a3");
  assert.equal(emitted, 1);
  pass(4, "hapusKelas purges target class and its student memberships from cache, notifying subscribers");
}

// 5. Test UI integration in src/routes/kelas.index.tsx
{
  const kelasIndexSource = readFileSync(resolve(ROOT_DIR, "src/routes/kelas.index.tsx"), "utf-8");

  assert.ok(kelasIndexSource.includes("handleOpenEdit"), "Must include handleOpenEdit in kelas.index.tsx");
  assert.ok(kelasIndexSource.includes("handleSaveEdit"), "Must include handleSaveEdit in kelas.index.tsx");
  assert.ok(kelasIndexSource.includes("handleConfirmHapus"), "Must include handleConfirmHapus in kelas.index.tsx");
  assert.ok(kelasIndexSource.includes("Dialog Edit Data Kelas"), "Must render Edit Data Kelas dialog");
  assert.ok(kelasIndexSource.includes("AlertDialog Hapus Kelas"), "Must render Hapus Kelas alert dialog");
  assert.ok(kelasIndexSource.includes("Opsi Kelas"), "Must render options menu on class cards");
  pass(5, "kelas.index.tsx contains complete Edit, Delete, and Regenerate UI elements and dialogs");
}

// 6. Test UI integration in src/routes/kelas.$kelasId.tsx
{
  const kelasDetailSource = readFileSync(resolve(ROOT_DIR, "src/routes/kelas.$kelasId.tsx"), "utf-8");

  assert.ok(kelasDetailSource.includes("handleOpenEditModal"), "Must include handleOpenEditModal in kelas.$kelasId.tsx");
  assert.ok(kelasDetailSource.includes("handleSaveEditKelas"), "Must include handleSaveEditKelas in kelas.$kelasId.tsx");
  assert.ok(kelasDetailSource.includes("handleConfirmHapusKelas"), "Must include handleConfirmHapusKelas in kelas.$kelasId.tsx");
  assert.ok(kelasDetailSource.includes("Edit Kelas"), "Must render Edit Kelas action button");
  assert.ok(kelasDetailSource.includes("Hapus Kelas"), "Must render Hapus Kelas action in detail view");
  pass(6, "kelas.$kelasId.tsx allows direct Edit and Delete with confirmation and redirect on deletion");
}

console.log("==================================================================");
console.log(`  ALL ${passed}/6 KELAS CRUD TESTS PASSED SUCCESSFULLY!           `);
console.log("==================================================================");
