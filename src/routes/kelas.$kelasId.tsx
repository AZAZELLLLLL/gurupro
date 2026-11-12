import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  School,
  Search,
  Share2,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { initials, useAuth } from "@/lib/auth-store";
import {
  getKelasById,
  getKelasBySiswa,
  setujuiAnggota,
  tolakAnggota,
  useKelas,
  type AnggotaKelas,
  type Kelas,
} from "@/lib/kelas-store";
import { useModuls, saveModul, addModul, reloadModuls, getPublishedModulsForSiswa } from "@/lib/modul-store";
import type { Modul } from "@/lib/modul-types";
import {
  usePenugasanGuru,
  usePenugasanSiswa,
  createPenugasan,
  deletePenugasan,
  type Penugasan,
} from "@/lib/penugasan-store";
import { getTeacherSubmissionsSummary, getMySubmissionsMap, type PenugasanPengumpulan } from "@/lib/pengumpulan-store";
import { usePaketSoal, terbitkanSebagaiTugas, reloadPaketSoal } from "@/lib/soal-store";
import type { PaketSoal } from "@/lib/soal-types";
import {
  formatNilai,
  getKelasRekapData,
  type KelasRekapData,
} from "@/lib/rekap-store";

export const Route = createFileRoute("/kelas/$kelasId")({
  head: () => ({
    meta: [
      { title: "Monitoring Hub Kelas — GuruPro" },
      {
        name: "description",
        content:
          "Pusat monitoring aktivitas kelas, anggota, modul ajar, tugas aktif, dan rekap nilai.",
      },
    ],
  }),
  component: DetailKelasMonitoringPage,
});

function formatTanggal(isoDate: string) {
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoDate;
  }
}

function DetailKelasMonitoringPage() {
  const { kelasId } = Route.useParams();
  const { profile, ready, profileStatus } = useAuth();

  if (!ready || profileStatus === "loading") {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Memuat kelas pembelajaran…</p>
      </div>
    );
  }

  if (profile.role === "siswa") {
    return <SiswaKelasDetailView kelasId={kelasId} />;
  }

  if (profile.role !== "guru") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Akses Khusus Guru</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Halaman Monitoring Kelas hanya dapat diakses oleh akun Guru terdaftar.
          </p>
          <div className="pt-2 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/">Kembali ke Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <GuruKelasDetailMonitoringView kelasId={kelasId} />;
}

