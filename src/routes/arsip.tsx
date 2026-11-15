import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileQuestion,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  School,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-store";
import {
  downloadTeacherBackupJson,
  fetchTeacherArchivedItems,
  generateTeacherFullBackup,
  getTeacherBackupSummary,
  restoreAcademicItem,
  validateTeacherBackupFile,
  type AcademicItemType,
  type ArchivedItem,
  type TeacherBackupSummary,
} from "@/lib/archive-store";

export const Route = createFileRoute("/arsip")({
  head: () => ({
    meta: [
      { title: "Pusat Arsip & Cadangan Data — GuruPro" },
      {
        name: "description",
        content:
          "Kelola dokumen materi ajar, bank soal, dan penugasan yang diarsipkan, serta buat cadangan lengkap (backup) seluruh data guru.",
      },
      { property: "og:title", content: "Pusat Arsip & Cadangan Data — GuruPro" },
      {
        property: "og:description",
        content:
          "Kelola dokumen materi ajar, bank soal, dan penugasan yang diarsipkan, serta buat cadangan lengkap (backup) seluruh data guru.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArsipPage,
});

type FilterType = "semua" | AcademicItemType;

function formatArchiveDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
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

function getItemTypeBadge(type: AcademicItemType) {
  switch (type) {
    case "modul":
      return (
        <Badge variant="outline" className="border-blue-500/30 bg-blue-50/50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          <BookOpen className="mr-1 h-3 w-3" />
          Materi Ajar
        </Badge>
      );
    case "paket_soal":
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-50/50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <FileQuestion className="mr-1 h-3 w-3" />
          Bank Soal
        </Badge>
      );
    case "penugasan":
      return (
        <Badge variant="outline" className="border-purple-500/30 bg-purple-50/50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
          <FileText className="mr-1 h-3 w-3" />
          Penugasan
        </Badge>
      );
    default:
      return <Badge variant="secondary">Dokumen</Badge>;
  }
}

function ArsipPage() {
  const { profile, ready } = useAuth();
  const [items, setItems] = useState<ArchivedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("semua");
  const [yearFilter, setYearFilter] = useState<string>("semua");

  // Backup state
  const [backupSummary, setBackupSummary] = useState<TeacherBackupSummary | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [auditResult, setAuditResult] = useState<{
    open: boolean;
    valid?: boolean;
    error?: string;
    summary?: TeacherBackupSummary;
    teacher?: { nama: string; email?: string };
    exportedAt?: string;
  }>({ open: false });

  // Restore dialog state
  const [targetRestore, setTargetRestore] = useState<ArchivedItem | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [data, summary] = await Promise.all([
        fetchTeacherArchivedItems(),
        profile?.id ? getTeacherBackupSummary(profile.id) : null,
      ]);
      setItems(data);
      if (summary) setBackupSummary(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memuat arsip.";
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (ready && profile.role === "guru") {
      void loadData();
    }
  }, [ready, profile.role, profile.id]);

  const handleDownloadBackup = async () => {
    if (!profile.id) return;
    setDownloadingBackup(true);
    try {
      toast.info("Menyiapkan seluruh data guru untuk cadangan…");
      const backup = await generateTeacherFullBackup(profile.id, {
        nama: profile.nama,
        email: profile.email,
        sekolah: profile.sekolah,
      });
      downloadTeacherBackupJson(backup);
      toast.success("Cadangan data guru berhasil diunduh ke komputer Anda!");

      const summary = await getTeacherBackupSummary(profile.id);
      setBackupSummary(summary);
    } catch (err: any) {
      toast.error(err?.message || "Gagal membuat berkas cadangan.");
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleVerifyBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const res = validateTeacherBackupFile(text);
      setAuditResult({
        open: true,
        valid: res.valid,
        error: res.error,
        summary: res.summary,
        teacher: res.teacher,
        exportedAt: res.exportedAt,
      });
      if (res.valid) {
        toast.success("Berkas cadangan valid dan siap digunakan sebagai arsip mandiri!");
      } else {
        toast.error(res.error || "Berkas cadangan tidak valid.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Extract available academic years from archived data
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    let hasUnbound = false;
    items.forEach((item) => {
      if (item.tahunAjaran && item.tahunAjaran !== "Tidak Terikat" && item.tahunAjaran !== "Semua") {
        years.add(item.tahunAjaran);
      } else if (item.tahunAjaran === "Tidak Terikat") {
        hasUnbound = true;
      }
    });
    const sorted = Array.from(years).sort().reverse();
    if (hasUnbound) {
      sorted.push("Tidak Terikat");
    }
    return sorted;
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Type Filter
      if (typeFilter !== "semua" && item.itemType !== typeFilter) {
        return false;
      }
      // Year Filter
      if (yearFilter !== "semua" && item.tahunAjaran !== yearFilter) {
        return false;
      }
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inJudul = item.judul.toLowerCase().includes(q);
        const inDeskripsi = item.deskripsi.toLowerCase().includes(q);
        const inKelas = item.kelasNama.toLowerCase().includes(q);
        const inMapel = item.mapel.toLowerCase().includes(q);
        if (!inJudul && !inDeskripsi && !inKelas && !inMapel) {
          return false;
        }
      }
      return true;
    });
  }, [items, typeFilter, yearFilter, searchQuery]);

  const handleConfirmRestore = async () => {
    if (!targetRestore) return;
    setRestoring(true);
    try {
      const res = await restoreAcademicItem(targetRestore.itemType, targetRestore.id);
      if (!res.success) {
        toast.error(res.message);
        return;
      }

      toast.success(`"${targetRestore.judul}" berhasil dipulihkan ke daftar aktif!`);
      setItems((prev) => prev.filter((i) => i.id !== targetRestore.id));
      setTargetRestore(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulihkan data.");
    } finally {
      setRestoring(false);
    }
  };

  // Role Guard
  if (ready && profile.role !== "guru") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Akses Khusus Guru</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Halaman Arsip Administrasi Pembelajaran hanya dapat diakses oleh akun Guru terdaftar.
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

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Pusat Arsip & Cadangan Data Guru"
        subtitle="Dokumen materi ajar, bank soal, dan penugasan yang diarsipkan tersimpan aman, serta tersedia fitur cadangan penuh (backup snapshot) sebagai perlindungan data guru."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
        }
      />

      {/* ========================================================================= */}
      {/* KARTU CADANGAN DATA GURU LENGKAP (FULL BACKUP ENGINE)                    */}
      {/* ========================================================================= */}
      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary-soft/10 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Database className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="font-display text-base text-navy flex items-center gap-2">
                  Cadangan Lengkap Data Guru
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50/60 text-emerald-700 text-[11px] font-semibold gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Backup Snapshot
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Simpan seluruh data mengajar (kelas, materi ajar, paket soal, tugas, dan rekap penilaian) ke berkas JSON mandiri.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
              <Button
                size="sm"
                onClick={handleDownloadBackup}
                disabled={downloadingBackup}
                className="gap-1.5 shadow-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {downloadingBackup ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyusun Cadangan…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Unduh Cadangan Lengkap (JSON)
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs"
                title="Periksa integritas dan isi file cadangan JSON"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Cek File Cadangan
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleVerifyBackupFile}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 border-t pt-3">
            <div className="rounded-lg bg-card/60 border p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                <School className="h-3 w-3 text-primary" /> Kelas Diampu
              </p>
              <p className="text-lg font-bold text-navy mt-0.5">
                {backupSummary ? backupSummary.totalKelas : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-card/60 border p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                <BookOpen className="h-3 w-3 text-primary" /> Materi Ajar
              </p>
              <p className="text-lg font-bold text-navy mt-0.5">
                {backupSummary ? backupSummary.totalMateriAjar : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-card/60 border p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                <FileQuestion className="h-3 w-3 text-amber-600" /> Bank Soal
              </p>
              <p className="text-lg font-bold text-navy mt-0.5">
                {backupSummary ? backupSummary.totalPaketSoal : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-card/60 border p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                <FileText className="h-3 w-3 text-purple-600" /> Penugasan
              </p>
              <p className="text-lg font-bold text-navy mt-0.5">
                {backupSummary ? backupSummary.totalPenugasan : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-card/60 border p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Jawaban Siswa
              </p>
              <p className="text-lg font-bold text-navy mt-0.5">
                {backupSummary ? backupSummary.totalJawabanSiswa : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-card/60 border p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                <Archive className="h-3 w-3 text-blue-600" /> Dokumen Arsip
              </p>
              <p className="text-lg font-bold text-navy mt-0.5">
                {backupSummary ? backupSummary.totalArsip : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as FilterType)}
          className="w-full lg:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="semua">Semua ({items.length})</TabsTrigger>
            <TabsTrigger value="modul">
              Materi Ajar ({items.filter((i) => i.itemType === "modul").length})
            </TabsTrigger>
            <TabsTrigger value="paket_soal">
              Soal ({items.filter((i) => i.itemType === "paket_soal").length})
            </TabsTrigger>
            <TabsTrigger value="penugasan">
              Tugas ({items.filter((i) => i.itemType === "penugasan").length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Tahun Ajaran */}
          {availableYears.length > 0 && (
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[160px] bg-card text-xs">
                <SelectValue placeholder="Tahun Ajaran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Tahun</SelectItem>
                {availableYears.map((yr) => (
                  <SelectItem key={yr} value={yr}>
                    {yr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Search Box */}
          <div className="relative w-full sm:w-[220px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, kelas, mapel…"
              className="pl-8 text-xs h-9"
              aria-label="Cari arsip"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <Card className="py-16 text-center">
          <CardContent className="flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground font-medium">
              Memuat data arsip administrasi pembelajaran…
            </p>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-dashed py-16 text-center">
          <CardContent className="space-y-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Archive className="h-7 w-7" />
            </div>
            <h3 className="font-display text-lg font-bold text-navy">
              Belum Ada Data yang Diarsipkan
            </h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Ketika Anda mengarsipkan materi ajar, paket soal, atau penugasan dari menu aktif, dokumen
              tersebut akan tersimpan rapi di sini dan tidak memadati daftar utama Anda.
            </p>
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">Tidak Ada Arsip yang Sesuai</p>
            <p className="text-xs text-muted-foreground">
              Coba sesuaikan filter jenis atau kata kunci pencarian Anda.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTypeFilter("semua");
                setYearFilter("semua");
                setSearchQuery("");
              }}
            >
              Reset Filter
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base text-navy">
                Daftar Dokumen Diarsipkan ({filteredItems.length})
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                Status: Diarsipkan
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Jenis</TableHead>
                    <TableHead>Judul Dokumen</TableHead>
                    <TableHead>Kelas & Mapel</TableHead>
                    <TableHead>Tahun Ajaran</TableHead>
                    <TableHead>Waktu Arsip</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={`${item.itemType}-${item.id}`}>
                      <TableCell>{getItemTypeBadge(item.itemType)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <p className="font-medium text-foreground truncate">{item.judul}</p>
                        {item.deskripsi && (
                          <p className="text-xs text-muted-foreground truncate">{item.deskripsi}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{item.kelasNama}</span>
                        {item.mapel && item.mapel !== "—" ? ` · ${item.mapel}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs font-normal">
                          {item.tahunAjaran}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatArchiveDate(item.archivedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTargetRestore(item)}
                          className="gap-1.5 text-xs hover:border-primary hover:text-primary"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Pulihkan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards View */}
            <div className="grid gap-3 p-4 md:hidden">
              {filteredItems.map((item) => (
                <div
                  key={`${item.itemType}-${item.id}`}
                  className="rounded-xl border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm">{item.judul}</p>
                      {item.deskripsi && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{item.deskripsi}</p>
                      )}
                    </div>
                    {getItemTypeBadge(item.itemType)}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <School className="h-3 w-3 text-primary" />
                      {item.kelasNama} {item.mapel && item.mapel !== "—" ? `· ${item.mapel}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {item.tahunAjaran}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t pt-2.5">
                    <span className="text-[11px] text-muted-foreground">
                      Diarsipkan {formatArchiveDate(item.archivedAt)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTargetRestore(item)}
                      className="gap-1 text-xs h-8"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Pulihkan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal to Restore Archived Item */}
      <AlertDialog
        open={targetRestore !== null}
        onOpenChange={(open) => !open && !restoring && setTargetRestore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-navy">
              Pulihkan {targetRestore?.itemType === "modul" ? "Materi Ajar" : targetRestore?.itemType === "paket_soal" ? "Paket Soal" : "Penugasan"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-medium text-foreground">
                &ldquo;{targetRestore?.judul}&rdquo;
              </span>
              <span className="block text-xs leading-relaxed">
                Dokumen ini akan dikembalikan ke daftar aktif Anda. Seluruh identitas (ID), relasi kelas,
                soal, submisi siswa, dan riwayat nilai tetap utuh tanpa perubahan.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRestore();
              }}
              disabled={restoring}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {restoring ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Memulihkan…
                </>
              ) : (
                "Ya, Pulihkan Sekarang"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Dialog Hasil Audit File Cadangan */}
      <AlertDialog
        open={auditResult.open}
        onOpenChange={(open) => !open && setAuditResult({ open: false })}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-base text-navy">
              {auditResult.valid ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Berkas Cadangan Valid
                </>
              ) : (
                <>
                  <Archive className="h-5 w-5 text-destructive" />
                  Pemeriksaan Berkas Cadangan
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2 text-left text-xs">
              {auditResult.valid ? (
                <div className="space-y-2">
                  <p className="text-foreground text-xs leading-relaxed">
                    Berkas cadangan terverifikasi asli dari sistem <strong>GuruPro AI</strong>.
                  </p>
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pemilik Data:</span>
                      <span className="font-semibold text-foreground">{auditResult.teacher?.nama || "Guru"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Waktu Ekspor:</span>
                      <span className="text-foreground">{auditResult.exportedAt ? formatArchiveDate(auditResult.exportedAt) : "—"}</span>
                    </div>
                    <div className="border-t pt-1.5 grid grid-cols-2 gap-1 text-[10.5px]">
                      <div>Kelas: {auditResult.summary?.totalKelas ?? 0}</div>
                      <div>Materi: {auditResult.summary?.totalMateriAjar ?? 0}</div>
                      <div>Bank Soal: {auditResult.summary?.totalPaketSoal ?? 0}</div>
                      <div>Tugas: {auditResult.summary?.totalPenugasan ?? 0}</div>
                      <div>Jawaban: {auditResult.summary?.totalJawabanSiswa ?? 0}</div>
                      <div>Arsip: {auditResult.summary?.totalArsip ?? 0}</div>
                    </div>
                  </div>
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium text-[11px]">
                    ✓ Seluruh relasi data, format JSON, dan struktur entitas dalam kondisi aman.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  {auditResult.error || "Berkas tidak dapat dikenali sebagai cadangan GuruPro."}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAuditResult({ open: false })}>
              Tutup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
