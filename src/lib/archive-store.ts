import { supabase } from "@/integrations/supabase/client";
import { reloadModuls } from "./modul-store";
import { reloadPaketSoal } from "./soal-store";
import { refreshPenugasanGuru } from "./penugasan-store";

export type AcademicItemType = "modul" | "paket_soal" | "penugasan";

export interface ArchivedItem {
  id: string;
  itemType: AcademicItemType;
  judul: string;
  deskripsi: string;
  mapel: string;
  kelasNama: string;
  tahunAjaran: string;
  archivedAt: string;
  extraInfo: Record<string, any>;
}

/**
 * Mengambil seluruh data administrasi akademik guru yang sedang diarsipkan dari Supabase.
 * Menggunakan RPC get_teacher_archived_items() dengan proteksi RLS dan kepemilikan guru.
 */
export async function fetchTeacherArchivedItems(): Promise<ArchivedItem[]> {
  try {
    const { data, error } = await supabase.rpc("get_teacher_archived_items");

    if (error) {
      console.error("[ArchiveStore] Gagal mengambil daftar arsip:", error.message);
      throw new Error(`Gagal memuat arsip: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      itemType: item.item_type as AcademicItemType,
      judul: item.judul || "Tanpa Judul",
      deskripsi: item.deskripsi || "",
      mapel: item.mapel || "—",
      kelasNama: item.kelas_nama || "—",
      tahunAjaran: item.tahun_ajaran || "Tidak Terikat",
      archivedAt: item.archived_at,
      extraInfo: typeof item.extra_info === "object" && item.extra_info !== null ? item.extra_info : {},
    }));
  } catch (err) {
    console.error("[ArchiveStore] Error fetchTeacherArchivedItems:", err);
    throw err;
  }
}

/**
 * Mengarsipkan item akademik (Modul Ajar, Paket Soal, atau Penugasan).
 * Memanggil RPC archive_academic_item() yang aman dan mencatat audit log.
 */
export async function archiveAcademicItem(
  itemType: AcademicItemType,
  itemId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("archive_academic_item", {
      _item_type: itemType,
      _item_id: itemId,
    });

    if (error) {
      console.error("[ArchiveStore] Gagal mengarsipkan item:", error.message);
      throw new Error(error.message || "Gagal mengarsipkan data.");
    }

    // Refresh active in-memory stores accordingly
    if (itemType === "modul") {
      void reloadModuls();
    } else if (itemType === "paket_soal") {
      void reloadPaketSoal();
    } else if (itemType === "penugasan") {
      void refreshPenugasanGuru();
    }

    return {
      success: true,
      message: "Data berhasil diarsipkan ke Pusat Arsip.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengarsipkan data.";
    return { success: false, message: msg };
  }
}

/**
 * Memulihkan item akademik yang telah diarsipkan kembali ke daftar aktif.
 * Memanggil RPC restore_academic_item() yang mempertahankan ID asli dan relasi historis.
 */
export async function restoreAcademicItem(
  itemType: AcademicItemType,
  itemId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("restore_academic_item", {
      _item_type: itemType,
      _item_id: itemId,
    });

    if (error) {
      console.error("[ArchiveStore] Gagal memulihkan item:", error.message);
      throw new Error(error.message || "Gagal memulihkan data.");
    }

    // Refresh active in-memory stores accordingly
    if (itemType === "modul") {
      void reloadModuls();
    } else if (itemType === "paket_soal") {
      void reloadPaketSoal();
    } else if (itemType === "penugasan") {
      void refreshPenugasanGuru();
    }

    return {
      success: true,
      message: "Data berhasil dipulihkan ke daftar aktif.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memulihkan data.";
    return { success: false, message: msg };
  }
}

// ============================================================================
// CADANGAN DATA GURU LENGKAP (FULL DATA BACKUP & SNAPSHOT ENGINE)
// ============================================================================

export interface TeacherBackupSummary {
  totalKelas: number;
  totalMateriAjar: number;
  totalPaketSoal: number;
  totalPenugasan: number;
  totalJawabanSiswa: number;
  totalArsip: number;
}

export interface TeacherFullBackupData {
  meta: {
    app: "GuruPro AI";
    version: "1.0";
    exportedAt: string;
    teacher: {
      id: string;
      nama: string;
      email?: string;
      sekolah?: string;
    };
  };
  summary: TeacherBackupSummary;
  data: {
    kelas: any[];
    materiAjar: any[];
    paketSoal: any[];
    penugasan: any[];
    jawabanSiswa: any[];
    remedialJawaban: any[];
    arsipDokumen: ArchivedItem[];
  };
}

/**
 * Mengambil ringkasan kuantitatif seluruh data guru untuk kartu cadangan (backup summary).
 */
export async function getTeacherBackupSummary(guruId: string): Promise<TeacherBackupSummary> {
  try {
    const [kelasRes, modulRes, soalRes, tugasRes, arsipList] = await Promise.all([
      supabase.from("kelas").select("id", { count: "exact", head: true }).eq("guru_id", guruId),
      supabase.from("moduls").select("id", { count: "exact", head: true }),
      supabase.from("paket_soal").select("id", { count: "exact", head: true }),
      supabase.from("penugasan").select("id", { count: "exact", head: true }),
      fetchTeacherArchivedItems().catch(() => []),
    ]);

    const { count: jawabanCount } = await supabase
      .from("penugasan_jawaban")
      .select("id", { count: "exact", head: true });

    return {
      totalKelas: kelasRes.count ?? 0,
      totalMateriAjar: modulRes.count ?? 0,
      totalPaketSoal: soalRes.count ?? 0,
      totalPenugasan: tugasRes.count ?? 0,
      totalJawabanSiswa: jawabanCount ?? 0,
      totalArsip: arsipList.length,
    };
  } catch (err) {
    console.warn("[ArchiveStore] Gagal memuat ringkasan cadangan:", err);
    return {
      totalKelas: 0,
      totalMateriAjar: 0,
      totalPaketSoal: 0,
      totalPenugasan: 0,
      totalJawabanSiswa: 0,
      totalArsip: 0,
    };
  }
}

/**
 * Membuat paket cadangan data lengkap guru (snapshot) mencakup kelas, materi ajar,
 * bank soal, penugasan, nilai siswa, dan seluruh arsip dokumen.
 */
export async function generateTeacherFullBackup(
  guruId: string,
  teacherInfo: { nama: string; email?: string; sekolah?: string }
): Promise<TeacherFullBackupData> {
  try {
    // 1. Ambil data kelas yang diampu guru
    const { data: kelasData } = await supabase
      .from("kelas")
      .select("*")
      .eq("guru_id", guruId)
      .order("created_at", { ascending: false });

    // 2. Ambil data materi ajar (moduls)
    const { data: modulData } = await supabase
      .from("moduls")
      .select("*")
      .order("created_at", { ascending: false });

    // 3. Ambil data bank soal (paket_soal)
    const { data: soalData } = await supabase
      .from("paket_soal")
      .select("*")
      .order("created_at", { ascending: false });

    // 4. Ambil data penugasan
    const { data: tugasData } = await supabase
      .from("penugasan")
      .select("*")
      .order("created_at", { ascending: false });

    // 5. Ambil data pengumpulan / jawaban siswa
    const { data: jawabanData } = await supabase
      .from("penugasan_jawaban")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: remedialData } = await supabase
      .from("penugasan_remedial_jawaban")
      .select("*")
      .order("created_at", { ascending: false });

    // 6. Ambil dokumen arsip
    const arsipDokumen = await fetchTeacherArchivedItems().catch(() => []);

    const backupPayload: TeacherFullBackupData = {
      meta: {
        app: "GuruPro AI",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        teacher: {
          id: guruId,
          nama: teacherInfo.nama,
          email: teacherInfo.email,
          sekolah: teacherInfo.sekolah,
        },
      },
      summary: {
        totalKelas: kelasData?.length ?? 0,
        totalMateriAjar: modulData?.length ?? 0,
        totalPaketSoal: soalData?.length ?? 0,
        totalPenugasan: tugasData?.length ?? 0,
        totalJawabanSiswa: (jawabanData?.length ?? 0) + (remedialData?.length ?? 0),
        totalArsip: arsipDokumen.length,
      },
      data: {
        kelas: kelasData || [],
        materiAjar: modulData || [],
        paketSoal: soalData || [],
        penugasan: tugasData || [],
        jawabanSiswa: jawabanData || [],
        remedialJawaban: remedialData || [],
        arsipDokumen,
      },
    };

    return backupPayload;
  } catch (err) {
    console.error("[ArchiveStore] Gagal generateTeacherFullBackup:", err);
    throw new Error(err instanceof Error ? err.message : "Gagal menyusun data cadangan guru.");
  }
}

/**
 * Mengunduh file backup JSON ke penyimpanan lokal komputer pengguna.
 */
export function downloadTeacherBackupJson(backupData: TeacherFullBackupData): void {
  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const cleanName = (backupData.meta.teacher.nama || "guru")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `backup-gurupro-${cleanName}-${dateStr}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Memvalidasi berkas file backup JSON untuk memeriksa integritas data.
 */
export function validateTeacherBackupFile(content: string): {
  valid: boolean;
  summary?: TeacherBackupSummary;
  teacher?: { nama: string; email?: string };
  exportedAt?: string;
  error?: string;
} {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") {
      return { valid: false, error: "Format berkas tidak valid (bukan JSON objek)." };
    }

    if (parsed.meta?.app !== "GuruPro AI") {
      return {
        valid: false,
        error: "Berkas bukan merupakan cadangan resmi GuruPro AI.",
      };
    }

    if (!parsed.data || typeof parsed.data !== "object") {
      return { valid: false, error: "Struktur data berkas cadangan rusak atau tidak lengkap." };
    }

    return {
      valid: true,
      summary: parsed.summary || {
        totalKelas: Array.isArray(parsed.data.kelas) ? parsed.data.kelas.length : 0,
        totalMateriAjar: Array.isArray(parsed.data.materiAjar) ? parsed.data.materiAjar.length : 0,
        totalPaketSoal: Array.isArray(parsed.data.paketSoal) ? parsed.data.paketSoal.length : 0,
        totalPenugasan: Array.isArray(parsed.data.penugasan) ? parsed.data.penugasan.length : 0,
        totalJawabanSiswa: Array.isArray(parsed.data.jawabanSiswa) ? parsed.data.jawabanSiswa.length : 0,
        totalArsip: Array.isArray(parsed.data.arsipDokumen) ? parsed.data.arsipDokumen.length : 0,
      },
      teacher: parsed.meta?.teacher,
      exportedAt: parsed.meta?.exportedAt,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Gagal membaca isi JSON: ${err?.message || "Format rusak"}`,
    };
  }
}