function GuruKelasDetailMonitoringView({ kelasId }: { kelasId: string }) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { kelasList, anggotaList, refresh } = useKelas();

  // Local state for direct reload / fallback fetching
  const [kelasDetail, setKelasDetail] = useState<Kelas | null>(null);
  const [loadingKelas, setLoadingKelas] = useState(true);
  const [targetTolak, setTargetTolak] = useState<AnggotaKelas | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKode, setCopiedKode] = useState(false);

  // Store data untuk tab modul dan tugas
  const allModuls = useModuls();
  const allPakets = usePaketSoal();
  const { penugasanList, reload: reloadPenugasan } = usePenugasanGuru();

  // Submissions summary cache untuk metrik pengumpulan tugas
  const [submissionSummary, setSubmissionSummary] = useState<
    Record<string, { submitted: number; perluDinilai: number; dinilai: number }>
  >({});

  useEffect(() => {
    getTeacherSubmissionsSummary().then((res) => {
      setSubmissionSummary(res.submissionsPerPenugasan || {});
    });
  }, [penugasanList]);

  // State Rekap Nilai Riil
  const [rekapData, setRekapData] = useState<KelasRekapData | null>(null);
  const [loadingRekap, setLoadingRekap] = useState(false);
  const [searchRekapQuery, setSearchRekapQuery] = useState("");

  useEffect(() => {
    let active = true;
    if (!kelasId) return;

    setLoadingRekap(true);
    getKelasRekapData(kelasId)
      .then((data) => {
        if (active) setRekapData(data);
      })
      .catch((err) => console.error("Gagal memuat rekap nilai kelas:", err))
      .finally(() => {
        if (active) setLoadingRekap(false);
      });

    return () => {
      active = false;
    };
  }, [kelasId]);

  // Ambil kelas dari cache atau Supabase
  useEffect(() => {
    let active = true;
    const fromCache = kelasList.find((k) => k.id === kelasId);
    if (fromCache) {
      setKelasDetail(fromCache);
      setLoadingKelas(false);
      return;
    }

    setLoadingKelas(true);
    getKelasById(kelasId)
      .then((k) => {
        if (active) setKelasDetail(k);
      })
      .finally(() => {
        if (active) setLoadingKelas(false);
      });

    return () => {
      active = false;
    };
  }, [kelasId, kelasList]);

  // Teacher-to-teacher isolation guard
  const currentUserId = user?.id || profile.id;
  if (
    !loadingKelas &&
    kelasDetail &&
    kelasDetail.guruId &&
    currentUserId &&
    kelasDetail.guruId !== currentUserId
  ) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-destructive">Akses Dibatasi</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Anda tidak memiliki izin untuk mengelola atau memantau kelas milik guru lain.
          </p>
          <div className="pt-2 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/kelas">Kembali ke Kelas Saya</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Siswa anggota kelas
  const anggotaKelas = anggotaList.filter((a) => a.kelasId === kelasId);
  const menungguList = anggotaKelas.filter((a) => a.status === "menunggu");
  const aktifList = anggotaKelas.filter((a) => a.status === "aktif");

  const getLinkUndangan = (kode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gurupro.app";
    return `${origin}/gabung/${kode}`;
  };

  const handleSalinKode = (kode: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(kode);
      setCopiedKode(true);
      setTimeout(() => setCopiedKode(false), 2000);
      toast.success(`Kode kelas ${kode} berhasil disalin!`);
    }
  };

  const handleSalinLink = (kode: string) => {
    const link = getLinkUndangan(kode);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success("Tautan undangan kelas berhasil disalin!");
    }
  };

  // Aksi persetujuan siswa
  const handleSetujui = async (item: AnggotaKelas) => {
    const ok = await setujuiAnggota(item.id);
    if (ok) {
      toast.success(`Siswa ${item.siswaNama} berhasil disetujui bergabung!`);
      await refresh();
    } else {
      toast.error("Gagal menyetujui siswa.");
    }
  };

  const handleKonfirmasiTolak = async () => {
    if (!targetTolak) return;
    const ok = await tolakAnggota(targetTolak.id);
    if (ok) {
      toast.success(`Permintaan bergabung dari ${targetTolak.siswaNama} telah ditolak.`);
      await refresh();
    } else {
      toast.error("Gagal menolak siswa.");
    }
    setTargetTolak(null);
  };

  // Filter modul ajar untuk kelas ini
  const modulKelas = allModuls.filter((m) => {
    if (!kelasDetail) return true;
    if (m.kelasId) {
      return m.kelasId === kelasDetail.id;
    }
    const modulKelasStr = (m.kelas || "").toLowerCase();
    const namaKelasStr = (kelasDetail.namaKelas || "").toLowerCase();
    const tingkatStr = (kelasDetail.tingkat || "").toLowerCase();
    const combinedStr = `${tingkatStr} ${namaKelasStr}`.trim();

    return (
      modulKelasStr.includes(combinedStr) ||
      modulKelasStr.includes(namaKelasStr)
    );
  });

  // State Tambah Modul ke Kelas
  const [openTambahModul, setOpenTambahModul] = useState(false);
  const [searchModulQuery, setSearchModulQuery] = useState("");
  const [selectedModulIds, setSelectedModulIds] = useState<string[]>([]);
  const [kirimLoading, setKirimLoading] = useState(false);

  // Modul yang sudah berstatus Terbit dan belum diarsipkan
  const publishedModuls = useMemo(() => {
    return allModuls.filter((m) => m.status === "Terbit" && !m.isArchived);
  }, [allModuls]);

  const isModulInThisClass = (m: Modul) => {
    if (!kelasDetail) return false;
    if (m.kelasId) {
      return m.kelasId === kelasDetail.id;
    }
    const modulKelasStr = (m.kelas || "").toLowerCase();
    const namaKelasStr = (kelasDetail.namaKelas || "").toLowerCase();
    const tingkatStr = (kelasDetail.tingkat || "").toLowerCase();
    const combinedStr = `${tingkatStr} ${namaKelasStr}`.trim();
    return modulKelasStr.includes(combinedStr) || modulKelasStr.includes(namaKelasStr);
  };

  const filteredPublishedModuls = useMemo(() => {
    const q = searchModulQuery.trim().toLowerCase();
    if (!q) return publishedModuls;
    return publishedModuls.filter(
      (m) =>
        m.judul.toLowerCase().includes(q) ||
        m.mapel.toLowerCase().includes(q) ||
        (m.kelas || "").toLowerCase().includes(q) ||
        (m.ringkasan || "").toLowerCase().includes(q),
    );
  }, [publishedModuls, searchModulQuery]);

  const handleKirimModulKeKelas = async () => {
    if (!kelasDetail || selectedModulIds.length === 0) return;
    setKirimLoading(true);
    try {
      let suksesCount = 0;
      for (const modulId of selectedModulIds) {
        const modul = allModuls.find((m) => m.id === modulId);
        if (!modul) continue;

        const kelasLabel = `${kelasDetail.tingkat} ${kelasDetail.namaKelas}`.trim();

        if (!modul.kelasId) {
          await saveModul({
            ...modul,
            kelasId: kelasDetail.id,
            kelas: kelasLabel,
          });
          suksesCount++;
        } else if (modul.kelasId !== kelasDetail.id) {
          await addModul({
            judul: modul.judul,
            kelas: kelasLabel,
            kelasId: kelasDetail.id,
            mapel: modul.mapel,
            status: "Terbit",
            sumberTipe: modul.sumberTipe,
            sumberInput: modul.sumberInput,
            sumberUrl: modul.sumberUrl,
            sumberJudul: modul.sumberJudul,
            sumberKutipan: modul.sumberKutipan,
            ringkasan: modul.ringkasan,
            sections: modul.sections,
            slides: modul.slides,
            isArchived: false,
            aiMetadata: modul.aiMetadata,
          });
          suksesCount++;
        }
      }

      await reloadModuls();
      toast.success(
        `Berhasil mengirim ${suksesCount} modul ke kelas ${kelasDetail.namaKelas}!`,
      );
      setSelectedModulIds([]);
      setOpenTambahModul(false);
    } catch (err: any) {
      console.error("[handleKirimModulKeKelas] Gagal mengirim modul:", err);
      toast.error(err?.message || "Gagal mengirim modul ke kelas.");
    } finally {
      setKirimLoading(false);
    }
  };


  // List tugas/penugasan terpadu untuk kelas ini
  const tugasKelasList = useMemo(() => {
    if (!kelasDetail) return [];

    const totalMurid = aktifList.length;
    const items: Array<{
      id: string;
      penugasanId?: string;
      paketSoalId?: string;
      judul: string;
      topik: string;
      totalSoal: number;
      deadline?: string | null;
      kkm: number;
      status: "published" | "draft" | "closed";
      submittedCount: number;
      totalSiswa: number;
    }> = [];

    const handledPaketIds = new Set<string>();

    // 1. Data penugasan resmi dari tabel penugasan untuk kelas ini
    const forThisClass = penugasanList.filter(
      (p) => p.kelasId === kelasId && !p.isArchived,
    );

    for (const p of forThisClass) {
      if (p.paketSoalId) handledPaketIds.add(p.paketSoalId);
      const summ = submissionSummary[p.id];
      const submittedCount = summ?.submitted ?? 0;
      items.push({
        id: p.id,
        penugasanId: p.id,
        paketSoalId: p.paketSoalId,
        judul: p.judul,
        topik: p.paketSoalJudul || "Umum",
        totalSoal: p.totalSoal || 0,
        deadline: p.deadline,
        kkm: p.kkm || 75,
        status: p.status,
        submittedCount,
        totalSiswa: totalMurid,
      });
    }

    // 2. Paket soal dari Bank Soal yang ditandai untuk kelas ini
    const namaKelasStr = (kelasDetail.namaKelas || "").toLowerCase();
    const tingkatStr = (kelasDetail.tingkat || "").toLowerCase();
    const combinedStr = `${tingkatStr} ${namaKelasStr}`.trim();

    const taggedPakets = allPakets.filter((p) => {
      if (handledPaketIds.has(p.id)) return false;
      if (!p.kelas || p.kelas.length === 0) return false;
      return p.kelas.some((k) => {
        const kStr = (k || "").toLowerCase();
        return (
          kStr.includes(combinedStr) ||
          kStr.includes(namaKelasStr) ||
          kStr === tingkatStr
        );
      });
    });

    for (const p of taggedPakets) {
      items.push({
        id: p.id,
        paketSoalId: p.id,
        judul: p.judul,
        topik: p.topik || "Umum",
        totalSoal: p.soal?.length || 0,
        deadline: null,
        kkm: 75,
        status: p.status === "Terbit" ? "published" : "draft",
        submittedCount: 0,
        totalSiswa: totalMurid,
      });
    }

    return items;
  }, [kelasDetail, penugasanList, allPakets, kelasId, aktifList.length, submissionSummary]);

  // State Tambah Tugas ke Kelas
  const [openTambahTugas, setOpenTambahTugas] = useState(false);
  const [searchPaketQuery, setSearchPaketQuery] = useState("");
  const [selectedPaketIds, setSelectedPaketIds] = useState<string[]>([]);
  const [deadlineTugas, setDeadlineTugas] = useState("");
  const [kkmTugas, setKkmTugas] = useState(75);
  const [instruksiTugas, setInstruksiTugas] = useState("");
  const [kirimTugasLoading, setKirimTugasLoading] = useState(false);

  // Paket Soal yang siap ditugaskan dari Bank Soal
  const availablePaketSoal = useMemo(() => {
    return (allPakets || []).filter((p) => p.soal && p.soal.length > 0);
  }, [allPakets]);

  const filteredPaketSoal = useMemo(() => {
    const q = searchPaketQuery.trim().toLowerCase();
    if (!q) return availablePaketSoal;
    return availablePaketSoal.filter(
      (p) =>
        p.judul.toLowerCase().includes(q) ||
        (p.topik || "").toLowerCase().includes(q),
    );
  }, [availablePaketSoal, searchPaketQuery]);

  const isPaketAlreadyInThisClass = (paketId: string) => {
    return tugasKelasList.some((t) => t.paketSoalId === paketId);
  };

  const handleKirimTugasKeKelas = async () => {
    if (!kelasDetail || selectedPaketIds.length === 0) return;
    setKirimTugasLoading(true);
    try {
      let suksesCount = 0;
      const kelasLabel = `${kelasDetail.tingkat} ${kelasDetail.namaKelas}`.trim();

      for (const paketId of selectedPaketIds) {
        const paket = allPakets.find((p) => p.id === paketId);
        if (!paket) continue;

        const res = await createPenugasan({
          kelasId: kelasDetail.id,
          paketSoalId: paket.id,
          judul: `Tugas: ${paket.judul}`,
          instruksi: instruksiTugas ? instruksiTugas.trim() : undefined,
          deadline: deadlineTugas ? new Date(deadlineTugas).toISOString() : null,
          status: "published",
          kkm: Number(kkmTugas) || 75,
        });

        if (res.ok) {
          suksesCount++;
        }

        await terbitkanSebagaiTugas(paket.id, [kelasLabel]);
      }

      await reloadPenugasan();
      await reloadPaketSoal();

      toast.success(
        `Berhasil menerbitkan ${suksesCount} tugas ke kelas ${kelasDetail.namaKelas}!`,
      );
      setSelectedPaketIds([]);
      setSearchPaketQuery("");
      setDeadlineTugas("");
      setInstruksiTugas("");
      setKkmTugas(75);
      setOpenTambahTugas(false);
    } catch (err: any) {
      console.error("[handleKirimTugasKeKelas] Gagal mengirim penugasan:", err);
      toast.error(err?.message || "Gagal mengirim penugasan ke kelas.");
    } finally {
      setKirimTugasLoading(false);
    }
  };


  if (loadingKelas) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Memuat data kelas dan monitoring…</p>
      </div>
    );
  }

  if (!kelasDetail) {
    return (
      <div className="grid gap-6">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/kelas">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Kembali ke Kelas Saya
            </Link>
          </Button>
        </div>
        <Card className="border-destructive/30 py-12 text-center">
          <CardContent>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold text-navy">Kelas Tidak Ditemukan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kelas yang Anda cari mungkin sudah dihapus atau ID tidak sesuai.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/kelas">Lihat Semua Kelas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Top Bar / Navigation Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 font-medium">
            <Link to="/kelas">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Kelas Saya
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 shadow-xs">
            <span className="text-xs text-muted-foreground">Kode Kelas:</span>
            <code className="font-mono text-sm font-bold text-primary">
              {kelasDetail.kodeKelas}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              onClick={() => handleSalinKode(kelasDetail.kodeKelas)}
              title="Salin Kode"
            >
              {copiedKode ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <Button
            size="sm"
            variant="default"
            onClick={() => handleSalinLink(kelasDetail.kodeKelas)}
            className="h-9 gap-1.5 font-medium shadow-xs"
          >
            {copiedLink ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            Salin Link Undangan
          </Button>
        </div>
      </div>

      {/* Info Banner Kelas */}
      <Card className="border-primary/20 bg-linear-to-r from-primary-soft/40 via-card to-card shadow-xs">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary hover:bg-primary/90">
                {kelasDetail.tingkat} · {kelasDetail.mapel}
              </Badge>
              <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                Tahun Ajaran {kelasDetail.tahunAjaran}
              </Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-navy sm:text-3xl">
              {kelasDetail.namaKelas}
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitoring Hub: Pantau anggota, penugasan, modul ajar, dan capaian belajar siswa
              secara terpusat.
            </p>
          </div>

          <div className="flex items-center gap-6 rounded-xl border bg-card/80 px-4 py-3 shadow-xs">
            <div className="text-center">
              <p className="font-display text-2xl font-bold text-navy">{aktifList.length}</p>
              <p className="text-xs text-muted-foreground">Murid Aktif</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <p
                className={`font-display text-2xl font-bold ${menungguList.length > 0 ? "text-amber-600" : "text-muted-foreground"}`}
              >
                {menungguList.length}
              </p>
              <p className="text-xs text-muted-foreground">Menunggu Verifikasi</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 Tabs Monitoring */}
      <Tabs defaultValue="anggota" className="grid gap-6">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-flex md:grid-cols-4">
          <TabsTrigger value="anggota" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Anggota & Verifikasi</span>
            {menungguList.length > 0 ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                {menungguList.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="modul" className="gap-2">
            <BookOpen className="h-4 w-4" />
            <span>Modul Ajar</span>
          </TabsTrigger>
          <TabsTrigger value="tugas" className="gap-2">
            <FileQuestion className="h-4 w-4" />
            <span>Tugas Aktif</span>
          </TabsTrigger>
          <TabsTrigger value="nilai" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            <span>Rekap Nilai</span>
          </TabsTrigger>
        </TabsList>

        {/* ================= TAB 1: ANGGOTA & VERIFIKASI ================= */}
        <TabsContent value="anggota" className="space-y-6">
          {/* Section 1: Permintaan Bergabung */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Permintaan Bergabung (Menunggu Persetujuan)
                  </CardTitle>
                  <CardDescription>
                    Calon murid yang telah mendaftar menggunakan kode kelas Anda dan memerlukan
                    verifikasi.
                  </CardDescription>
                </div>
                {menungguList.length > 0 ? (
                  <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700">
                    {menungguList.length} Permintaan
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {menungguList.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <UserCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-2 font-medium">Tidak ada siswa yang menunggu persetujuan.</p>
                  <p className="text-xs">
                    Semua permintaan bergabung ke kelas ini telah selesai diproses.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Siswa</TableHead>
                        <TableHead>NISN</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Tanggal Diajukan</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {menungguList.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold text-navy">
                            <div className="flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">
                                {initials(item.siswaNama)}
                              </span>
                              <span>{item.siswaNama}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.siswaNisn || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.siswaEmail}
                          </TableCell>
                          <TableCell className="text-xs">{formatTanggal(item.diajukan)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                                onClick={() => handleSetujui(item)}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setTargetTolak(item)}
                              >
                                <X className="h-3.5 w-3.5" />
                                Tolak
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Daftar Siswa Aktif */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Daftar Siswa Aktif
                  </CardTitle>
                  <CardDescription>
                    Siswa terdaftar yang telah diverifikasi dan memiliki akses penuh ke materi serta
                    tugas kelas ini.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  Total {aktifList.length} Murid
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {aktifList.length === 0 ? (
                <div className="py-12 text-center">
                  <School className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Siswa Aktif di Kelas Ini
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bagikan kode kelas <strong>{kelasDetail.kodeKelas}</strong> atau tautan
                    pendaftaran kepada siswa untuk mulai belajar bersama.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-1.5"
                    onClick={() => handleSalinLink(kelasDetail.kodeKelas)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Salin Link Undangan
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>Nama Lengkap</TableHead>
                        <TableHead>NISN</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Tanggal Bergabung</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aktifList.map((siswa, idx) => (
                        <TableRow key={siswa.id}>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-semibold text-navy">
                            <div className="flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold text-secondary-foreground">
                                {initials(siswa.siswaNama)}
                              </span>
                              <span>{siswa.siswaNama}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {siswa.siswaNisn || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {siswa.siswaEmail}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatTanggal(siswa.diajukan)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= TAB 2: MODUL AJAR (MONITORING) ================= */}
        <TabsContent value="modul" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Modul Ajar Aktif ({kelasDetail.namaKelas})
                  </CardTitle>
                  <CardDescription>
                    Perangkat ajar dan materi kurikulum yang telah disusun untuk kelas{" "}
                    {kelasDetail.tingkat} {kelasDetail.namaKelas}.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 shadow-xs font-medium"
                  onClick={() => setOpenTambahModul(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Modul
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {modulKelas.length === 0 ? (
                <div className="py-12 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Modul Khusus untuk Kelas Ini
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                    Kirim modul yang telah dipublikasikan ke kelas ini, atau susun modul baru untuk mata pelajaran{" "}
                    {kelasDetail.mapel}.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={() => setOpenTambahModul(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Tambah Modul
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                      <Link to="/modul-ajar">
                        <Sparkles className="h-4 w-4" />
                        Susun di Modul Ajar
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Judul Modul</TableHead>
                        <TableHead>Jumlah Bab / Bagian</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Terakhir Diperbarui</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modulKelas.map((modul) => (
                        <TableRow key={modul.id}>
                          <TableCell className="font-semibold text-navy">
                            <div>
                              <p>{modul.judul}</p>
                              <p className="text-xs font-normal text-muted-foreground">
                                {modul.mapel} · {modul.sumberTipe}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {modul.sections.length} Bab
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {modul.status === "Terbit" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700">Terbit</Badge>
                            ) : (
                              <Badge variant="secondary">Draft</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTanggal(modul.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                                <Link to="/modul-ajar">
                                  Buka Modul
                                  <ArrowRight className="h-3 w-3" />
                                </Link>
                              </Button>
                              {modul.kelasId === kelasDetail.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={async () => {
                                    if (confirm(`Lepaskan modul "${modul.judul}" dari kelas ${kelasDetail.namaKelas}?`)) {
                                      await saveModul({
                                        ...modul,
                                        kelasId: undefined,
                                        kelas: "",
                                      });
                                      await reloadModuls();
                                      toast.success(`Modul dilepas dari kelas ${kelasDetail.namaKelas}.`);
                                    }
                                  }}
                                  title="Lepas modul dari kelas ini"
                                >
                                  Lepas
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= TAB 3: TUGAS AKTIF (MONITORING) ================= */}
        <TabsContent value="tugas" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Tugas & Penugasan Berjalan
                  </CardTitle>
                  <CardDescription>
                    Status paket tugas, batas waktu pengerjaan, dan rasio pengumpulan siswa di kelas{" "}
                    {kelasDetail.namaKelas}.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 shadow-xs font-medium"
                  onClick={() => setOpenTambahTugas(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Tugas
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {tugasKelasList.length === 0 ? (
                <div className="py-12 text-center">
                  <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Tugas Aktif untuk Kelas Ini
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                    Kirim paket soal dari Bank Soal ke kelas ini sebagai penugasan aktif, atau susun paket soal baru.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={() => setOpenTambahTugas(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Tambah Tugas ke Kelas
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                      <Link to="/soal">
                        <Sparkles className="h-4 w-4" />
                        Susun di Bank Soal
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Tugas / Soal</TableHead>
                        <TableHead>Topik Materi</TableHead>
                        <TableHead>Jumlah Soal</TableHead>
                        <TableHead>Progres Pengumpulan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tugasKelasList.map((tugas) => {
                        const totalSiswa = tugas.totalSiswa || aktifList.length || 0;
                        const terkumpul = tugas.submittedCount || 0;
                        const persentase = totalSiswa > 0 ? Math.round((terkumpul / totalSiswa) * 100) : 0;

                        return (
                          <TableRow key={tugas.id}>
                            <TableCell className="font-semibold text-navy">
                              <div>
                                <p>{tugas.judul}</p>
                                {tugas.deadline && (
                                  <p className="text-xs font-normal text-amber-600 flex items-center gap-1 mt-0.5">
                                    <Clock className="h-3 w-3" />
                                    Tenggat: {formatTanggal(tugas.deadline)}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {tugas.topik}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {tugas.totalSoal} Butir
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full bg-primary"
                                    style={{
                                      width: `${Math.min(100, persentase)}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-xs font-semibold">
                                  {terkumpul}/{totalSiswa} Siswa ({persentase}%)
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {tugas.status === "published" ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-700">
                                  Berjalan
                                </Badge>
                              ) : tugas.status === "closed" ? (
                                <Badge variant="secondary">Ditutup</Badge>
                              ) : (
                                <Badge variant="secondary">Draft</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1 text-xs"
                                >
                                  <Link
                                    to="/penugasan"
                                    search={tugas.penugasanId ? { penugasanId: tugas.penugasanId } : undefined}
                                  >
                                    Buka Penugasan
                                    <ArrowRight className="h-3 w-3" />
                                  </Link>
                                </Button>
                                {tugas.penugasanId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                      if (confirm(`Lepaskan / hapus tugas "${tugas.judul}" dari kelas ${kelasDetail.namaKelas}?`)) {
                                        await deletePenugasan(tugas.penugasanId!);
                                        await reloadPenugasan();
                                        toast.success(`Tugas dilepas dari kelas ${kelasDetail.namaKelas}.`);
                                      }
                                    }}
                                    title="Lepas tugas dari kelas ini"
                                  >
                                    Lepas
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= TAB 4: REKAP NILAI (MONITORING) ================= */}
        <TabsContent value="nilai" className="space-y-6">
          {loadingRekap ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Memuat rekapitulasi nilai kelas…</p>
            </div>
          ) : !rekapData ? (
            <Card className="py-12 text-center">
              <CardContent>
                <AlertCircle className="mx-auto h-10 w-10 text-destructive/40" />
                <p className="mt-3 font-semibold text-navy">Data Rekap Nilai Belum Tersedia</p>
                <p className="text-xs text-muted-foreground">
                  Data nilai kelas tidak dapat diakses atau belum tersedia saat ini.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Stats Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-border/60">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Users className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl font-bold text-navy">
                        {rekapData.totalSiswa}
                      </p>
                      <p className="text-xs text-muted-foreground">Siswa Aktif</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <FileQuestion className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl font-bold text-navy">
                        {rekapData.daftarPenugasan.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Tugas Terbit</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl font-bold text-navy">
                        {rekapData.totalSubmissionsDinilai}
                      </p>
                      <p className="text-xs text-muted-foreground">Tugas Dinilai</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                      <GraduationCap className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl font-bold text-navy">
                        {formatNilai(rekapData.rataRataKelas)}
                      </p>
                      <p className="text-xs text-muted-foreground">Rata-Rata Kelas</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Rekap Table Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="font-display text-base text-navy">
                        Rekapitulasi Nilai Siswa
                      </CardTitle>
                      <CardDescription>
                        Capaian nilai resmi seluruh murid aktif pada penugasan kelas{" "}
                        {kelasDetail.namaKelas}.
                      </CardDescription>
                    </div>

                    <div className="relative w-full sm:w-60">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Cari siswa atau NISN…"
                        value={searchRekapQuery}
                        onChange={(e) => setSearchRekapQuery(e.target.value)}
                        className="pl-8 h-8 text-xs shadow-xs"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-0 sm:px-6">
                  {rekapData.totalSiswa === 0 ? (
                    <div className="py-12 text-center">
                      <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground/30" />
                      <p className="mt-3 font-display text-base font-semibold text-navy">
                        Belum Ada Siswa Aktif
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Verifikasi pendaftaran siswa pada tab Anggota terlebih dahulu untuk mulai
                        merekap nilai.
                      </p>
                    </div>
                  ) : rekapData.daftarPenugasan.length === 0 ? (
                    <div className="py-12 text-center">
                      <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground/30" />
                      <p className="mt-3 font-display text-base font-semibold text-navy">
                        Belum Ada Penugasan Terbit
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Publikasikan penugasan untuk kelas ini di menu Penugasan agar nilai siswa
                        dapat direkap.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12 text-center">No</TableHead>
                            <TableHead className="min-w-[160px]">Nama Siswa</TableHead>
                            <TableHead className="w-24">NISN</TableHead>

                            {/* Kolom Tiap Penugasan */}
                            {rekapData.daftarPenugasan.map((tugas) => (
                              <TableHead
                                key={tugas.id}
                                className="text-center min-w-[110px] max-w-[140px] truncate"
                                title={tugas.judul}
                              >
                                <span className="block truncate">{tugas.judul}</span>
                              </TableHead>
                            ))}

                            <TableHead className="w-24 text-center font-bold text-navy">
                              Rata-Rata
                            </TableHead>
                            <TableHead className="w-28 text-center">Kelengkapan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rekapData.siswaRows
                            .filter((s) => {
                              const q = searchRekapQuery.toLowerCase().trim();
                              if (!q) return true;
                              return (
                                s.siswaNama.toLowerCase().includes(q) ||
                                (s.siswaNisn && s.siswaNisn.toLowerCase().includes(q))
                              );
                            })
                            .map((siswa, idx) => {
                              const totalTugas = rekapData.daftarPenugasan.length;
                              const isLengkap =
                                totalTugas > 0 && siswa.totalTugasDinilai === totalTugas;
                              const isSebagian =
                                siswa.totalTugasDinilai > 0 && siswa.totalTugasDinilai < totalTugas;

                              return (
                                <TableRow key={siswa.siswaId}>
                                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                    {idx + 1}
                                  </TableCell>
                                  <TableCell className="font-semibold text-navy">
                                    {siswa.siswaNama}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">
                                    {siswa.siswaNisn || "—"}
                                  </TableCell>

                                  {/* Skor Per Tugas */}
                                  {rekapData.daftarPenugasan.map((tugas) => {
                                    const nItem = siswa.nilaiPerTugas[tugas.id];

                                    if (!nItem || nItem.statusPengumpulan === "belum_mengumpulkan") {
                                      return (
                                        <TableCell
                                          key={tugas.id}
                                          className="text-center text-xs text-muted-foreground"
                                        >
                                          —
                                        </TableCell>
                                      );
                                    }

                                    if (nItem.statusPenilaian === "dinilai" && nItem.nilaiAkhir !== null) {
                                      return (
                                        <TableCell
                                          key={tugas.id}
                                          className="text-center font-mono text-xs font-bold text-navy"
                                        >
                                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 border border-emerald-200">
                                            {formatNilai(nItem.nilaiAkhir)}
                                          </span>
                                        </TableCell>
                                      );
                                    }

                                    if (nItem.statusPenilaian === "perlu_penilaian_manual") {
                                      return (
                                        <TableCell key={tugas.id} className="text-center">
                                          <Badge
                                            variant="outline"
                                            className="border-indigo-300 bg-indigo-50 text-[10px] text-indigo-800"
                                          >
                                            Diproses AI
                                          </Badge>
                                        </TableCell>
                                      );
                                    }

                                    if (nItem.statusPengumpulan === "submitted") {
                                      return (
                                        <TableCell key={tugas.id} className="text-center">
                                          <Badge
                                            variant="outline"
                                            className="border-blue-300 bg-blue-50 text-[10px] text-blue-800"
                                          >
                                            Terkumpul
                                          </Badge>
                                        </TableCell>
                                      );
                                    }

                                    return (
                                      <TableCell key={tugas.id} className="text-center">
                                        <Badge variant="secondary" className="text-[10px]">
                                          Draf
                                        </Badge>
                                      </TableCell>
                                    );
                                  })}

                                  {/* Rata-Rata Siswa */}
                                  <TableCell className="text-center font-mono text-xs font-bold text-navy">
                                    {siswa.rataRata !== null ? (
                                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                                        {formatNilai(siswa.rataRata)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>

                                  {/* Kelengkapan */}
                                  <TableCell className="text-center">
                                    {isLengkap ? (
                                      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                                        Lengkap
                                      </Badge>
                                    ) : isSebagian ? (
                                      <Badge variant="outline" className="border-blue-300 text-blue-700 text-[10px]">
                                        {siswa.totalTugasDinilai}/{totalTugas}
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                                        Belum Dinilai
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Konfirmasi Tolak Siswa */}
      <AlertDialog open={!!targetTolak} onOpenChange={(open) => !open && setTargetTolak(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak Permintaan Bergabung?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menolak permohonan siswa{" "}
              <strong>{targetTolak?.siswaNama}</strong>? Siswa ini tidak akan masuk ke dalam daftar
              murid kelas {kelasDetail.namaKelas}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleKonfirmasiTolak}
            >
              Ya, Tolak Permintaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Tambah Modul ke Kelas */}
      <Dialog
        open={openTambahModul}
        onOpenChange={(open) => {
          setOpenTambahModul(open);
          if (!open) {
            setSelectedModulIds([]);
            setSearchModulQuery("");
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-display font-semibold text-navy">
              Tambah Modul Ajar ke Kelas {kelasDetail.namaKelas}
            </DialogTitle>
            <DialogDescription>
              Pilih modul ajar yang telah berstatus <strong>Terbit</strong> untuk dikirim dan diakses oleh murid kelas {kelasDetail.tingkat} {kelasDetail.namaKelas}.
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari modul ajar berdasarkan judul atau mata pelajaran..."
                value={searchModulQuery}
                onChange={(e) => setSearchModulQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2.5 min-h-[200px] max-h-[50vh]">
            {publishedModuls.length === 0 ? (
              <div className="py-10 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="font-semibold text-navy text-sm">Belum Ada Modul yang Diterbitkan</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Hanya modul berstatus <strong>Terbit</strong> yang dapat dikirim ke kelas. Silakan publikasikan modul terlebih dahulu di menu Modul Ajar.
                </p>
                <Button
                  asChild
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={() => setOpenTambahModul(false)}
                >
                  <Link to="/modul-ajar">
                    <Sparkles className="h-3.5 w-3.5" />
                    Buka Menu Modul Ajar
                  </Link>
                </Button>
              </div>
            ) : filteredPublishedModuls.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Tidak ada modul terbit yang cocok dengan pencarian "{searchModulQuery}".
              </div>
            ) : (
              filteredPublishedModuls.map((m) => {
                const alreadyIn = isModulInThisClass(m);
                const isSelected = selectedModulIds.includes(m.id);

                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      if (alreadyIn) return;
                      setSelectedModulIds((prev) =>
                        prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                      );
                    }}
                    className={cn(
                      "flex items-start gap-3 p-3.5 rounded-lg border transition-all text-left",
                      alreadyIn
                        ? "bg-muted/40 border-border/60 opacity-80 cursor-default"
                        : isSelected
                        ? "bg-primary/5 border-primary shadow-xs cursor-pointer ring-1 ring-primary"
                        : "bg-card border-border hover:border-primary/50 hover:bg-muted/20 cursor-pointer",
                    )}
                  >
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected || alreadyIn}
                        disabled={alreadyIn}
                        onCheckedChange={() => {
                          if (alreadyIn) return;
                          setSelectedModulIds((prev) =>
                            prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                          );
                        }}
                        aria-label={`Pilih ${m.judul}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-navy line-clamp-1">{m.judul}</p>
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] px-1.5 py-0 h-4">
                          Terbit
                        </Badge>
                        {alreadyIn && (
                          <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px] px-1.5 py-0 h-4">
                            <Check className="h-2.5 w-2.5 mr-0.5 inline" /> Sudah di Kelas Ini
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {[m.mapel, m.kelas].filter(Boolean).join(" · ") || "Umum"} · {m.sections?.length || 0} Bab · Terakhir update {formatTanggal(m.updatedAt)}
                      </p>
                      {m.ringkasan && (
                        <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
                          {m.ringkasan}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground w-full sm:w-auto text-left">
              {selectedModulIds.length > 0 ? (
                <span>
                  <strong>{selectedModulIds.length}</strong> modul dipilih untuk dikirim
                </span>
              ) : (
                <span>Pilih satu atau beberapa modul terbit</span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedModulIds([]);
                  setOpenTambahModul(false);
                }}
                disabled={kirimLoading}
              >
                Batal
              </Button>
              <Button
                size="sm"
                disabled={selectedModulIds.length === 0 || kirimLoading}
                onClick={handleKirimModulKeKelas}
                className="gap-1.5"
              >
                {kirimLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" />
                    Kirim ke Kelas ({selectedModulIds.length})
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Tambah Tugas ke Kelas */}
      <Dialog
        open={openTambahTugas}
        onOpenChange={(open) => {
          setOpenTambahTugas(open);
          if (!open) {
            setSelectedPaketIds([]);
            setSearchPaketQuery("");
            setDeadlineTugas("");
            setInstruksiTugas("");
            setKkmTugas(75);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-display font-semibold text-navy">
              Beri Penugasan ke Kelas {kelasDetail.namaKelas}
            </DialogTitle>
            <DialogDescription>
              Pilih paket soal dari Bank Soal untuk diterbitkan sebagai tugas bagi murid kelas{" "}
              {kelasDetail.tingkat} {kelasDetail.namaKelas}.
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari paket soal berdasarkan judul atau topik materi..."
                value={searchPaketQuery}
                onChange={(e) => setSearchPaketQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2.5 min-h-[200px] max-h-[42vh]">
            {availablePaketSoal.length === 0 ? (
              <div className="py-10 text-center">
                <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="font-semibold text-navy text-sm">Belum Ada Paket Soal di Bank Soal</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Buat paket soal terlebih dahulu di menu Bank Soal agar dapat diterbitkan sebagai tugas ke kelas ini.
                </p>
                <Button
                  asChild
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={() => setOpenTambahTugas(false)}
                >
                  <Link to="/soal">
                    <Sparkles className="h-3.5 w-3.5" />
                    Buka Menu Bank Soal
                  </Link>
                </Button>
              </div>
            ) : filteredPaketSoal.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Tidak ada paket soal yang cocok dengan pencarian "{searchPaketQuery}".
              </div>
            ) : (
              filteredPaketSoal.map((paket) => {
                const alreadyAssigned = isPaketAlreadyInThisClass(paket.id);
                const isSelected = selectedPaketIds.includes(paket.id);

                return (
                  <div
                    key={paket.id}
                    onClick={() => {
                      if (alreadyAssigned) return;
                      setSelectedPaketIds((prev) =>
                        prev.includes(paket.id)
                          ? prev.filter((id) => id !== paket.id)
                          : [...prev, paket.id],
                      );
                    }}
                    className={cn(
                      "flex items-start gap-3 p-3.5 rounded-lg border transition-all text-left",
                      alreadyAssigned
                        ? "bg-muted/40 border-border/60 opacity-80 cursor-default"
                        : isSelected
                        ? "bg-primary/5 border-primary shadow-xs cursor-pointer ring-1 ring-primary"
                        : "bg-card border-border hover:border-primary/50 hover:bg-muted/20 cursor-pointer",
                    )}
                  >
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected || alreadyAssigned}
                        disabled={alreadyAssigned}
                        onCheckedChange={() => {
                          if (alreadyAssigned) return;
                          setSelectedPaketIds((prev) =>
                            prev.includes(paket.id)
                              ? prev.filter((id) => id !== paket.id)
                              : [...prev, paket.id],
                          );
                        }}
                        aria-label={`Pilih ${paket.judul}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-navy line-clamp-1">{paket.judul}</p>
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4">
                          {paket.soal?.length || 0} Soal
                        </Badge>
                        {alreadyAssigned && (
                          <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px] px-1.5 py-0 h-4">
                            <Check className="h-2.5 w-2.5 mr-0.5 inline" /> Sudah Ditugaskan
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Topik: {paket.topik || "Umum"} {paket.kelas && paket.kelas.length > 0 ? `· Kelas asal: ${paket.kelas.join(", ")}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Opsi Pengaturan Penugasan */}
          {selectedPaketIds.length > 0 && (
            <div className="border-t bg-muted/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-navy flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" /> Pengaturan Penugasan ({selectedPaketIds.length} paket dipilih):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">Tenggat Waktu (Opsional):</label>
                  <Input
                    type="datetime-local"
                    value={deadlineTugas}
                    onChange={(e) => setDeadlineTugas(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">Nilai KKM Kelulusan:</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={kkmTugas}
                    onChange={(e) => setKkmTugas(Number(e.target.value) || 75)}
                    className="h-8 text-xs w-28"
                  />
                </div>
              </div>
              <div>
                <label className="text-muted-foreground block mb-1 text-xs">Instruksi Pengerjaan (Opsional):</label>
                <Input
                  placeholder="Contoh: Kerjakan secara mandiri dan teliti sebelum tenggat waktu..."
                  value={instruksiTugas}
                  onChange={(e) => setInstruksiTugas(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground w-full sm:w-auto text-left">
              {selectedPaketIds.length > 0 ? (
                <span>
                  <strong>{selectedPaketIds.length}</strong> paket soal dipilih untuk ditugaskan
                </span>
              ) : (
                <span>Pilih paket soal yang ingin ditugaskan</span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedPaketIds([]);
                  setOpenTambahTugas(false);
                }}
                disabled={kirimTugasLoading}
              >
                Batal
              </Button>
              <Button
                size="sm"
                disabled={selectedPaketIds.length === 0 || kirimTugasLoading}
                onClick={handleKirimTugasKeKelas}
                className="gap-1.5"
              >
                {kirimTugasLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Menerbitkan...
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" />
                    Kirim Tugas ke Kelas ({selectedPaketIds.length})
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// TAMPILAN KHUSUS SISWA: DETAIL KELAS, MODUL & PENUGASAN
// ============================================================================
function SiswaKelasDetailView({ kelasId }: { kelasId: string }) {
  const { profile, user } = useAuth();
  const currentUserId = user?.id || profile.id;
  const { penugasanList, loading: loadingPenugasan, reload: reloadPenugasan } = usePenugasanSiswa();

  const [kelasDetail, setKelasDetail] = useState<Kelas | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<"aktif" | "menunggu" | "ditolak" | "none">("aktif");
  const [loadingKelas, setLoadingKelas] = useState(true);

  const [moduls, setModuls] = useState<Modul[]>([]);
  const [loadingModuls, setLoadingModuls] = useState(true);
  const [activeModul, setActiveModul] = useState<Modul | null>(null);

  const [submissionsMap, setSubmissionsMap] = useState<Record<string, PenugasanPengumpulan>>({});

  // Unified loader: Ambil data kelas, modul terbit, dan pengumpulan tugas
  const loadData = useCallback(async () => {
    setLoadingKelas(true);
    setLoadingModuls(true);
    try {
      const [kelasData, myClasses, modulData, subsMap] = await Promise.all([
        getKelasById(kelasId),
        currentUserId ? getKelasBySiswa(currentUserId) : Promise.resolve([]),
        getPublishedModulsForSiswa(),
        getMySubmissionsMap(),
      ]);

      const found = myClasses.find((c) => c.kelasId === kelasId);
      if (found) {
        setMembershipStatus(found.status);
      } else {
        setMembershipStatus(kelasData ? "aktif" : "none");
      }

      // Reconstruct kelas dari myClasses jika getKelasById mengembalikan null (fallback proteksi RLS)
      const resolvedKelas: Kelas | null = kelasData || (found ? {
        id: found.kelasId,
        namaKelas: found.namaKelas,
        tingkat: found.tingkat,
        mapel: found.mapel,
        tahunAjaran: found.tahunAjaran,
        guruId: "",
        kodeKelas: "",
        createdAt: found.diajukan,
      } : null);

      setKelasDetail(resolvedKelas);
      setModuls(modulData);
      setSubmissionsMap(subsMap);
    } catch (err) {
      console.error("[SiswaKelasDetailView] Gagal inisialisasi:", err);
    } finally {
      setLoadingKelas(false);
      setLoadingModuls(false);
    }
  }, [kelasId, currentUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filter modul untuk kelas ini dengan normalisasi teks yang fleksibel
  const classModuls = useMemo(() => {
    if (!kelasDetail) return moduls;

    const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const normNama = norm(kelasDetail.namaKelas);
    const normTingkat = norm(kelasDetail.tingkat);
    const normFull = norm(`${kelasDetail.tingkat} ${kelasDetail.namaKelas}`);
    const normMapel = norm(kelasDetail.mapel);

    const matched = moduls.filter((m) => {
      // 1. Direct UUID match
      if (m.kelasId && m.kelasId === kelasId) return true;

      // 2. Class name matching
      const mKelas = norm(m.kelas);
      if (mKelas) {
        if (normNama && (mKelas.includes(normNama) || normNama.includes(mKelas))) return true;
        if (normFull && (mKelas.includes(normFull) || normFull.includes(mKelas))) return true;
        if (normTingkat && mKelas === normTingkat) return true;
      }

      // 3. Mapel matching
      const mMapel = norm(m.mapel);
      if (mMapel && normMapel) {
        if (mMapel.includes(normMapel) || normMapel.includes(mMapel)) return true;
      }

      return false;
    });

    // Jika ada yang cocok spesifik dengan kelas, utamakan yang cocok
    if (matched.length > 0) return matched;
    // Fallback: tampilkan semua modul yang berhak diakses siswa
    return moduls;
  }, [moduls, kelasDetail, kelasId]);

  // Filter tugas untuk kelas ini dengan normalisasi teks yang fleksibel
  const classAssignments = useMemo(() => {
    if (!kelasDetail) return penugasanList;

    const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const normNama = norm(kelasDetail.namaKelas);
    const normFull = norm(`${kelasDetail.tingkat} ${kelasDetail.namaKelas}`);

    const matched = penugasanList.filter((p) => {
      if (p.kelasId && p.kelasId === kelasId) return true;
      if (p.kelasNama) {
        const pKelas = norm(p.kelasNama);
        if (normNama && (pKelas.includes(normNama) || normNama.includes(pKelas))) return true;
        if (normFull && (pKelas.includes(normFull) || normFull.includes(pKelas))) return true;
      }
      return false;
    });

    if (matched.length > 0) return matched;
    return penugasanList;
  }, [penugasanList, kelasId, kelasDetail]);

  const gradedAssignments = useMemo(() => {
    return classAssignments.filter((a) => {
      const sub = submissionsMap[a.id];
      return sub && sub.status === "submitted" && (sub.nilaiAkhir !== null || sub.nilaiPg !== null);
    });
  }, [classAssignments, submissionsMap]);

  const averageScore = useMemo(() => {
    if (gradedAssignments.length === 0) return null;
    const sum = gradedAssignments.reduce((acc, a) => {
      const sub = submissionsMap[a.id];
      const val = sub?.nilaiAkhir ?? sub?.nilaiPg ?? 0;
      return acc + Number(val);
    }, 0);
    return Math.round((sum / gradedAssignments.length) * 10) / 10;
  }, [gradedAssignments, submissionsMap]);

  if (loadingKelas) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Memuat data kelas pembelajaran…</p>
      </div>
    );
  }

  if (!kelasDetail) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border p-6 bg-card">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <h2 className="text-lg font-semibold text-navy">Kelas Tidak Ditemukan</h2>
          <p className="text-sm text-muted-foreground">
            Kelas dengan ID ini tidak ditemukan atau belum disetujui oleh bapak/ibu guru.
          </p>
          <Button asChild variant="outline">
            <Link to="/kelas">Kembali ke Kelas Diikuti</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (membershipStatus === "menunggu") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-6">
          <Clock className="mx-auto h-8 w-8 text-amber-600" />
          <h2 className="text-lg font-semibold text-navy">Menunggu Persetujuan Guru</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Permintaan bergabung ke kelas <span className="font-semibold text-navy">{kelasDetail.tingkat} {kelasDetail.namaKelas}</span> sedang menunggu verifikasi oleh guru pengampu.
          </p>
          <Button asChild variant="outline">
            <Link to="/kelas">Kembali ke Kelas Diikuti</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Header Siswa */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-navy">
            <Link to="/kelas">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Kelas Diikuti
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadData();
              void reloadPenugasan();
            }}
            disabled={loadingKelas || loadingModuls}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (loadingKelas || loadingModuls) && "animate-spin")} />
            Segarkan Kelas
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[11px]">
                <CheckCircle2 className="h-3 w-3" /> Anggota Aktif
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                Tahun Ajaran {kelasDetail.tahunAjaran}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-navy mt-1">
              {kelasDetail.tingkat} {kelasDetail.namaKelas}
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Mata Pelajaran: <span className="text-foreground">{kelasDetail.mapel}</span>
            </p>
          </div>

          <Button asChild variant="outline" size="sm" className="gap-2 text-xs self-start sm:self-center">
            <Link to="/penilaian">
              <GraduationCap className="h-4 w-4 text-primary" />
              Rekap Seluruh Nilai
            </Link>
          </Button>
        </div>
      </div>

      {/* 3 Kartu Ringkasan Siswa */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="transition-shadow hover:shadow-xs">
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-navy">{classModuls.length}</p>
              <p className="text-sm font-medium">Modul Pembelajaran</p>
              <p className="text-xs text-muted-foreground">Siap dipelajari</p>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-xs">
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <FileQuestion className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-navy">{classAssignments.length}</p>
              <p className="text-sm font-medium">Tugas & Latihan</p>
              <p className="text-xs text-muted-foreground">{gradedAssignments.length} telah selesai</p>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-xs">
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Award className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-navy">
                {averageScore !== null ? averageScore : "—"}
              </p>
              <p className="text-sm font-medium">Rata-Rata Nilai</p>
              <p className="text-xs text-muted-foreground">Penilaian otomatis AI</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Konten: Modul Pembelajaran, Tugas Kelas, Rekap Nilai */}
      <Tabs defaultValue="modul" className="space-y-4">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="modul" className="gap-2 text-xs font-medium">
            <BookOpen className="h-3.5 w-3.5" />
            Modul Pembelajaran ({classModuls.length})
          </TabsTrigger>
          <TabsTrigger value="tugas" className="gap-2 text-xs font-medium">
            <FileQuestion className="h-3.5 w-3.5" />
            Tugas & Soal ({classAssignments.length})
          </TabsTrigger>
          <TabsTrigger value="nilai" className="gap-2 text-xs font-medium">
            <Award className="h-3.5 w-3.5" />
            Capaian Nilai
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MODUL PEMBELAJARAN */}
        <TabsContent value="modul" className="space-y-4">
          {loadingModuls ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-2">Memuat modul materi kelas…</p>
            </div>
          ) : classModuls.length === 0 ? (
            <Card className="py-10 text-center">
              <CardContent className="space-y-3">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <h3 className="font-display text-base font-semibold text-navy">
                  Belum Ada Modul Ajar
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Guru pengampu belum membagikan modul untuk kelas ini. Materi baru akan otomatis tampil di sini saat dirilis.
                </p>
                <div className="pt-2">
                  <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Link to="/modul-ajar">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      Jelajahi Semua Modul Sekolah
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classModuls.map((m) => (
                <Card key={m.id} className="flex flex-col justify-between transition-all hover:shadow-xs hover:border-primary/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-semibold text-primary">{m.mapel}</span>
                      <span>{m.sections?.length || 0} Bagian</span>
                    </div>
                    <CardTitle className="font-display text-base text-navy line-clamp-2 pt-1">
                      {m.judul}
                    </CardTitle>
                    {m.ringkasan && (
                      <CardDescription className="text-xs line-clamp-3 pt-1">
                        {m.ringkasan}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardFooter className="pt-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2 text-xs font-medium"
                      onClick={() => setActiveModul(m)}
                    >
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      Baca Modul
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: TUGAS & SOAL */}
        <TabsContent value="tugas" className="space-y-4">
          {loadingPenugasan ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-2">Memuat tugas kelas…</p>
            </div>
          ) : classAssignments.length === 0 ? (
            <Card className="py-10 text-center">
              <CardContent className="space-y-3">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600/40" />
                <h3 className="font-display text-base font-semibold text-navy">
                  Tidak Ada Tugas Aktif
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Semua latihan telah selesai dikerjakan atau guru belum memberikan penugasan baru untuk kelas ini.
                </p>
                <div className="pt-2">
                  <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Link to="/penugasan">
                      <FileQuestion className="h-3.5 w-3.5 text-primary" />
                      Lihat Seluruh Menu Penugasan
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {classAssignments.map((item) => {
                const sub = submissionsMap[item.id];
                const isSubmitted = sub && sub.status === "submitted";
                const score = sub?.nilaiAkhir ?? sub?.nilaiPg ?? null;
                const isTuntas = score !== null && score >= item.kkm;
                const needsRemedial = isSubmitted && score !== null && score < item.kkm && item.remedialEnabled;

                return (
                  <Card key={item.id} className="transition-all hover:border-primary/40">
                    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {isSubmitted ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Terkumpul &bull; Dinilai AI
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-[11px]">
                              <Clock className="h-3 w-3" /> Belum Dikerjakan
                            </Badge>
                          )}
                          {needsRemedial && (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300 gap-1 text-[11px]">
                              <Sparkles className="h-3 w-3" /> Tersedia Remedial
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            KKM: <strong className="text-foreground">{item.kkm}</strong>
                          </span>
                          {item.deadline && (
                            <span className="text-xs text-muted-foreground">
                              &bull; Batas: {new Date(item.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>

                        <h3 className="font-display text-base font-semibold text-navy truncate">
                          {item.judul}
                        </h3>

                        {item.instruksi && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.instruksi}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0">
                        {isSubmitted ? (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-mono text-lg font-bold text-navy">
                                {score !== null ? score : "—"}
                              </p>
                              <p className={`text-[11px] font-semibold ${isTuntas ? "text-emerald-700" : "text-amber-700"}`}>
                                {isTuntas ? "Tuntas" : "Perlu Remedial"}
                              </p>
                            </div>
                            <Button asChild size="sm" variant="outline" className="text-xs gap-1.5">
                              <Link to="/penugasan" search={{ penugasanId: item.id }}>
                                <Award className="h-3.5 w-3.5 text-emerald-600" />
                                Lihat Nilai
                              </Link>
                            </Button>
                            {needsRemedial && (
                              <Button asChild size="sm" className="text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white">
                                <Link to="/penugasan" search={{ penugasanId: item.id }}>
                                  <Sparkles className="h-3.5 w-3.5" />
                                  Remedial
                                </Link>
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button asChild size="sm" className="text-xs gap-1.5 font-medium shadow-xs">
                            <Link to="/penugasan" search={{ penugasanId: item.id }}>
                              Kerjakan Soal
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: CAPAIAN NILAI */}
        <TabsContent value="nilai" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">
                Rekapitulasi Nilai Kelas
              </CardTitle>
              <CardDescription className="text-xs">
                Nilai capaian dari seluruh tugas yang telah kamu kumpulkan pada kelas ini.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
              {classAssignments.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Belum ada penugasan di kelas ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tugas</TableHead>
                        <TableHead>KKM</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Nilai Akhir</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classAssignments.map((a) => {
                        const sub = submissionsMap[a.id];
                        const isSubmitted = sub && sub.status === "submitted";
                        const score = sub?.nilaiAkhir ?? sub?.nilaiPg ?? null;
                        const isTuntas = score !== null && score >= a.kkm;

                        return (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium text-navy">{a.judul}</TableCell>
                            <TableCell>{a.kkm}</TableCell>
                            <TableCell>
                              {isSubmitted ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[11px]">
                                  Terkumpul
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px]">
                                  Belum Selesai
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-navy">
                              {score !== null ? (
                                <span className={isTuntas ? "text-emerald-700" : "text-amber-700"}>
                                  {score} {isTuntas ? "✓" : ""}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary">
                                <Link to="/penugasan" search={{ penugasanId: a.id }}>
                                  <Eye className="h-3 w-3" />
                                  Detail
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reader Dialog untuk Modul Ajar yang dipilih */}
      {activeModul && (
        <Dialog open={Boolean(activeModul)} onOpenChange={(open) => !open && setActiveModul(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-primary">{activeModul.mapel}</span>
                <span>&bull;</span>
                <span>{activeModul.kelas}</span>
              </div>
              <DialogTitle className="font-display text-xl sm:text-2xl text-navy">
                {activeModul.judul}
              </DialogTitle>
              {activeModul.ringkasan && (
                <div className="rounded-lg bg-primary-soft/30 border border-primary/20 p-3 text-xs leading-relaxed text-foreground mt-2">
                  <p className="font-semibold text-primary mb-0.5">Ringkasan Materi:</p>
                  {activeModul.ringkasan}
                </div>
              )}
            </DialogHeader>

            <div className="space-y-5 py-4">
              {activeModul.sections.map((sec, idx) => (
                <div key={sec.id || idx} className="rounded-xl border p-4 sm:p-5 space-y-3 bg-card">
                  <h4 className="font-display text-base font-semibold text-navy">
                    {idx + 1}. {sec.judul}
                  </h4>
                  {sec.poin && sec.poin.length > 0 && (
                    <ul className="list-disc pl-5 text-xs sm:text-sm space-y-1 text-muted-foreground">
                      {sec.poin.map((p, pIdx) => (
                        <li key={pIdx}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {sec.isi && (
                    <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">
                      {sec.isi}
                    </div>
                  )}
                  {sec.ilustrasi && (
                    <div className="rounded-lg overflow-hidden border">
                      <img
                        src={sec.ilustrasi}
                        alt={sec.judul}
                        className="max-h-72 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveModul(null)}>
                Tutup Modul
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
