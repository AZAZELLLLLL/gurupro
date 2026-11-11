import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileQuestion,
  FileText,
  Layers,
  Lightbulb,
  Menu,
  MessageSquare,
  Palette,
  Paperclip,
  Plus,
  Presentation,
  RotateCcw,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { chatWithGuruAiServerFn, generateChatImageServerFn } from "@/lib/asisten-guru.functions";
import { Button } from "@/components/ui/button";
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer";
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
import { addModul, reloadModuls } from "@/lib/modul-store";
import { addPaket } from "@/lib/soal-store";
import { uid } from "@/lib/cloud-store";
import type { ModulSection, Slide } from "@/lib/modul-types";
import type { Soal } from "@/lib/soal-types";

export const Route = createFileRoute("/asisten-guru")({
  component: AsistenGuruPage,
});

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  imageUrl?: string;
  imagePrompt?: string;
  imageProvider?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface OutlineSettings {
  pptStyle: string;
  pptStyleName: string;
  slideCount?: number;
  aspectRatio: string;
  illustrationStyle: string;
  illustrationStyleName: string;
  illustrationAspect: string;
  jenjang?: string;
  modelPembelajaran?: string;
}

export interface ParsedSlideItem {
  id: string;
  num: number;
  title: string;
  subtitle?: string;
  paragraphs?: string[];
  description?: string;
  bullets: string[];
  highlight?: string;
  codeSnippet?: string;
  layoutType?: "narrative" | "hybrid" | "bullets" | "code" | "cover";
  isCover: boolean;
}

export interface ParsedSlideDeck {
  title: string;
  subtitle?: string;
  slideCount: number;
  slides: ParsedSlideItem[];
}

const STORAGE_KEY = "gurupro_asisten_guru_sessions_v1";
const OUTLINE_SETTINGS_KEY = "gurupro_asisten_guru_outline_settings_v1";

export const PPT_STYLES = [
  {
    id: "style_ppt_edu_classroom",
    name: "Educational Classroom",
    badge: "Rekomendasi Kelas",
    desc: "Desain ramah kelas dengan kartu konsep bertahap, mudah dibaca dari jarak jauh melalui proyektor.",
    icon: "🏫",
  },
  {
    id: "style_ppt_modern_minimal",
    name: "Modern Minimal",
    badge: "Elegan",
    desc: "Slide elegan berfokus pada kekuatan tipografi bersih, spasi lapang, dan 1 ide pokok per slide.",
    icon: "✨",
  },
  {
    id: "style_ppt_visual_learning",
    name: "Visual Learning",
    badge: "Visual Dominan",
    desc: "Visual diagram besar di satu sisi dengan ringkasan poin inti yang sangat padat di sisi lainnya.",
    icon: "👁️",
  },
  {
    id: "style_ppt_technical",
    name: "Technical / Coding",
    badge: "Sains & IT",
    desc: "Kotak blok kode rapi, alur flowchart terstruktur, dan pemecahan masalah algoritma bertahap.",
    icon: "💻",
  },
  {
    id: "style_ppt_corp_pro",
    name: "Corporate Pro",
    badge: "Kejuruan",
    desc: "Gaya formal profesional terstruktur untuk materi manajemen, bisnis, dan kejuruan industri.",
    icon: "🏢",
  },
  {
    id: "style_ppt_academic",
    name: "Academic Formal",
    badge: "Ilmiah",
    desc: "Struktur bab formal, tinjauan pustaka sistematis, dan rujukan berbasis kompetensi keilmuan.",
    icon: "🎓",
  },
];

export const ILL_STYLES = [
  {
    id: "style_ill_flat_edu",
    name: "Flat Educational",
    badge: "Populer",
    desc: "Vektor 2D datar bersih dan ramah siswa, saturasi warna seimbang dan mudah dipahami.",
    icon: "🎨",
  },
  {
    id: "style_ill_3d_edu",
    name: "3D Educational",
    badge: "Modern",
    desc: "Render 3D rounded lembut dengan pencahayaan halus bernuansa animasi edukatif.",
    icon: "🧊",
  },
  {
    id: "style_ill_modern_vector",
    name: "Modern Vector",
    badge: "Presisi",
    desc: "Garis geometris presisi, bernuansa teknologi, sains, dan tata letak infografis.",
    icon: "📐",
  },
  {
    id: "style_ill_hand_drawn",
    name: "Hand Drawn",
    badge: "Artistik",
    desc: "Sketsa artistik pensil/cat air lembut untuk materi sastra, sejarah, dan seni budaya.",
    icon: "✏️",
  },
  {
    id: "style_ill_infographic",
    name: "Infografis Bertingkat",
    badge: "Alur Proses",
    desc: "Diagram visual bertingkat dengan penanda nomor langkah dan ikon representatif.",
    icon: "📊",
  },
];

export const JENJANG_OPTIONS = [
  "SMK Kelas X (Fase E)",
  "SMK Kelas XI-XII (Fase F)",
  "SMA Kelas X (Fase E)",
  "SMA Kelas XI-XII (Fase F)",
  "SMP Kelas VII-IX (Fase D)",
  "SD Kelas IV-VI (Fase B-C)",
];

export const MODEL_PEMBELAJARAN_OPTIONS = [
  "Problem-Based Learning (PBL)",
  "Project-Based Learning (PjBL)",
  "Discovery Learning",
  "Inquiry-Based Learning",
  "Direct Instruction (Demonstrasi)",
];

const DEFAULT_OUTLINE_SETTINGS: OutlineSettings = {
  pptStyle: "style_ppt_edu_classroom",
  pptStyleName: "Educational Classroom",
  slideCount: 5,
  aspectRatio: "16:9",
  illustrationStyle: "style_ill_flat_edu",
  illustrationStyleName: "Flat Educational",
  illustrationAspect: "16:9",
  jenjang: "SMK Kelas X (Fase E)",
  modelPembelajaran: "Problem-Based Learning (PBL)",
};

const DEFAULT_SESSION: ChatSession = {
  id: "ses_default",
  title: "Percakapan Baru",
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function AsistenGuruPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([DEFAULT_SESSION]);
  const [activeSessionId, setActiveSessionId] = useState<string>("ses_default");
  const [inputMessage, setInputMessage] = useState("");
  const [contextMateri, setContextMateri] = useState("");
  const [showContextModal, setShowContextModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Outline and Template Configuration State (PPT Theme & Illustration Style)
  const [outlineSettings, setOutlineSettings] = useState<OutlineSettings>(DEFAULT_OUTLINE_SETTINGS);
  const [tempOutlineSettings, setTempOutlineSettings] = useState<OutlineSettings>(DEFAULT_OUTLINE_SETTINGS);
  const [showOutlineModal, setShowOutlineModal] = useState(false);
  const [outlineModalTab, setOutlineModalTab] = useState<"ppt" | "illustration">("ppt");

  // Interactive Presentation Slide Viewer State
  const [slideViewerOpen, setSlideViewerOpen] = useState(false);
  const [activeSlideDeck, setActiveSlideDeck] = useState<ParsedSlideDeck | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [slideViewerRawContent, setSlideViewerRawContent] = useState("");
  const [slideViewerMsgId, setSlideViewerMsgId] = useState("");

  // Save actions progress state
  const [savingAction, setSavingAction] = useState<string | null>(null);

  // Direct Illustration Generation State (FLUX.1)
  const [showImageModal, setShowImageModal] = useState(false);
  const [imagePromptInput, setImagePromptInput] = useState("");
  const [imageAspectInput, setImageAspectInput] = useState<"16:9" | "1:1" | "4:3" | "9:16">("16:9");
  const [imageStyleInput, setImageStyleInput] = useState("vector");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [targetMessageForImage, setTargetMessageForImage] = useState<string | null>(null);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);

  // Responsive & Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"active" | "trash">("active");

  // Confirmation dialogs
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load outline settings and sessions on mount
  useEffect(() => {
    try {
      const savedOutline = localStorage.getItem(OUTLINE_SETTINGS_KEY);
      if (savedOutline) {
        const parsed = JSON.parse(savedOutline);
        setOutlineSettings(parsed);
        setTempOutlineSettings(parsed);
      }
    } catch (e) {
      console.error("Failed to load outline settings:", e);
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          const firstActive = parsed.find((s) => !s.isDeleted);
          if (firstActive) {
            setActiveSessionId(firstActive.id);
          } else {
            setActiveSessionId(parsed[0].id);
          }
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    }
  }, []);

  // Keyboard navigation listener for Slide Viewer Modal
  useEffect(() => {
    if (!slideViewerOpen || !activeSlideDeck) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setActiveSlideIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setActiveSlideIndex((prev) => Math.min((activeSlideDeck?.slides.length || 1) - 1, prev + 1));
      } else if (e.key === "Escape") {
        setSlideViewerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slideViewerOpen, activeSlideDeck]);

  // Save sessions to localStorage
  const persistSessions = (newSessions: ChatSession[]) => {
    setSessions(newSessions);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions));
    } catch (e) {
      console.error("Failed to persist sessions:", e);
    }
  };

  // Save outline settings to localStorage
  const persistOutlineSettings = (newSettings: OutlineSettings) => {
    setOutlineSettings(newSettings);
    try {
      localStorage.setItem(OUTLINE_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.error("Failed to persist outline settings:", e);
    }
  };

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: "ses_" + Date.now().toString(),
      title: "Percakapan Baru",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    persistSessions(updated);
    setActiveSessionId(newSession.id);
    setInputMessage("");
    setSidebarTab("active");
    setMobileDrawerOpen(false);
  };

  // Move session to trash (Soft Delete)
  const moveToTrash = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.map((s) =>
      s.id === id
        ? { ...s, isDeleted: true, deletedAt: new Date().toISOString() }
        : s
    );
    persistSessions(updated);

    if (activeSessionId === id) {
      const remainingActive = updated.filter((s) => !s.isDeleted);
      if (remainingActive.length > 0) {
        setActiveSessionId(remainingActive[0].id);
      } else {
        createNewSession();
      }
    }

    toast("Percakapan dipindahkan ke Sampah.", {
      action: {
        label: "Urungkan",
        onClick: () => restoreFromTrash(id),
      },
    });
  };

  // Restore session from trash
  const restoreFromTrash = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, isDeleted: false, deletedAt: undefined } : s
    );
    persistSessions(updated);
    setActiveSessionId(id);
    setSidebarTab("active");
    toast.success("Percakapan berhasil dipulihkan!");
  };

  // Permanently delete single session
  const permanentlyDelete = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id);
    if (updated.length === 0) {
      persistSessions([DEFAULT_SESSION]);
      setActiveSessionId(DEFAULT_SESSION.id);
    } else {
      persistSessions(updated);
      if (activeSessionId === id) {
        const firstActive = updated.find((s) => !s.isDeleted) || updated[0];
        setActiveSessionId(firstActive.id);
      }
    }
    setDeleteConfirmId(null);
    toast.success("Percakapan telah dihapus secara permanen.");
  };

  // Empty entire trash
  const emptyTrash = () => {
    const updated = sessions.filter((s) => !s.isDeleted);
    if (updated.length === 0) {
      persistSessions([DEFAULT_SESSION]);
      setActiveSessionId(DEFAULT_SESSION.id);
    } else {
      persistSessions(updated);
    }
    setEmptyTrashConfirm(false);
    toast.success("Semua obrolan di tempat sampah telah dihapus.");
  };

  // Filtered lists
  const activeSessions = useMemo(
    () => sessions.filter((s) => !s.isDeleted),
    [sessions]
  );

  const trashSessions = useMemo(
    () => sessions.filter((s) => s.isDeleted),
    [sessions]
  );

  const displayedSessions = useMemo(() => {
    const source = sidebarTab === "active" ? activeSessions : trashSessions;
    if (!searchQuery.trim()) return source;
    return source.filter((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sidebarTab, activeSessions, trashSessions, searchQuery]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || activeSessions[0] || DEFAULT_SESSION;
  const currentMessages = activeSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: "msg_user_" + Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const updatedTitle =
      currentMessages.length === 0
        ? text.slice(0, 32) + (text.length > 32 ? "..." : "")
        : (activeSession?.title || "Percakapan Baru");

    const updatedMessages = [...currentMessages, userMsg];

    const targetSessionId = activeSession?.id || DEFAULT_SESSION.id;
    const sessionExists = sessions.some((s) => s.id === targetSessionId);

    const updatedSessions = sessionExists
      ? sessions.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                title: updatedTitle,
                messages: updatedMessages,
                updatedAt: new Date().toISOString(),
              }
            : s
        )
      : [
          {
            ...activeSession,
            id: targetSessionId,
            title: updatedTitle,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          },
          ...sessions,
        ];

    persistSessions(updatedSessions);
    setInputMessage("");
    setIsLoading(true);

    try {
      const historyPayload = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await chatWithGuruAiServerFn({
        data: {
          messages: historyPayload,
          contextMateri: contextMateri.trim() ? contextMateri : undefined,
          outlineSettings: {
            pptStyle: outlineSettings.pptStyleName,
            slideCount: outlineSettings.slideCount,
            illustrationStyle: outlineSettings.illustrationStyleName,
            illustrationAspect: outlineSettings.illustrationAspect,
            jenjang: outlineSettings.jenjang,
            modelPembelajaran: outlineSettings.modelPembelajaran,
          },
        },
      });

      const assistantMsg: ChatMessage = {
        id: "msg_ai_" + Date.now(),
        role: "assistant",
        content: res.reply,
        createdAt: new Date().toISOString(),
        imageUrl: res.imageUrl,
        imagePrompt: res.imagePrompt,
        imageProvider: res.imageUrl ? "FLUX.1" : undefined,
      };

      const finalSessions = updatedSessions.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              title: updatedTitle,
              messages: [...updatedMessages, assistantMsg],
              updatedAt: new Date().toISOString(),
            }
          : s
      );

      persistSessions(finalSessions);
    } catch (err: any) {
      toast.error(err?.message || "Gagal mendapatkan balasan dari AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Teks berhasil disalin ke clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ==============================================================================
  // ONE-CLICK SAVE ACTIONS (Tahap 3: Save to Modul, PPT, & Soal)
  // ==============================================================================

  const handleSaveToModul = async (content: string, msgId: string) => {
    setSavingAction(msgId + "-modul");
    try {
      // 1. Ekstraksi Judul Bersih & Profesional (Hapus tanda petik dan awalan ganda)
      const titleMatch = content.match(/^#+\s*(.+)$/m);
      let cleanedTitle = titleMatch
        ? titleMatch[1]
            .replace(/MODUL AJAR KURIKULUM MERDEKA\s*\(TERRINCI\)?/i, "")
            .replace(/MODUL AJAR\s*[:\-–]?/i, "")
            .replace(/^[:\-–\s]+/, "")
            .replace(/["“”'‘’]/g, "")
            .trim()
        : "";
      if (!cleanedTitle || cleanedTitle.length < 3) {
        cleanedTitle = activeSession?.title?.replace(/["“”'‘’]/g, "").trim() || "Modul Ajar Pembelajaran";
      }

      // 2. Ekstraksi Mapel & Jenjang/Fase dari isi
      const mapelMatch = content.match(/(?:Mata Pelajaran|Mapel)\s*:\s*([^\n\r|]+)/i);
      const mapelVal = mapelMatch
        ? mapelMatch[1].replace(/["“”'‘’]/g, "").trim()
        : "Dasar-Dasar Kejuruan / Umum";

      const kelasMatch = content.match(/(?:Kelas(?:\/Fase)?|Jenjang\/Fase|Fase)\s*:\s*([^\n\r|]+)/i);
      const kelasVal = kelasMatch
        ? kelasMatch[1].replace(/["“”'‘’]/g, "").trim()
        : outlineSettings.jenjang.includes("SMK")
        ? "X (SMK)"
        : "X";

      // 3. Ringkasan Modul yang Elegan
      const cleanContentNoHeaders = content
        .replace(/^#+.*$/gm, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[>_~`]/g, "")
        .trim();
      const firstParagraph = cleanContentNoHeaders.split(/\n\s*\n/)[0] || "";
      const ringkasanVal =
        firstParagraph.slice(0, 250).trim() ||
        `Modul ajar ${cleanedTitle} terstruktur berbasis Kurikulum Merdeka dengan model ${outlineSettings.modelPembelajaran}.`;

      // 4. PARSING BAB-BAB SECARA FLEKSIBEL SESUAI DETAIL KONTEN AI
      // Pisahkan berdasarkan header: "## Bagian X", "## Bab X", "## X.", "### X." atau "**X. ...**"
      const rawBlocks = content.split(/\n(?=(?:##+\s+|(?:\*\*)?(?:Bagian|Bab|\b[IVXLCDM]+\b|\d+)\s*[\.:\-–]))/i);
      const parsedSections: ModulSection[] = [];

      for (const block of rawBlocks) {
        const trimmed = block.trim();
        if (!trimmed || trimmed.length < 25) continue;

        // Filter keluar prompt generator gambar AI (jangan jadikan bab modul)
        if (
          /PROMPT\s+GENERATOR\s+GAMBAR|DALL-E|MIDJOURNEY|BING\s+IMAGE|ai_image_prompt/i.test(trimmed) ||
          trimmed.startsWith("```ai_image_prompt")
        ) {
          continue;
        }

        // Ekstraksi header/judul bab
        const headerMatch = trimmed.match(
          /^(?:##+\s+|\*\*\s*)?((?:Bagian\s*\d+|Bab\s*\d+|\b[IVXLCDM]+\b|\d+[\.:])?[^\n*#]+)(?:\*\*)?$/m
        );
        const rawJudul = headerMatch ? headerMatch[1].trim() : "";

        // Bersihkan judul dari emoji, tanda petik, dan nomor bab ganda
        const cleanJudul = rawJudul
          .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "") // Buang emoji
          .replace(/^(?:Bagian|Bab|\d+[\.:]|\b[IVXLCDM]+\b[\.:])\s*(\d+)?[\.:\-–\s]*/i, "")
          .replace(/["“”'‘’]/g, "")
          .replace(/^[:\-–\s]+/, "")
          .trim();

        // Ambil isi teks bab
        const isiSec = trimmed.replace(/^(?:##+\s*|\*\*\s*)[^\n]+(?:\*\*)?$/m, "").trim();

        // Bersihkan isi dari tanda kutip liar atau instruksi prompt gambar
        const cleanIsi = isiSec
          .replace(/```ai_image_prompt[\s\S]*?```/gi, "")
          .replace(/^>\s*\*"?[A-Za-z\s,.\-0-9:]+"?\*$/gm, "")
          .replace(/^>\s*\*\*Prompt AI:\*\*.*$/gim, "")
          .replace(/["“”]{2,}/g, '"')
          .trim();

        if (cleanIsi.length > 20) {
          // Ekstraksi poin capaian secara bersih (maksimal 3-4 poin, tanpa memotong kata dan tanpa markdown)
          const bulletLines = Array.from(cleanIsi.matchAll(/^[-*•]\s+(.+)$/gm));
          const cleanPoin: string[] = [];
          for (const b of bulletLines) {
            const rawText = b[1]
              .replace(/\*\*([^*]+)\*\*/g, "$1")
              .replace(/["“”'‘’]/g, "")
              .replace(/^[:\-–\s]+/, "")
              .trim();
            if (rawText.length > 10 && rawText.length < 120 && !cleanPoin.includes(rawText)) {
              cleanPoin.push(rawText);
            }
            if (cleanPoin.length >= 4) break;
          }

          parsedSections.push({
            id: uid(),
            judul: cleanJudul || `Materi Pokok Bagian ${parsedSections.length + 1}`,
            poin: cleanPoin,
            isi: cleanIsi,
          });
        }
      }

      // Fallback jika tidak terdeteksi pembagian bab spesifik
      let finalSections = parsedSections;
      if (finalSections.length === 0) {
        finalSections = [
          {
            id: uid(),
            judul: "Informasi Umum & Materi Pokok",
            poin: ["Tujuan Pembelajaran Kurikulum Merdeka", "Konsep Pokok & Pembahasan Pembelajaran"],
            isi: cleanContentNoHeaders || content,
          },
        ];
      }

      // Sematkan ilustrasi gambar AI jika pesan chat memiliki gambar (imageUrl)
      const currentMsg = activeSession?.messages?.find((m) => m.id === msgId);
      if (currentMsg?.imageUrl && finalSections.length > 0) {
        const targetIndex = finalSections.length > 1 ? 1 : 0;
        finalSections[targetIndex].ilustrasi = currentMsg.imageUrl;
      }

      const saved = await addModul({
        judul: cleanedTitle,
        kelas: kelasVal,
        mapel: mapelVal,
        ringkasan: ringkasanVal,
        sections: finalSections,
        slides: [],
        status: "Draft",
        sumberTipe: "Teks",
        sumberInput: content.slice(0, 500),
      });

      await reloadModuls();

      toast.success(
        `Modul Ajar "${saved.judul}" (${finalSections.length} Bab) berhasil disimpan ke Penyimpanan Modul!`,
        {
          action: {
            label: "Buka Modul Ajar",
            onClick: () => navigate({ to: "/modul-ajar" }),
          },
        }
      );
    } catch (err: any) {
      console.error("[handleSaveToModul] Error:", err);
      toast.error(err?.message || "Gagal menyimpan modul ajar ke database.");
    } finally {
      setSavingAction(null);
    }
  };

  // Helper to remove markdown markers and sanitize slide texts
  const cleanSlideText = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#+\s*/g, "")
      .replace(/^[\s\t]*[•\-\*✓✔]\s*/g, "")
      .replace(/^(?:Sub-?TeKS|Sub-?Teks|Sub-?Judul|Tagline)\s*[:\-–]?\s*/i, "")
      .replace(/[""]/g, '"')
      .replace(/^[-–—]\s*/, "")
      .trim();
  };

  const isMetaPromptLine = (text: string): boolean => {
    const clean = text
      .replace(/^[\s\t]*[•\-\*✓✔]+\s*/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .trim()
      .toLowerCase();

    return (
      clean.startsWith("visual") ||
      clean.startsWith("elemen visual") ||
      clean.startsWith("catatan visual") ||
      clean.startsWith("gaya visual") ||
      clean.startsWith("arah visual") ||
      clean.startsWith("catatan presenter") ||
      clean.startsWith("header / tagline") ||
      clean.startsWith("tagline:") ||
      clean.startsWith("color palette") ||
      clean.startsWith("visual footnote") ||
      clean.startsWith("skema warna") ||
      clean.startsWith("layout:") ||
      clean.startsWith("prompt gambar") ||
      clean.startsWith("prompt visual") ||
      clean.startsWith("ai_image_prompt") ||
      clean.startsWith("judul slide") ||
      clean.startsWith("judul:") ||
      clean.startsWith("footer") ||
      clean.startsWith("isi poin") ||
      clean.startsWith("poin rangkuman") ||
      clean.startsWith("poin inti") ||
      clean.startsWith("gambaran materi") ||
      clean.startsWith("sasaran") ||
      clean.startsWith("```ai_image_prompt")
    );
  };

  const parseSlidesFromContent = (content: string, defaultTitle?: string): ParsedSlideDeck | null => {
    if (!content) return null;
    const text = content.replace(/\r\n/g, "\n");

    // Matches slide headings across all markdown styles:
    // 1. ### Slide 1: / ## Slide 1 / # Slide 1
    // 2. **Slide 1:** / **Slide 1** / **SLIDE 1: ...**
    // 3. * Slide 1: / - Slide 1: / • Slide 1:
    // 4. * **Slide 1:** / - **Slide 1:** / • **Slide 1:**
    // 5. Slide 1: / SLIDE 1: / Slide 1. / Slide 1 -
    const slideHeaderPattern = /(?:^|\n)(?:[\s\t]*[-*•]\s+)?(?:#{1,6}\s+)?(?:\*\*)?(?:Slide|SLIDE)\s*(\d+)[\s*:\-–.]*(?:\*\*)?[\s:\-–]*([^\n]*)/gi;

    const matches: Array<{
      startIndex: number;
      slideNum: number;
      rawTitle: string;
      bodyStart: number;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = slideHeaderPattern.exec(text)) !== null) {
      matches.push({
        startIndex: match.index,
        slideNum: parseInt(match[1], 10),
        rawTitle: match[2]?.trim() || "",
        bodyStart: match.index + match[0].length,
      });
    }

    // A valid presentation deck MUST contain at least 2 distinct slides!
    // This prevents a normal Modul Ajar (which might mention 'slide' once) from being mistakenly parsed as a 1-slide PPT.
    if (matches.length < 2) return null;

    const slides: ParsedSlideItem[] = [];
    let mainTitle = defaultTitle || "Materi Pembelajaran";
    let mainSubtitle = "";

    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const next = matches[i + 1];
      const bodyText = text.slice(cur.bodyStart, next ? next.startIndex : text.length).trim();

      // Clean title
      let cleanTitle = cleanSlideText(cur.rawTitle);
      cleanTitle = cleanTitle
        .replace(/^(?:Slide|SLIDE)\s*\d*[:\-–.]*\s*/i, "")
        .replace(/^[*\-–—:]+\s*/, "")
        .replace(/[*\-–—:]+$/, "")
        .trim();

      // If title is empty or generic, look for inner Judul Slide
      if (!cleanTitle || cleanTitle.toLowerCase() === "cover" || cleanTitle.toLowerCase().startsWith("slide")) {
        const innerJudul = bodyText.match(/(?:Judul Slide|Judul Utama|Materi Utama|Topik Slide|Judul)\s*[:\-–]?\s*([^\n]+)/i);
        if (innerJudul) {
          cleanTitle = cleanSlideText(innerJudul[1])
            .replace(/^(?:Slide|SLIDE)\s*\d*[:\-–.]*\s*/i, "")
            .trim();
        }
      }
      if (!cleanTitle) {
        cleanTitle = `Slide ${cur.slideNum}: Materi Pembelajaran`;
      }

      // Subtitle / tagline
      const subMatch = bodyText.match(/(?:Sub-?Judul|Tagline|Sasaran|Sub-TeKS|Sub-Teks)\s*[:\-–]?\s*([^\n]+)/i);
      const subtitle = subMatch ? cleanSlideText(subMatch[1]) : undefined;

      // Code block extraction
      let codeSnippet: string | undefined = undefined;
      const codeMatch = bodyText.match(/```(?:python|js|ts|html|css|java|cpp)?\n([\s\S]*?)```/i);
      if (codeMatch) {
        codeSnippet = codeMatch[1].trim();
      }

      // Highlight / Case study / Tips extraction
      let highlight: string | undefined = undefined;
      const highlightRegex = /(?:Studi Kasus(?: Kontekstual)?|Kasus Riil|Contoh Kasus|Contoh Penerapan|Tips Guru|Tips Penting|Penerapan Konkret)\s*[:\-–]?\s*([^\n]+(?:\n(?![•\-\*#]|(?:Poin|Sub-?Judul|Contoh|Tips))[^\n]+)*)/i;
      const highlightMatch = bodyText.match(highlightRegex);
      if (highlightMatch) {
        const rawH = highlightMatch[1].trim();
        if (!isMetaPromptLine(rawH)) {
          highlight = cleanSlideText(rawH);
        }
      }

      let textWithoutCode = bodyText.replace(/```[\s\S]*?```/g, "");
      if (highlightMatch) {
        textWithoutCode = textWithoutCode.replace(highlightMatch[0], "");
      }

      // Block-based parser for seamless paragraphs and bullets
      const rawBlocks = textWithoutCode.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      const narrativeParagraphs: string[] = [];
      const bullets: string[] = [];

      for (const block of rawBlocks) {
        if (isMetaPromptLine(block)) continue;
        if (/^(?:###|##|#)\s+/i.test(block)) continue;
        if (/^(?:Sub-?Judul|Tagline|Sasaran|Sub-TeKS|Sub-Teks)\s*[:\-–]/i.test(block)) continue;
        if (/^(?:Poin Kunci|Poin Inti|Rangkuman Poin|Karakteristik|Prinsip Operasional|Uraian Materi)\s*[:\-–]?$/i.test(block)) continue;

        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const hasBullet = lines.some((l) => /^[\s\t]*[•\-\*✓✔]\s+/.test(l));

        if (hasBullet) {
          for (const line of lines) {
            if (isMetaPromptLine(line)) continue;
            if (/^(?:Sub-?Judul|Tagline|Sasaran|Sub-TeKS|Sub-Teks)\s*[:\-–]/i.test(line)) continue;
            if (/^(?:Poin Kunci|Poin Inti|Rangkuman Poin|Karakteristik|Prinsip Operasional|Uraian Materi)\s*[:\-–]?$/i.test(line)) continue;

            const isBulletLine = /^[\s\t]*[•\-\*✓✔]\s+/.test(line);
            const cleaned = cleanSlideText(line);
            if (!cleaned || cleaned.length < 4) continue;
            if (subtitle && cleaned.toLowerCase() === subtitle.toLowerCase()) continue;

            if (isBulletLine) {
              if (/^(?:studi kasus|kasus riil|contoh penerapan|tips)\s*[:\-–]/i.test(cleaned)) {
                if (!highlight) {
                  highlight = cleaned.replace(/^(?:studi kasus|kasus riil|contoh penerapan|tips)\s*[:\-–]\s*/i, "").trim();
                }
              } else {
                bullets.push(cleaned);
              }
            } else if (cleaned.length > 25 && !cleaned.endsWith(":")) {
              narrativeParagraphs.push(cleaned);
            }
          }
        } else {
          // Entire block is a natural narrative paragraph! Join soft wraps into one smooth paragraph string.
          const cleanLines = lines.map((l) => cleanSlideText(l)).filter((l) => !isMetaPromptLine(l));
          const joinedPara = cleanLines.join(" ").replace(/\s+/g, " ").trim();
          if (
            joinedPara.length > 25 &&
            !joinedPara.endsWith(":") &&
            !(subtitle && joinedPara.toLowerCase() === subtitle.toLowerCase())
          ) {
            narrativeParagraphs.push(joinedPara);
          }
        }
      }

      const description = narrativeParagraphs.length > 0 ? narrativeParagraphs.join("\n\n") : undefined;

      const isCover = cur.slideNum === 1 || cleanTitle.toLowerCase().includes("cover");

      let layoutType: "narrative" | "hybrid" | "bullets" | "code" | "cover" = "bullets";
      if (isCover) {
        layoutType = "cover";
      } else if (codeSnippet) {
        layoutType = "code";
      } else if (narrativeParagraphs.length >= 1 && bullets.length === 0) {
        layoutType = "narrative";
      } else if (narrativeParagraphs.length >= 1 && bullets.length > 0) {
        layoutType = "hybrid";
      } else {
        layoutType = "bullets";
      }

      if (isCover) {
        if (cleanTitle && !cleanTitle.toLowerCase().includes("cover")) {
          mainTitle = cleanTitle;
        }
        if (subtitle) {
          mainSubtitle = subtitle;
        }
      }

      slides.push({
        id: `slide_${cur.slideNum}_${i}`,
        num: cur.slideNum || i + 1,
        title: cleanTitle,
        subtitle,
        paragraphs: narrativeParagraphs,
        description,
        bullets:
          bullets.length > 0
            ? bullets
            : narrativeParagraphs.length > 0
            ? []
            : [cleanSlideText(bodyText.slice(0, 150))].filter(Boolean),
        highlight,
        codeSnippet,
        layoutType,
        isCover,
      });
    }

    if (slides.length < 2) return null;

    return {
      title: mainTitle,
      subtitle: mainSubtitle,
      slideCount: slides.length,
      slides,
    };
  };

  const openSlideViewer = (deck: ParsedSlideDeck, rawContent: string, msgId: string, initialIndex = 0) => {
    setActiveSlideDeck(deck);
    setSlideViewerRawContent(rawContent);
    setSlideViewerMsgId(msgId);
    setActiveSlideIndex(initialIndex);
    setSlideViewerOpen(true);
  };

  const handleSaveToPPT = async (content: string, msgId: string) => {
    setSavingAction(msgId + "-ppt");
    try {
      const deck = parseSlidesFromContent(content, activeSession?.title);
      const parsedSlides: Slide[] = [];

      if (deck && deck.slides.length > 0) {
        deck.slides.forEach((s) => {
          parsedSlides.push({
            id: uid(),
            judul: s.title,
            bullets: s.bullets.slice(0, 6),
            ilustrasi: outlineSettings.illustrationStyleName,
          });
        });
      } else {
        const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 30);
        paragraphs.slice(0, 6).forEach((p, idx) => {
          parsedSlides.push({
            id: uid(),
            judul: `Slide ${idx + 1}: Konsep & Pembahasan Inti`,
            bullets: [cleanSlideText(p)],
            ilustrasi: outlineSettings.illustrationStyleName,
          });
        });
      }

      const pptTitle = `Presentasi PPT: ${deck?.title || activeSession?.title || "Materi Pembelajaran"}`;

      await addModul({
        judul: pptTitle,
        kelas: outlineSettings.jenjang.includes("SMK") ? "X (SMK)" : "X",
        mapel: "Dasar-Dasar Kejuruan / Umum",
        ringkasan: `Slide presentasi interaktif berisi ${parsedSlides.length} materi tayang komprehensif bertema ${outlineSettings.pptStyleName}.`,
        sections: [],
        slides: parsedSlides,
        status: "Draft",
        sumberTipe: "Teks",
        sumberInput: content.slice(0, 500),
      });

      await reloadModuls();

      toast.success(`Berhasil menyimpan ${parsedSlides.length} slide PPT ke Modul Ajar!`, {
        action: {
          label: "Buka di Modul Ajar",
          onClick: () => navigate({ to: "/modul-ajar" }),
        },
      });
    } catch (err: any) {
      console.error("[handleSaveToPPT] Error:", err);
      toast.error(err?.message || "Gagal menyimpan slide presentasi.");
    } finally {
      setSavingAction(null);
    }
  };

  const handleDownloadPPTFromChat = async (content: string, msgTitle?: string) => {
    try {
      toast.info("Menyiapkan dokumen presentasi PowerPoint (.pptx) super detail...");
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_16x9";

      const deck = parseSlidesFromContent(content, msgTitle || activeSession?.title);
      const sessionTitle = deck?.title || msgTitle || activeSession?.title || "Materi Pembelajaran";
      pptx.title = sessionTitle;

      const slidesToRender = deck && deck.slides.length > 0
        ? deck.slides
        : (() => {
            const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 30);
            return paragraphs.slice(0, 6).map((p, idx) => ({
              id: `slide_${idx + 1}`,
              num: idx + 1,
              title: `Bagian ${idx + 1}: ${sessionTitle}`,
              bullets: [cleanSlideText(p)],
              isCover: idx === 0,
            }));
          })();

      // Slide 1: Premium Professional Cover Slide
      const firstSlide = slidesToRender[0];
      const cover = pptx.addSlide();
      cover.background = { color: "0B132B" }; // Deep Midnight Navy

      // Accent color pill / badge
      cover.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: 1.0,
        w: 3.8,
        h: 0.35,
        fill: { color: "1C2541" },
        line: { color: "38BDF8", width: 1 },
      });
      cover.addText("KURIKULUM MERDEKA • GURUPRO AI", {
        x: 0.9,
        y: 1.0,
        w: 3.6,
        h: 0.35,
        fontSize: 10,
        bold: true,
        color: "38BDF8",
        fontFace: "Arial",
      });

      const rawCoverTitle = firstSlide?.title || sessionTitle;
      const coverTitle = rawCoverTitle.replace(/^Cover\s*[:\-–]?\s*/i, "").trim() || sessionTitle;

      cover.addText(coverTitle, {
        x: 0.8,
        y: 1.6,
        w: 8.4,
        h: 1.8,
        fontSize: 30,
        bold: true,
        color: "FFFFFF",
        fontFace: "Arial",
      });

      const coverSubtitle =
        firstSlide?.subtitle ||
        deck?.subtitle ||
        `Media Pembelajaran Interaktif & Pembahasan Komprehensif Jenjang ${outlineSettings.jenjang}`;

      cover.addText(coverSubtitle, {
        x: 0.8,
        y: 3.6,
        w: 8.4,
        h: 0.8,
        fontSize: 14,
        color: "94A3B8",
        fontFace: "Arial",
      });

      cover.addText(
        `Platform GuruPro AI • Tema Presentasi: ${outlineSettings.pptStyleName}`,
        {
          x: 0.8,
          y: 4.8,
          w: 8.4,
          h: 0.4,
          fontSize: 11,
          color: "64748B",
          fontFace: "Arial",
        },
      );

      // Render Content Slides (starting from index 1 if multiple, or index 0 if not cover)
      const contentSlides = slidesToRender.length > 1 ? slidesToRender.slice(1) : slidesToRender;

      contentSlides.forEach((s, idx) => {
        const slide = pptx.addSlide();
        slide.background = { color: "F8FAFC" };

        // Header Shape Container
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.6,
          y: 0.45,
          w: 8.8,
          h: 0.85,
          fill: { color: "0F172A" },
          line: { color: "1E293B", width: 1 },
        });

        // Slide Badge
        const badgeText = `SLIDE ${(s.num || idx + 2).toString().padStart(2, "0")}`;
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.8,
          y: 0.65,
          w: 1.0,
          h: 0.4,
          fill: { color: "2563EB" },
        });
        slide.addText(badgeText, {
          x: 0.8,
          y: 0.65,
          w: 1.0,
          h: 0.4,
          fontSize: 9,
          bold: true,
          color: "FFFFFF",
          align: "center",
          fontFace: "Arial",
        });

        // Clean Slide Title
        const cleanTitle = s.title.replace(/^Slide\s*\d*[:\-–]?\s*/i, "").trim();
        slide.addText(cleanTitle, {
          x: 2.0,
          y: 0.55,
          w: 7.2,
          h: 0.65,
          fontSize: 17,
          bold: true,
          color: "FFFFFF",
          fontFace: "Arial",
        });

        // Subtitle banner if available
        let currentY = 1.45;
        if (s.subtitle) {
          slide.addText(s.subtitle, {
            x: 0.8,
            y: currentY,
            w: 8.4,
            h: 0.35,
            fontSize: 11,
            italic: true,
            color: "475569",
            fontFace: "Arial",
          });
          currentY += 0.4;
        }

        // 1. Dynamic Slide Body Layout based on layoutType
        if (s.layoutType === "narrative" || (s.paragraphs && s.paragraphs.length > 0 && s.bullets.length === 0)) {
          // Pure in-depth narrative paragraphs
          const paras = s.paragraphs && s.paragraphs.length > 0 ? s.paragraphs : [s.description || ""];
          const textItems = paras.map((p, pIdx) => ({
            text: pIdx > 0 ? `\n\n${p}` : p,
            options: {
              fontSize: 12,
              color: "1E293B",
              fontFace: "Arial",
              lineSpacing: 19,
              bullet: false,
            },
          }));

          const maxH = s.highlight ? 2.9 : 3.5;
          slide.addText(textItems as any, {
            x: 0.8,
            y: currentY,
            w: 8.4,
            h: maxH,
            fontFace: "Arial",
            valign: "top",
          });
          currentY += maxH + 0.15;
        } else if (s.layoutType === "hybrid" || (s.description && s.bullets.length > 0)) {
          // Hybrid: Narrative intro + Key point bullets
          slide.addText(s.description || "", {
            x: 0.8,
            y: currentY,
            w: 8.4,
            h: 1.3,
            fontSize: 11,
            color: "1E293B",
            fontFace: "Arial",
            lineSpacing: 16,
            valign: "top",
          });
          currentY += 1.4;

          const textItems = s.bullets.map((b) => ({
            text: `${b}\n`,
            options: {
              fontSize: 10.5,
              color: "1E293B",
              bullet: true,
              breakLine: true,
            },
          }));

          const remainingHeight = Math.max(0.7, 5.0 - currentY - (s.highlight ? 0.85 : 0.2));
          slide.addText(textItems as any, {
            x: 0.8,
            y: currentY,
            w: 8.4,
            h: remainingHeight,
            fontFace: "Arial",
            lineSpacing: 16,
            valign: "top",
          });
          currentY += remainingHeight + 0.1;
        } else if (s.bullets.length > 0) {
          // Structured bullet list
          const textItems = s.bullets.map((b) => ({
            text: `${b}\n`,
            options: {
              fontSize: 11.5,
              color: "1E293B",
              bullet: true,
              breakLine: true,
            },
          }));

          const remainingHeight = Math.max(1.0, 5.0 - currentY - (s.highlight ? 0.85 : 0.2));
          slide.addText(textItems as any, {
            x: 0.8,
            y: currentY,
            w: 8.4,
            h: remainingHeight,
            fontFace: "Arial",
            lineSpacing: 18,
            valign: "top",
          });
          currentY += remainingHeight + 0.1;
        } else {
          // Fallback if neither was detected
          slide.addText(
            `Pembahasan mendalam dan terstruktur mengenai ${cleanTitle} untuk memfasilitasi ketercapaian tujuan pembelajaran peserta didik secara komprehensif.`,
            {
              x: 0.8,
              y: currentY,
              w: 8.4,
              h: 2.5,
              fontSize: 12,
              color: "1E293B",
              fontFace: "Arial",
              lineSpacing: 18,
              valign: "top",
            }
          );
        }

        // Highlight Callout (if available)
        if (s.highlight && currentY < 4.85) {
          const calloutY = Math.min(currentY, 4.3);
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8,
            y: calloutY,
            w: 8.4,
            h: 0.75,
            fill: { color: "FEF3C7" },
            line: { color: "F59E0B", width: 1 },
          });
          slide.addText(`💡 Studi Kasus / Penerapan: ${s.highlight}`, {
            x: 0.95,
            y: calloutY + 0.08,
            w: 8.1,
            h: 0.6,
            fontSize: 9.5,
            color: "92400E",
            bold: false,
            fontFace: "Arial",
            valign: "top",
          });
        }

        // Slide Footer
        slide.addText(`${coverTitle} • GuruPro AI Pembelajaran Interaktif`, {
          x: 0.8,
          y: 5.15,
          w: 8.4,
          h: 0.3,
          fontSize: 9,
          color: "94A3B8",
          fontFace: "Arial",
        });
      });

      const cleanFilename = (sessionTitle || "presentasi-pembelajaran")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 35);
      await pptx.writeFile({ fileName: `${cleanFilename}.pptx` });
      toast.success("Dokumen PowerPoint (.pptx) super detail berhasil diunduh!");
    } catch (err: any) {
      console.error("[handleDownloadPPTFromChat] Error:", err);
      toast.error(err?.message || "Gagal mengunduh berkas PowerPoint.");
    }
  };

  const handleSaveToSoal = async (content: string, msgId: string) => {
    setSavingAction(msgId + "-soal");
    try {
      const questionBlocks = content.split(/\n(?=\d+\.\s+)/);
      const parsedSoal: Soal[] = [];

      for (const qBlock of questionBlocks) {
        const qMatch = qBlock.match(/^(\d+)\.\s+([\s\S]+?)(?=\n[A-E]\.|\n[a-e]\.|$)/);
        if (qMatch) {
          const rawPertanyaan = qMatch[2].trim();
          const cleanPertanyaan = cleanSlideText(rawPertanyaan);
          const opsiMatches = Array.from(qBlock.matchAll(/^[A-E]\.\s*(.+)$/gmi));

          let cleanOpsi = opsiMatches.map((o) => cleanSlideText(o[1])).filter(Boolean);
          if (cleanOpsi.length === 0) {
            cleanOpsi = ["Opsi A", "Opsi B", "Opsi C", "Opsi D"];
          } else if (cleanOpsi.length < 4) {
            const defaults = [
              "Pernyataan alternatif A",
              "Pernyataan alternatif B",
              "Pernyataan alternatif C",
              "Pernyataan alternatif D",
            ];
            while (cleanOpsi.length < 4) {
              cleanOpsi.push(defaults[cleanOpsi.length]);
            }
          } else if (cleanOpsi.length > 4) {
            cleanOpsi = cleanOpsi.slice(0, 4);
          }

          // Ensure distinct options
          const seen = new Set<string>();
          const distinctOpsi = cleanOpsi.map((opt, idx) => {
            const lower = opt.toLowerCase();
            if (seen.has(lower)) {
              const unique = `${opt} (${String.fromCharCode(65 + idx)})`;
              seen.add(unique.toLowerCase());
              return unique;
            }
            seen.add(lower);
            return opt;
          });

          const kunciMatch = qBlock.match(/Kunci(?:\s+Jawaban)?\s*[:\-–]?\s*([A-E])/i);
          let validKunci = "A";
          if (kunciMatch) {
            const char = kunciMatch[1].toUpperCase();
            if (["A", "B", "C", "D"].includes(char)) {
              validKunci = char;
            } else if (char === "E") {
              validKunci = "D";
            }
          }

          const pembMatch = qBlock.match(/Pembahasan\s*[:\-–]?\s*([^\n]+(?:\n[^\n]+)*)/i);
          const pembahasan = pembMatch
            ? cleanSlideText(pembMatch[1])
            : "Pertanyaan asesmen pemahaman konsep materi.";

          parsedSoal.push({
            id: uid(),
            pertanyaan:
              cleanPertanyaan.length >= 5
                ? cleanPertanyaan
                : "Pertanyaan evaluasi pemahaman materi pembelajaran.",
            jenis: "Pilihan Ganda",
            opsi: distinctOpsi,
            kunci: validKunci,
            penjelasan: pembahasan,
            tingkat: "Sedang",
            evidenceIds: ["ev_chat_assistant"],
          });
        }
      }

      if (parsedSoal.length === 0) {
        parsedSoal.push({
          id: uid(),
          pertanyaan:
            "Berdasarkan materi yang telah dipelajari, manakah pernyataan berikut yang paling tepat sesuai konsep?",
          jenis: "Pilihan Ganda",
          opsi: [
            "Pernyataan logis pertama sesuai dengan konsep materi pembelajaran",
            "Pernyataan kedua memerlukan penyesuaian kondisi spesifik",
            "Pernyataan ketiga bertentangan dengan prinsip dasar materi",
            "Pernyataan keempat belum memenuhi kriteria evaluasi konsep",
          ],
          kunci: "A",
          penjelasan:
            "Pertanyaan asesmen dirancang untuk menguji pemahaman kritis peserta didik terhadap konsep.",
          tingkat: "Sedang",
          evidenceIds: ["ev_chat_assistant"],
        });
      }

      await addPaket({
        judul: `Paket Soal: ${activeSession?.title || "Latihan HOTS"}`,
        topik: activeSession?.title || "Materi Pembelajaran",
        status: "Draft",
        kelas: ["X"],
        soal: parsedSoal,
      });

      toast.success(`Berhasil menyimpan ${parsedSoal.length} soal ke Bank Soal!`, {
        action: {
          label: "Buka Bank Soal",
          onClick: () => navigate({ to: "/soal" }),
        },
      });
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan soal ke Bank Soal.");
    } finally {
      setSavingAction(null);
    }
  };

  // ==============================================================================
  // DIRECT IMAGE GENERATION (FLUX.1 SCHNELL / SERVERLESS)
  // ==============================================================================

  const handleGenerateImage = async (customPrompt?: string, targetMsgId?: string) => {
    const prompt = (customPrompt || imagePromptInput).trim();
    if (!prompt || isGeneratingImage) return;

    setIsGeneratingImage(true);
    toast.info("Sedang me-render gambar edukasi dengan FLUX.1 (gratis)...");

    try {
      const res = await generateChatImageServerFn({
        data: {
          prompt,
          aspectRatio: imageAspectInput,
          style: imageStyleInput,
        },
      });

      if (res && res.imageUrl) {
        if (targetMsgId) {
          // Attach image directly to target assistant message
          const updatedSessions = sessions.map((s) => {
            if (s.id === (activeSession?.id || DEFAULT_SESSION.id)) {
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === targetMsgId
                    ? {
                        ...m,
                        imageUrl: res.imageUrl,
                        imagePrompt: res.prompt,
                        imageProvider: res.provider,
                      }
                    : m
                ),
                updatedAt: new Date().toISOString(),
              };
            }
            return s;
          });
          persistSessions(updatedSessions);
        } else {
          // Append as a new assistant message in the conversation
          const newImgMessage: ChatMessage = {
            id: "msg_img_" + Date.now(),
            role: "assistant",
            content: `Berikut adalah visualisasi ilustrasi edukatif untuk materi: **${prompt}**\n\n- **Model:** ${res.model} (${res.provider})\n- **Rasio:** ${res.aspectRatio}\n- **Lisensi:** Bebas Digunakan untuk Pembelajaran Kurikulum Merdeka`,
            createdAt: new Date().toISOString(),
            imageUrl: res.imageUrl,
            imagePrompt: res.prompt,
            imageProvider: res.provider,
          };
          const updatedSessions = sessions.map((s) => {
            if (s.id === (activeSession?.id || DEFAULT_SESSION.id)) {
              return {
                ...s,
                messages: [...s.messages, newImgMessage],
                updatedAt: new Date().toISOString(),
              };
            }
            return s;
          });
          persistSessions(updatedSessions);
        }

        toast.success("Ilustrasi gambar berhasil digenerate!");
        setShowImageModal(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghasilkan gambar dengan FLUX.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownloadImage = (dataUrl: string, promptTitle?: string) => {
    try {
      const link = document.createElement("a");
      link.href = dataUrl;
      const cleanName = (promptTitle || "ilustrasi-gurupro").replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
      link.download = `${cleanName}-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Gambar berhasil diunduh!");
    } catch (e: any) {
      toast.error("Gagal mengunduh gambar.");
    }
  };

  const handleAttachImageToModul = async (imageUrl: string, promptTitle?: string) => {
    try {
      await addModul({
        judul: `Modul & Media: ${promptTitle || activeSession?.title || "Materi Pembelajaran"}`,
        kelas: outlineSettings.jenjang.includes("SMK") ? "X (SMK)" : "X",
        mapel: "Dasar-Dasar Kejuruan / Umum",
        ringkasan: `Dilengkapi dengan media visual ilustrasi edukatif terstandar Kurikulum Merdeka.`,
        sections: [
          {
            id: uid(),
            judul: "Visualisasi Konsep Inti",
            poin: ["Media ilustrasi pendukung pemahaman peserta didik."],
            isi: `Gambar ilustrasi edukasi: ${promptTitle || "Konsep Pembelajaran"}`,
            ilustrasi: imageUrl,
          },
        ],
        slides: [],
        status: "Draft",
        sumberTipe: "Teks",
        sumberInput: promptTitle || "Ilustrasi Media Pembelajaran",
      });
      toast.success("Gambar berhasil dipasang ke Modul Ajar!", {
        action: {
          label: "Buka Modul Ajar",
          onClick: () => navigate({ to: "/modul-ajar" }),
        },
      });
    } catch (err: any) {
      toast.error(err?.message || "Gagal memasang gambar ke modul.");
    }
  };

  // Reusable Sidebar Content
  const renderSidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Brand & Close Button */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2.5 font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">AI Asisten Guru</h2>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Google Gemini Flash (Cepat & Cerdas)
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSidebarOpen(false);
            setMobileDrawerOpen(false);
          }}
          className="h-8 w-8 rounded-lg"
          title="Tutup Menu"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <Button
          onClick={createNewSession}
          className="w-full justify-start gap-2 rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          <span>Percakapan Baru</span>
        </Button>
      </div>

      {/* Tab Switcher: Obrolan Aktif vs Sampah */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 text-xs">
          <button
            onClick={() => setSidebarTab("active")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-all ${
              sidebarTab === "active"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Aktif ({activeSessions.length})</span>
          </button>
          <button
            onClick={() => setSidebarTab("trash")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-all ${
              sidebarTab === "trash"
                ? "bg-card text-destructive shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Sampah ({trashSessions.length})</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={
              sidebarTab === "active" ? "Cari obrolan..." : "Cari di sampah..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/40 py-1.5 pl-8 pr-3 text-xs focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Trash Actions Bar */}
      {sidebarTab === "trash" && trashSessions.length > 0 && (
        <div className="px-3 pb-2 flex items-center justify-between text-[11px] text-muted-foreground border-b border-border mb-1">
          <span>{trashSessions.length} obrolan dihapus</span>
          <button
            onClick={() => setEmptyTrashConfirm(true)}
            className="text-destructive hover:underline font-medium inline-flex items-center gap-1"
          >
            <Trash className="h-3 w-3" />
            Kosongkan
          </button>
        </div>
      )}

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {displayedSessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {sidebarTab === "active"
              ? "Belum ada obrolan aktif."
              : "Tempat sampah kosong."}
          </div>
        ) : (
          displayedSessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => {
                  if (sidebarTab === "active") {
                    setActiveSessionId(s.id);
                    setMobileDrawerOpen(false);
                  }
                }}
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-colors cursor-pointer ${
                  isActive && sidebarTab === "active"
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{s.title || "Percakapan Baru"}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {sidebarTab === "active" ? (
                    <button
                      onClick={(e) => moveToTrash(s.id, e)}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Pindahkan ke Tempat Sampah"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => restoreFromTrash(s.id, e)}
                        className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10"
                        title="Pulihkan Percakapan"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(s.id);
                        }}
                        className="p-1 rounded-md text-destructive hover:bg-destructive/10"
                        title="Hapus Permanen"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Back to Dashboard Footer */}
      <div className="border-t border-border p-3 space-y-2">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Dashboard Guru</span>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full max-w-full overflow-hidden bg-background select-text overscroll-none touch-pan-y relative">
      {/* 1. DESKTOP SIDEBAR (Visible on lg screens when open) */}
      <aside
        className={`hidden lg:flex flex-col border-r border-border bg-card transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0 -translate-x-full overflow-hidden"
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* 2. MOBILE & TABLET DRAWER (Slide-over for screens < lg) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative z-50 w-72 sm:w-80 h-full bg-card shadow-2xl border-r border-border animate-in slide-in-from-left duration-200">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* 3. WORKSPACE CHAT UTAMA (LOCKED AGAINST HORIZONTAL WIGGLE) */}
      <main className="flex flex-1 flex-col overflow-hidden w-full max-w-full min-w-0 h-full relative">
        {/* HEADER ATAS RESPONSIF */}
        <header className="flex h-12 sm:h-14 items-center justify-between border-b border-border bg-card/80 px-2.5 sm:px-4 backdrop-blur-sm shrink-0 w-full max-w-full">
          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
            {/* Mobile / Tablet Toggle Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMobileDrawerOpen(true)}
              className="h-8 w-8 rounded-lg lg:hidden shrink-0"
              title="Buka Riwayat Percakapan"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Desktop Toggle Button when collapsed */}
            {!sidebarOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="hidden lg:flex gap-1.5 rounded-lg text-xs shrink-0"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Riwayat</span>
              </Button>
            )}

            <h1 className="text-xs sm:text-sm font-semibold truncate max-w-[150px] xs:max-w-xs sm:max-w-sm md:max-w-md">
              {activeSession?.title || "AI Asisten Guru"}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Template & Outline Quick Config Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempOutlineSettings({ ...outlineSettings });
                setShowOutlineModal(true);
              }}
              className="rounded-xl text-[11px] sm:text-xs gap-1 sm:gap-1.5 px-2.5 sm:px-3 h-8 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
              title="Atur Template PPT, Ilustrasi, & Outline"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Atur Template</span>
              <span className="xs:hidden">Outline</span>
            </Button>

            {/* Context Attachment Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowContextModal(true)}
              className={`rounded-xl text-[11px] sm:text-xs gap-1 sm:gap-1.5 px-2.5 sm:px-3 h-8 ${
                contextMateri.trim() ? "border-primary text-primary bg-primary/5 font-medium" : ""
              }`}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {contextMateri.trim() ? "Materi Terlampir" : "Lampirkan Bahan"}
              </span>
              <span className="sm:hidden">
                {contextMateri.trim() ? "Rujukan" : "Lampir"}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={createNewSession}
              className="h-8 w-8 rounded-lg"
              title="Percakapan Baru"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* CONTAINER PESAN SCROLLABLE (Pencegahan geser kanan-kiri) */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2.5 sm:p-4 md:p-6 space-y-3.5 sm:space-y-5 w-full max-w-full">
          {currentMessages.length === 0 ? (
            /* EMPTY HERO STATE */
            <div className="mx-auto my-auto max-w-2xl text-center py-6 sm:py-10 px-2">
              <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm mb-3 sm:mb-4">
                <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl">
                Halo, Bapak/Ibu Guru!
              </h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm max-w-md mx-auto">
                Ketik instruksi pembelajaran Anda secara bebas, atau pilih salah satu kartu rekomendasi aksi di bawah ini:
              </p>

              <div className="mt-6 sm:mt-8 grid grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2 text-left">
                {/* 1. Modul Ajar Card */}
                <button
                  onClick={() =>
                    handleSendMessage(
                      `Tolong susunkan Modul Ajar Kurikulum Merdeka yang sangat lengkap, mendalam, dan terperinci untuk jenjang ${outlineSettings.jenjang} dengan model ${outlineSettings.modelPembelajaran} mengenai materi Percabangan Logika IF-ELSE. Sajikan secara profesional dan terstruktur mencakup Bagian 1: Informasi Umum & Tujuan Pembelajaran, Bagian 2: Uraian Materi & Konsep Pokok, Bagian 3: Skenario Kegiatan Pembelajaran Rinci (Pendahuluan, Inti PBL per sintaks, Penutup), Bagian 4: Asesmen & Rubrik KKTP, Bagian 5: Lembar Kerja Peserta Didik (LKPD), serta Bagian 6: Pengayaan & Remedial.`
                    )
                  }
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 sm:p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <BookOpen className="h-3 w-3" />
                        Modul Ajar
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">
                      Buat Modul Ajar Lengkap
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      Format Kurikulum Merdeka lengkap dengan skenario kegiatan PBL & asesmen siap pakai.
                    </p>
                  </div>
                </button>

                {/* 2. PPT Card */}
                <button
                  onClick={() =>
                    handleSendMessage(
                      `Rancang presentasi PPT komprehensif & mendalam dengan tema ${outlineSettings.pptStyleName} untuk materi Struktur Data Array. Berikan judul tiap slide, pembahasan materi rinci, dan arahan visual interaktif.`
                    )
                  }
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 sm:p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Presentation className="h-3 w-3" />
                        Presentasi PPT ({outlineSettings.pptStyleName.split(" ")[0]})
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">
                      Rancang Slide Presentasi
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      Outline slide terstruktur mengikuti tema {outlineSettings.pptStyleName}.
                    </p>
                  </div>
                </button>

                {/* 3. Ilustrasi Card */}
                <button
                  onClick={() =>
                    handleSendMessage(
                      `Rancang konsep gambar ilustrasi edukatif dengan gaya visual ${outlineSettings.illustrationStyleName} (rasio ${outlineSettings.illustrationAspect}) mengenai Alur Pengambilan Keputusan Percabangan IF-ELSE.`
                    )
                  }
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 sm:p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Palette className="h-3 w-3" />
                        Ide Ilustrasi ({outlineSettings.illustrationStyleName})
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">
                      Rancang Konsep Diagram Alur
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      Deskripsi visual langkah-demi-langkah ramah siswa tanpa karakter diagram teks acak.
                    </p>
                  </div>
                </button>

                {/* 4. Soal Card */}
                <button
                  onClick={() =>
                    handleSendMessage(
                      `Buatkan 5 soal pilihan ganda berbasis HOTS (Higher Order Thinking Skills) untuk menguji pemahaman logika pemrograman dan algoritma untuk jenjang ${outlineSettings.jenjang}, lengkap dengan stimulus kasus, opsi A-E, kunci jawaban, dan pembahasan mendalam.`
                    )
                  }
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 sm:p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <FileQuestion className="h-3 w-3" />
                        Asesmen & Bank Soal
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">
                      Buat 5 Soal HOTS
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      Soal berpikir tingkat tinggi berbasis studi kasus kontekstual lengkap dengan pembahasan.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* MESSAGE LIST */
            <div className="mx-auto max-w-3xl w-full space-y-3.5 sm:space-y-5 px-0.5 sm:px-1">
              {currentMessages.map((m) => {
                const isUser = m.role === "user";
                const chatSlideDeck = !isUser && !isLoading ? parseSlidesFromContent(m.content, activeSession?.title) : null;
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2 sm:gap-3 w-full max-w-full ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isUser && (
                      <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs mt-1">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`break-words [overflow-wrap:anywhere] [word-break:break-word] ${
                        isUser
                          ? "max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-[13px] sm:text-sm font-sans whitespace-pre-wrap bg-primary text-primary-foreground shadow-xs ml-auto"
                          : "w-full max-w-full rounded-2xl px-3.5 sm:px-5 py-3 sm:py-4 border border-border bg-card text-foreground shadow-xs overflow-hidden"
                      }`}
                    >
                      {isUser ? (
                        m.content
                      ) : (
                        <ChatMarkdownRenderer content={m.content} />
                      )}

                      {/* RENDERED IMAGE ARTIFACT (IF PRESENT) */}
                      {!isUser && m.imageUrl && (
                        <div className="mt-3.5 overflow-hidden rounded-xl border border-border/80 bg-background/50 shadow-xs">
                          <div
                            className="relative group aspect-video sm:aspect-16/9 bg-muted/30 flex items-center justify-center overflow-hidden cursor-pointer"
                            onClick={() => setPreviewZoomImage(m.imageUrl || null)}
                          >
                            <img
                              src={m.imageUrl}
                              alt={m.imagePrompt || "Ilustrasi Pembelajaran"}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs font-semibold backdrop-blur-xs shadow-md">
                                <Eye className="h-3.5 w-3.5" />
                                Klik untuk Perbesar
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-card border-t border-border/60">
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary text-[10px]">
                                <Sparkles className="h-3 w-3" />
                                FLUX.1
                              </span>
                              <span className="truncate max-w-[200px] sm:max-w-xs">{m.imagePrompt}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleAttachImageToModul(m.imageUrl!, m.imagePrompt)}
                                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                                title="Pasang ke Bab Modul Ajar"
                              >
                                <BookOpen className="h-3 w-3" />
                                <span>Pasang ke Modul</span>
                              </button>
                              <button
                                onClick={() => handleDownloadImage(m.imageUrl!, m.imagePrompt)}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Unduh gambar JPG"
                              >
                                <Download className="h-3 w-3" />
                                <span>Unduh</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PRESENTATION SLIDE DECK CARD (BACKGROUND LAZYLOADING PREVIEW) */}
                      {!isUser && chatSlideDeck && chatSlideDeck.slideCount >= 2 && (
                        <div className="mt-3.5 overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 via-primary/5 to-card p-3 sm:p-4 shadow-sm transition-all hover:border-blue-500/50">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                            <div className="flex items-start gap-2.5">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
                                <Presentation className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                    Pratinjau Presentasi Siap
                                  </span>
                                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {chatSlideDeck.slideCount} Slide • 16:9 Widescreen
                                  </span>
                                </div>
                                <h4 className="text-xs sm:text-sm font-bold text-foreground mt-1 line-clamp-1">
                                  {chatSlideDeck.title}
                                </h4>
                                {chatSlideDeck.subtitle && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                                    {chatSlideDeck.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={() => openSlideViewer(chatSlideDeck, m.content, m.id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-all hover:scale-[1.02] shrink-0"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Buka & Tinjau PPT</span>
                            </button>
                          </div>

                          {/* Mini Slide Strip */}
                          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {chatSlideDeck.slides.map((s, idx) => (
                              <button
                                key={s.id || idx}
                                onClick={() => openSlideViewer(chatSlideDeck, m.content, m.id, idx)}
                                className="group relative shrink-0 w-32 sm:w-36 h-20 rounded-lg border border-border/80 bg-background/90 hover:border-blue-500/60 hover:bg-blue-500/5 p-2 text-left flex flex-col justify-between transition-all shadow-2xs hover:shadow-xs"
                                title={`Klik untuk buka Slide ${s.num}: ${s.title}`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                    #{s.num}
                                  </span>
                                  {s.isCover && (
                                    <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 rounded">
                                      COVER
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] font-semibold text-foreground line-clamp-2 leading-tight">
                                  {s.title}
                                </p>
                                <span className="text-[8.5px] text-muted-foreground line-clamp-1">
                                  {s.layoutType === "narrative"
                                    ? "Uraian Narasi"
                                    : s.layoutType === "hybrid"
                                    ? "Narasi & Poin"
                                    : s.layoutType === "code"
                                    ? "Kode & Analisis"
                                    : `${s.bullets.length} butir materi`}
                                </span>
                              </button>
                            ))}
                          </div>

                          <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-muted-foreground pt-2 border-t border-border/40">
                            <span>PPT dibuat di latar belakang. Klik slide di atas untuk meninjau secara mendalam.</span>
                            <button
                              onClick={() => openSlideViewer(chatSlideDeck, m.content, m.id)}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold shrink-0 ml-2 inline-flex items-center gap-1"
                            >
                              <span>Tinjau Lengkap</span>
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {!isUser && (
                        <div className="mt-3.5 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                          {/* AI Provider Info */}
                          <span className="text-[10px] font-medium flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-primary" />
                            GuruPro AI Assistant
                          </span>

                          {/* ACTION BUTTONS (Tahap 3: Simpan Otomatis & Generate Media) */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* 1. Save to Modul Ajar Button */}
                            <button
                              onClick={() => handleSaveToModul(m.content, m.id)}
                              disabled={savingAction === m.id + "-modul"}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10.5px] font-medium text-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                              title="Simpan rancangan ini ke Modul Ajar"
                            >
                              <BookOpen className="h-3 w-3 text-primary" />
                              <span>{savingAction === m.id + "-modul" ? "Menyimpan..." : "Simpan ke Modul"}</span>
                            </button>

                            {/* 2. Save to PPT Button */}
                            <button
                              onClick={() => handleSaveToPPT(m.content, m.id)}
                              disabled={savingAction === m.id + "-ppt"}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10.5px] font-medium text-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                              title="Simpan butir slide presentasi ke Modul Ajar"
                            >
                              <Presentation className="h-3 w-3 text-primary" />
                              <span>{savingAction === m.id + "-ppt" ? "Menyimpan..." : "Simpan ke PPT"}</span>
                            </button>

                            {/* 3. Save to Soal Button */}
                            <button
                              onClick={() => handleSaveToSoal(m.content, m.id)}
                              disabled={savingAction === m.id + "-soal"}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10.5px] font-medium text-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                              title="Simpan butir soal ke Bank Soal"
                            >
                              <FileQuestion className="h-3 w-3 text-primary" />
                              <span>{savingAction === m.id + "-soal" ? "Menyimpan..." : "Simpan ke Soal"}</span>
                            </button>

                            {/* 3b. Tinjau PPT Button */}
                            {chatSlideDeck && chatSlideDeck.slideCount >= 2 && (
                              <button
                                onClick={() => openSlideViewer(chatSlideDeck, m.content, m.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                                title="Buka pratinjau slide 16:9 dan pilih unduh atau sesuaikan"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Tinjau PPT ({chatSlideDeck.slideCount} Slide)</span>
                              </button>
                            )}

                            {/* 4. Generate FLUX.1 Image Button */}
                            <button
                              onClick={() => {
                                const headingMatch = m.content.match(/^#+\s*(.+)$/m);
                                const promptGuess = headingMatch ? headingMatch[1].replace(/[*_#]/g, "").trim() : (activeSession?.title || "Konsep Pembelajaran");
                                setImagePromptInput(promptGuess);
                                setTargetMessageForImage(m.id);
                                setShowImageModal(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10.5px] font-medium text-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-colors"
                              title="Render gambar ilustrasi edukatif dengan FLUX.1"
                            >
                              <Palette className="h-3 w-3 text-primary" />
                              <span>Buat Gambar (FLUX.1)</span>
                            </button>

                            {/* 5. Copy Text Button */}
                            <button
                              onClick={() => handleCopy(m.id, m.content)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              title="Salin jawaban lengkap"
                            >
                              {copiedId === m.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" />
                                  <span className="text-emerald-500 font-medium">Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Salin</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (() => {
                const lastUserMsg = [...currentMessages].reverse().find((msg) => msg.role === "user");
                const isPptRequest =
                  lastUserMsg &&
                  (/@generate_ppt/i.test(lastUserMsg.content) ||
                    /(?:rancang|buatkan|susun|bikin).*(?:slide|ppt|presentasi)/i.test(lastUserMsg.content) ||
                    /presentasi\s*ppt/i.test(lastUserMsg.content));
                const isIlustrasiRequest =
                  lastUserMsg &&
                  (/@generate_ilustrasi/i.test(lastUserMsg.content) ||
                    /buatkan (?:sebuah )?(?:gambar|ilustrasi)|generate (?:sebuah )?(?:gambar|ilustrasi)/i.test(lastUserMsg.content));

                return (
                  <div className="flex gap-2.5 sm:gap-3 justify-start w-full max-w-full">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs animate-pulse mt-1">
                      <Bot className="h-4 w-4" />
                    </div>

                    {isPptRequest ? (
                      <div className="w-full max-w-xl rounded-2xl border border-blue-500/40 bg-gradient-to-br from-blue-500/10 via-background to-card p-4 text-xs text-card-foreground shadow-sm space-y-2.5 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs sm:text-sm">
                            <Presentation className="h-4 w-4 animate-bounce shrink-0" />
                            <span>Merancang Seluruh Slide Presentasi PPT...</span>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
                            Sedang Menyusun
                          </span>
                        </div>
                        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                          GuruPro AI sedang menyusun materi setiap slide secara mendalam, rinci, dan lengkap dari konsep dasar hingga penutup. File PPT akan langsung muncul otomatis di layar obrolan setelah seluruh halaman slide selesai dirangkai.
                        </p>
                        <div className="flex items-center gap-2 pt-1 border-t border-blue-500/20 text-[10.5px] text-blue-600 dark:text-blue-400 font-medium">
                          <Sparkles className="h-3 w-3 shrink-0" />
                          <span>Menulis rincian konten per slide sesuai outline materi...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground flex items-center gap-2.5 shadow-xs">
                        <span className="h-2 w-2 rounded-full bg-primary animate-ping shrink-0" />
                        <span>
                          {isIlustrasiRequest
                            ? `GuruPro AI sedang menganalisis materi & me-render ilustrasi FLUX.1 (${outlineSettings.illustrationStyleName})...`
                            : "GuruPro AI sedang menyusun materi terstruktur secara lengkap & mendalam..."}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* BOTTOM INPUT BAR RESPONSIF */}
        <div className="border-t border-border bg-card/90 p-2.5 sm:p-3 md:p-4 backdrop-blur-md shrink-0 w-full max-w-full">
          <div className="mx-auto max-w-3xl w-full">
            {/* Context attachment indicator */}
            {contextMateri.trim() && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Rujukan Bahan: {contextMateri.slice(0, 50)}...
                  </span>
                </div>
                <button
                  onClick={() => setContextMateri("")}
                  className="hover:text-destructive shrink-0 p-0.5"
                  title="Hapus lampiran rujukan"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ACTIVE OUTLINE CONFIGURATION PILL & SHORTCUT (Tahap 2) */}
            <div className="mb-2 flex items-center justify-between gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setTempOutlineSettings({ ...outlineSettings });
                  setShowOutlineModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors shadow-2xs"
                title="Klik untuk mengubah template tema PPT dan gaya visual ilustrasi"
              >
                <SlidersHorizontal className="h-3 w-3 shrink-0" />
                <span className="font-semibold text-foreground">
                  📊 PPT: {outlineSettings.pptStyleName.split(" ")[0]}
                </span>
                <span className="text-border">•</span>
                <span className="font-semibold text-foreground">
                  🎨 {outlineSettings.illustrationStyleName.split(" ")[0]}
                </span>
                <Settings2 className="h-2.5 w-2.5 ml-0.5 opacity-70 shrink-0" />
              </button>

              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                Sistem menerapkan outline ini otomatis saat Anda bertanya
              </span>
            </div>

            {/* Quick Action Chips (Horizontal Scrollable) */}
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar scroll-smooth touch-pan-x flex-nowrap w-full max-w-full">
              <button
                onClick={() => {
                  setInputMessage(
                    `@generate_ilustrasi buatkan ilustrasi edukatif gaya ${outlineSettings.illustrationStyleName} (rasio ${outlineSettings.illustrationAspect}) tentang `
                  );
                  setTimeout(() => textareaRef.current?.focus(), 80);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors font-semibold shadow-2xs"
                title="Ketik perintah generate gambar ilustrasi edukatif dengan FLUX.1"
              >
                <Palette className="h-3.5 w-3.5" />
                <span>@generate_ilustrasi</span>
              </button>

              <button
                onClick={() => {
                  setInputMessage(
                    `@generate_ppt susun presentasi PPT lengkap & mendalam tema ${outlineSettings.pptStyleName} tentang `
                  );
                  setTimeout(() => textareaRef.current?.focus(), 80);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors font-semibold shadow-2xs"
                title="Ketik perintah generate materi slide presentasi PPT"
              >
                <Presentation className="h-3.5 w-3.5" />
                <span>@generate_ppt</span>
              </button>

              <button
                onClick={() => {
                  setInputMessage(
                    `@generate_modul buatkan modul ajar Kurikulum Merdeka yang lengkap, mendalam, dan rinci dengan struktur Capaian Pembelajaran, Alur Tujuan Pembelajaran, Materi Inti, Asesmen & Refleksi tentang `
                  );
                  setTimeout(() => textareaRef.current?.focus(), 80);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors font-semibold shadow-2xs"
                title="Ketik perintah rancang Modul Ajar Kurikulum Merdeka"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>@generate_modul</span>
              </button>

              <button
                onClick={() => {
                  setInputMessage(
                    `Buatkan 5 soal HOTS pilihan ganda lengkap dengan kunci jawaban dan pembahasan mendalam tentang `
                  );
                  setTimeout(() => textareaRef.current?.focus(), 80);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground text-[11px]"
              >
                <FileQuestion className="h-3 w-3 text-primary" />
                <span>Buat Soal HOTS</span>
              </button>
            </div>

            {/* Textarea Input Card */}
            <div className="relative flex flex-col rounded-2xl border border-border bg-background shadow-xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary w-full max-w-full overflow-hidden">
              {/* Active Mode Indicator Banners */}
              {inputMessage.includes("@generate_ilustrasi") && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border-b border-purple-500/20 text-purple-600 dark:text-purple-400 text-[11px] font-medium">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse shrink-0" />
                  <span className="truncate">
                    Mode Ilustrasi Aktif: <strong>{outlineSettings.illustrationStyleName}</strong> ({outlineSettings.illustrationAspect}) via FLUX.1
                  </span>
                </div>
              )}
              {inputMessage.includes("@generate_ppt") && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-medium">
                  <Presentation className="h-3.5 w-3.5 animate-pulse shrink-0" />
                  <span className="truncate">
                    Mode Presentasi Aktif: <strong>{outlineSettings.pptStyleName}</strong> (Slide Lengkap & Mendalam)
                  </span>
                </div>
              )}
              {inputMessage.includes("@generate_modul") && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                  <BookOpen className="h-3.5 w-3.5 animate-pulse shrink-0" />
                  <span className="truncate">
                    Mode Modul Aktif: <strong>Modul Lengkap & Mendalam</strong> (Kurikulum Merdeka)
                  </span>
                </div>
              )}

              <div className="flex items-end w-full">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder="Tanyakan materi, atau gunakan @generate_ilustrasi, @generate_ppt..."
                  className="w-full resize-none bg-transparent p-2.5 sm:p-3 text-[13px] sm:text-sm focus:outline-none max-h-28 sm:max-h-36 min-h-[40px] sm:min-h-[44px]"
                />

                <div className="flex items-center gap-1 p-1.5 sm:p-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowContextModal(true)}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    title="Lampirkan Bahan Ajar / Catatan Guru"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setInputMessage(
                        `@generate_ilustrasi buatkan ilustrasi edukatif gaya ${outlineSettings.illustrationStyleName} (rasio ${outlineSettings.illustrationAspect}) tentang `
                      );
                      setTimeout(() => textareaRef.current?.focus(), 80);
                    }}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-purple-600 hover:bg-purple-500/10 transition-colors"
                    title="Sisipkan perintah @generate_ilustrasi (FLUX.1)"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>

                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim() || isLoading}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              GuruPro AI Assistant menggunakan Google Gemini. Periksa kesesuaian materi sebelum diajarkan di kelas.
            </p>
          </div>
        </div>
      </main>

      {/* ============================================================================== */}
      {/* MODAL 1: PENGATURAN TEMPLATE & OUTLINE (Tahap 2)                               */}
      {/* ============================================================================== */}
      {showOutlineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3.5 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    Pengaturan Template & Outline AI
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Tentukan gaya presentasi PPT dan visual ilustrasi yang akan digenerate oleh AI
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOutlineModal(false)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab Buttons */}
            <div className="flex border-b border-border bg-muted/20 px-4 sm:px-6 shrink-0">
              <button
                onClick={() => setOutlineModalTab("ppt")}
                className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
                  outlineModalTab === "ppt"
                    ? "border-primary text-primary font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Presentation className="h-3.5 w-3.5" />
                <span>Presentasi PPT</span>
              </button>
              <button
                onClick={() => setOutlineModalTab("illustration")}
                className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
                  outlineModalTab === "illustration"
                    ? "border-primary text-primary font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                <span>Gaya Ilustrasi</span>
              </button>
            </div>

            {/* Tab Body Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* TAB 1: PRESENTASI PPT */}
              {outlineModalTab === "ppt" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-2">
                      Pilih Tema & Gaya Slide PPT:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PPT_STYLES.map((st) => {
                        const isSelected = tempOutlineSettings.pptStyle === st.id;
                        return (
                          <div
                            key={st.id}
                            onClick={() =>
                              setTempOutlineSettings({
                                ...tempOutlineSettings,
                                pptStyle: st.id,
                                pptStyleName: st.name,
                              })
                            }
                            className={`p-3 rounded-xl border cursor-pointer transition-all text-left flex flex-col justify-between ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                                : "border-border bg-card hover:bg-muted/40"
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-base mr-1">{st.icon}</span>
                                <span className="text-[10px] font-semibold text-primary rounded-full bg-primary/10 px-2 py-0.5">
                                  {st.badge}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-foreground">{st.name}</h4>
                              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                {st.desc}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="mt-2 flex items-center gap-1 text-[10px] text-primary font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Gaya Aktif</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground flex items-start gap-2.5">
                      <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground block mb-0.5">Jumlah Slide Fleksibel</span>
                        <span>AI asisten menyusun slide secara mendalam sesuai keluasan materi tanpa batasan kaku.</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground block mb-1.5">
                        Rasio Aspek Layar:
                      </label>
                      <div className="flex gap-2">
                        {[
                          { label: "16:9 (Widescreen)", val: "16:9" },
                          { label: "4:3 (Klasik)", val: "4:3" },
                        ].map((r) => (
                          <button
                            key={r.val}
                            type="button"
                            onClick={() =>
                              setTempOutlineSettings({
                                ...tempOutlineSettings,
                                aspectRatio: r.val,
                              })
                            }
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              tempOutlineSettings.aspectRatio === r.val
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted/40 text-foreground hover:bg-muted"
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ILUSTRASI GAMBAR */}
              {outlineModalTab === "illustration" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-2">
                      Pilih Gaya Visual Ilustrasi:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ILL_STYLES.map((st) => {
                        const isSelected = tempOutlineSettings.illustrationStyle === st.id;
                        return (
                          <div
                            key={st.id}
                            onClick={() =>
                              setTempOutlineSettings({
                                ...tempOutlineSettings,
                                illustrationStyle: st.id,
                                illustrationStyleName: st.name,
                              })
                            }
                            className={`p-3 rounded-xl border cursor-pointer transition-all text-left flex flex-col justify-between ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                                : "border-border bg-card hover:bg-muted/40"
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-base mr-1">{st.icon}</span>
                                <span className="text-[10px] font-semibold text-primary rounded-full bg-primary/10 px-2 py-0.5">
                                  {st.badge}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-foreground">{st.name}</h4>
                              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                {st.desc}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="mt-2 flex items-center gap-1 text-[10px] text-primary font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Gaya Aktif</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <label className="text-xs font-bold text-foreground block mb-1.5">
                      Rasio Gambar Ilustrasi:
                    </label>
                    <div className="flex gap-2">
                      {[
                        { label: "16:9 (Lanskap Proyektor)", val: "16:9" },
                        { label: "1:1 (Persegi Modul)", val: "1:1" },
                        { label: "4:3 (Buku Pelajaran)", val: "4:3" },
                      ].map((r) => (
                        <button
                          key={r.val}
                          type="button"
                          onClick={() =>
                            setTempOutlineSettings({
                              ...tempOutlineSettings,
                              illustrationAspect: r.val,
                            })
                          }
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            tempOutlineSettings.illustrationAspect === r.val
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-muted/40 text-foreground hover:bg-muted"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 sm:px-6 py-3 bg-muted/20 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                Pilihan disimpan otomatis dan digunakan pada instruksi berikutnya.
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOutlineModal(false)}
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    persistOutlineSettings(tempOutlineSettings);
                    setShowOutlineModal(false);

                    const cleanPrev = inputMessage.replace(/^@generate_[a-z_]+\s*/i, "").trim();

                    if (outlineModalTab === "illustration") {
                      setInputMessage(
                        `@generate_ilustrasi ${cleanPrev ? cleanPrev : `buatkan ilustrasi edukatif gaya ${tempOutlineSettings.illustrationStyleName} (rasio ${tempOutlineSettings.illustrationAspect}) tentang `}`
                      );
                      toast.success(`Gaya ${tempOutlineSettings.illustrationStyleName} diterapkan! Tambahkan instruksi materi di chat.`);
                    } else {
                      setInputMessage(
                        `@generate_ppt ${cleanPrev ? cleanPrev : `susun presentasi PPT lengkap & mendalam tema ${tempOutlineSettings.pptStyleName} tentang `}`
                      );
                      toast.success(`Tema PPT ${tempOutlineSettings.pptStyleName} diterapkan! Tambahkan topik di chat.`);
                    }

                    setTimeout(() => {
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                        textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
                      }
                    }, 120);
                  }}
                  className="bg-primary text-primary-foreground font-semibold shadow-xs"
                >
                  Terapkan Pengaturan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL 2: LAMPIRKAN BAHAN AJAR RUJUKAN                                          */}
      {/* ============================================================================== */}
      {showContextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">Lampirkan Bahan Ajar Guru</h3>
              </div>
              <button
                onClick={() => setShowContextModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Tempelkan teks Capaian Pembelajaran (CP), silabus, ringkasan materi, atau catatan guru. AI akan menjawab berdasarkan rujukan ini.
            </p>

            <textarea
              rows={6}
              value={contextMateri}
              onChange={(e) => setContextMateri(e.target.value)}
              placeholder="Tempelkan teks materi atau silabus di sini..."
              className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-xs focus:border-primary focus:outline-none"
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setContextMateri("");
                  setShowContextModal(false);
                }}
              >
                Hapus
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowContextModal(false);
                  toast.success("Bahan ajar berhasil dilampirkan sebagai rujukan.");
                }}
              >
                Simpan Rujukan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL: GENERATE ILUSTRASI EDUKATIF (FLUX.1 SCHNELL)                            */}
      {/* ============================================================================== */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3.5 bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    Generate Gambar Edukatif (FLUX.1)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Render ilustrasi bebas biaya kuota via engine FLUX.1
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImageModal(false)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">
                  Deskripsi Gambar / Konsep Pembelajaran:
                </label>
                <textarea
                  rows={3}
                  value={imagePromptInput}
                  onChange={(e) => setImagePromptInput(e.target.value)}
                  placeholder="Misal: Diagram alur percabangan IF-ELSE dengan simbol standar flowchart, panah keputusan, dan teks jelas..."
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">
                  Format / Rasio Tampilan:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "16:9 (Slide PPT)", val: "16:9" },
                    { label: "1:1 (Persegi Modul)", val: "1:1" },
                    { label: "4:3 (Buku Pelajaran)", val: "4:3" },
                  ].map((r) => (
                    <button
                      key={r.val}
                      type="button"
                      onClick={() => setImageAspectInput(r.val as any)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                        imageAspectInput === r.val
                          ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                          : "border-border bg-muted/30 text-foreground hover:bg-muted/70"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">
                  Gaya Ilustrasi:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "vector", label: "Vektor Bersih Edukatif", desc: "Garis tegas, warna cerah, cocok modul" },
                    { id: "infographic", label: "Infografis Digital", desc: "Tata letak modern, ikonik & rapi" },
                    { id: "chalkboard", label: "Sketsa Papan Tulis", desc: "Nuansa ruang kelas & diagram kapur" },
                    { id: "photorealistic", label: "Realistis Edukasi", desc: "Fotografi detail untuk sains/alam" },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setImageStyleInput(st.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        imageStyleInput === st.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:bg-muted/30"
                      }`}
                    >
                      <div className="font-bold text-xs text-foreground">{st.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span>
                  <strong>100% Gratis & Bebas Hak Cipta:</strong> Menggunakan model <code>FLUX.1</code> tanpa memerlukan kuota API berbayar.
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 sm:px-6 py-3.5 bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImageModal(false)}
                disabled={isGeneratingImage}
              >
                Batal
              </Button>
              <Button
                size="sm"
                onClick={() => handleGenerateImage(imagePromptInput, targetMessageForImage || undefined)}
                disabled={!imagePromptInput.trim() || isGeneratingImage}
                className="gap-1.5 bg-primary font-semibold"
              >
                {isGeneratingImage ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    <span>Me-render FLUX.1...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Render Ilustrasi Sekarang</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL: ZOOM PREVIEW GAMBAR FULL-SIZE                                           */}
      {/* ============================================================================== */}
      {previewZoomImage && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewZoomImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-white/80 p-1.5 rounded-full bg-black/60 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewZoomImage}
              alt="Ukuran Penuh"
              className="rounded-xl max-h-[80vh] w-auto max-w-full object-contain shadow-2xl border border-white/10"
            />
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleDownloadImage(previewZoomImage, "ilustrasi-gurupro")}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Unduh Gambar Asli</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handleAttachImageToModul(previewZoomImage, "Ilustrasi Media Pembelajaran");
                  setPreviewZoomImage(null);
                }}
                className="gap-1.5"
              >
                <BookOpen className="h-4 w-4" />
                <span>Pasang ke Modul Ajar</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL: PRATINJAU INTERAKTIF PRESENTASI PPT (16:9 SLIDE VIEWER)                */}
      {/* ============================================================================== */}
      {slideViewerOpen && activeSlideDeck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 md:p-6 backdrop-blur-md animate-in fade-in"
          onClick={() => setSlideViewerOpen(false)}
        >
          <div
            className="w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl border border-white/10 bg-card shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                  <Presentation className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                      {activeSlideDeck.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Slide {activeSlideIndex + 1} / {activeSlideDeck.slideCount}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
                    Pratinjau Slide 16:9 • Tinjau sebelum mengunduh berkas .pptx
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(slideViewerMsgId, slideViewerRawContent)}
                  className="h-8 gap-1 text-xs hidden md:inline-flex"
                  title="Salin isi teks presentasi"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Teks</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSaveToPPT(slideViewerRawContent, slideViewerMsgId)}
                  disabled={savingAction === slideViewerMsgId + "-ppt"}
                  className="h-8 gap-1 text-xs hidden sm:inline-flex"
                  title="Simpan slide ke Modul Ajar"
                >
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <span>Simpan ke Modul</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleDownloadPPTFromChat(slideViewerRawContent, activeSlideDeck.title)}
                  className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                  title="Unduh berkas presentasi PowerPoint (.pptx)"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Unduh PPTX</span>
                </Button>

                <button
                  onClick={() => setSlideViewerOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
                  title="Tutup (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Slide Presentation Canvas (16:9 Interactive Area) */}
            <div className="relative flex-1 bg-slate-950 p-2 sm:p-4 md:p-6 flex items-center justify-center overflow-hidden min-h-[320px] sm:min-h-[420px] md:min-h-[480px]">
              {/* Previous Slide Button */}
              <button
                onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeSlideIndex === 0}
                className="absolute left-2 sm:left-4 z-10 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs hover:bg-black/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-lg hover:scale-105"
                title="Slide Sebelumnya (←)"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>

              {/* Next Slide Button */}
              <button
                onClick={() => setActiveSlideIndex((prev) => Math.min(activeSlideDeck.slideCount - 1, prev + 1))}
                disabled={activeSlideIndex === activeSlideDeck.slideCount - 1}
                className="absolute right-2 sm:right-4 z-10 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs hover:bg-black/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-lg hover:scale-105"
                title="Slide Selanjutnya (→)"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>

              {/* Slide 16:9 Board */}
              {(() => {
                const currentSlide = activeSlideDeck.slides[activeSlideIndex] || activeSlideDeck.slides[0];
                if (!currentSlide) return null;

                if (currentSlide.isCover || activeSlideIndex === 0) {
                  return (
                    <div className="w-full max-w-4xl aspect-video rounded-xl sm:rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-10 md:p-12 flex flex-col justify-between shadow-2xl relative overflow-hidden select-text">
                      {/* Decorative background glows */}
                      <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

                      {/* Header Badge */}
                      <div className="flex items-center justify-between relative z-10">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300">
                          <Sparkles className="h-3 w-3" />
                          KURIKULUM MERDEKA • GURUPRO AI
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Slide #{currentSlide.num} • Cover
                        </span>
                      </div>

                      {/* Cover Center Content */}
                      <div className="my-auto py-4 relative z-10 space-y-3">
                        <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                          {currentSlide.title || activeSlideDeck.title}
                        </h1>
                        {currentSlide.subtitle && (
                          <p className="text-xs sm:text-base text-sky-200/90 font-medium max-w-2xl leading-relaxed">
                            {currentSlide.subtitle}
                          </p>
                        )}
                        <div className="h-1 w-20 bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full mt-4" />
                      </div>

                      {/* Cover Footer */}
                      <div className="flex items-center justify-between border-t border-white/10 pt-4 text-[11px] text-slate-400 relative z-10">
                        <span>Media Pembelajaran Digital Interaktif</span>
                        <span>GuruPro AI Presentation Suite</span>
                      </div>
                    </div>
                  );
                }

                // Standard Content Slide
                return (
                  <div className="w-full max-w-4xl aspect-video rounded-xl sm:rounded-2xl border border-border bg-card text-card-foreground p-4 sm:p-7 md:p-9 flex flex-col justify-between shadow-2xl relative overflow-hidden select-text">
                    {/* Slide Header */}
                    <div className="border-b border-border/80 pb-2.5 sm:pb-3.5 shrink-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                          SLIDE #{currentSlide.num}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[240px]">
                          {activeSlideDeck.title}
                        </span>
                      </div>
                      <h2 className="text-sm sm:text-base md:text-xl font-bold text-foreground tracking-tight leading-snug">
                        {currentSlide.title}
                      </h2>
                      {currentSlide.subtitle && (
                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {currentSlide.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Slide Body: Dynamic & Flexible Presentation Layout */}
                    <div className="flex-1 my-2.5 sm:my-3.5 overflow-y-auto pr-1 sm:pr-2 flex flex-col justify-between">
                      {/* ARCHETYPE 1: PURE NARRATIVE DEEP EXPLANATION SLIDE */}
                      {currentSlide.layoutType === "narrative" && (
                        <div className="space-y-3.5 sm:space-y-4 my-auto py-1">
                          <div className="space-y-3 sm:space-y-3.5">
                            {(currentSlide.paragraphs && currentSlide.paragraphs.length > 0
                              ? currentSlide.paragraphs
                              : [currentSlide.description || ""]
                            ).map((para, pIdx) => (
                              <p
                                key={pIdx}
                                className="text-xs sm:text-[14px] md:text-[14.5px] lg:text-[15px] text-foreground/90 leading-relaxed font-normal text-left tracking-normal"
                              >
                                {para}
                              </p>
                            ))}
                          </div>

                          {currentSlide.highlight && (
                            <div className="mt-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-2.5 sm:p-3 flex items-start gap-2.5 shadow-2xs">
                              <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300 block">
                                  Studi Kasus & Penerapan Kontekstual
                                </span>
                                <p className="text-xs sm:text-[12.5px] text-foreground/90 leading-relaxed font-normal">
                                  {currentSlide.highlight}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ARCHETYPE 2: HYBRID SLIDE (NARRATIVE INTRO + KEY POINTS) */}
                      {currentSlide.layoutType === "hybrid" && (
                        <div className="space-y-3 my-auto py-1">
                          {currentSlide.description && (
                            <p className="text-xs sm:text-[13.5px] md:text-[14px] text-foreground/90 leading-relaxed font-normal">
                              {currentSlide.description}
                            </p>
                          )}

                          {currentSlide.bullets.length > 0 && (
                            <div
                              className={
                                currentSlide.bullets.length >= 3
                                  ? "grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1"
                                  : "space-y-2 pt-1"
                              }
                            >
                              {currentSlide.bullets.map((bullet, bIdx) => {
                                const colonIdx = bullet.indexOf(":");
                                const hasLabel = colonIdx > 0 && colonIdx < 35;
                                const label = hasLabel ? bullet.slice(0, colonIdx).trim() : null;
                                const value = hasLabel ? bullet.slice(colonIdx + 1).trim() : bullet;

                                return (
                                  <div
                                    key={bIdx}
                                    className="flex items-start gap-2 rounded-xl border border-border/70 bg-card/90 p-2.5 transition-all hover:bg-muted/30 hover:border-blue-500/30 shadow-2xs"
                                  >
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold mt-0.5">
                                      •
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      {label ? (
                                        <p className="text-xs sm:text-[13px] text-foreground/90 leading-relaxed">
                                          <strong className="text-foreground font-semibold mr-1">
                                            {label}:
                                          </strong>
                                          {value}
                                        </p>
                                      ) : (
                                        <p className="text-xs sm:text-[13px] text-foreground/90 leading-relaxed font-normal">
                                          {value}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {currentSlide.highlight && (
                            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-2.5 flex items-start gap-2 shadow-2xs">
                              <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300 block">
                                  Studi Kasus & Penerapan Kontekstual
                                </span>
                                <p className="text-xs sm:text-[12px] text-foreground/90 leading-relaxed font-normal">
                                  {currentSlide.highlight}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ARCHETYPE 3: CODE SNIPPET SLIDE */}
                      {currentSlide.layoutType === "code" && (
                        <div className="space-y-2.5 my-auto py-1">
                          {currentSlide.description && (
                            <p className="text-xs sm:text-[13px] text-foreground/90 leading-relaxed font-normal">
                              {currentSlide.description}
                            </p>
                          )}
                          {currentSlide.codeSnippet && (
                            <div className="rounded-xl border border-slate-700/80 bg-slate-900 text-slate-100 p-3 sm:p-3.5 font-mono text-[11px] sm:text-xs overflow-x-auto shadow-md">
                              <pre className="leading-relaxed">{currentSlide.codeSnippet}</pre>
                            </div>
                          )}
                          {currentSlide.highlight && (
                            <p className="text-[11.5px] sm:text-xs text-muted-foreground italic">
                              💡 {currentSlide.highlight}
                            </p>
                          )}
                        </div>
                      )}

                      {/* ARCHETYPE 4: STRUCTURED BULLETS / COMPARISON SLIDE */}
                      {(currentSlide.layoutType === "bullets" || (!currentSlide.layoutType && currentSlide.bullets.length > 0)) && (
                        <div className="space-y-2.5 my-auto py-1">
                          <div
                            className={
                              currentSlide.bullets.length >= 4
                                ? "grid grid-cols-1 sm:grid-cols-2 gap-2"
                                : "space-y-2"
                            }
                          >
                            {currentSlide.bullets.map((bullet, bIdx) => {
                              const colonIdx = bullet.indexOf(":");
                              const hasLabel = colonIdx > 0 && colonIdx < 35;
                              const label = hasLabel ? bullet.slice(0, colonIdx).trim() : null;
                              const value = hasLabel ? bullet.slice(colonIdx + 1).trim() : bullet;

                              return (
                                <div
                                  key={bIdx}
                                  className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-card/90 p-2.5 sm:p-3 transition-all hover:bg-muted/30 hover:border-blue-500/30 shadow-2xs"
                                >
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 mt-0.5 text-xs font-bold">
                                    •
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {label ? (
                                      <p className="text-xs sm:text-[13px] text-foreground/90 leading-relaxed">
                                        <strong className="text-foreground font-semibold mr-1.5">
                                          {label}:
                                        </strong>
                                        {value}
                                      </p>
                                    ) : (
                                      <p className="text-xs sm:text-[13px] text-foreground/90 leading-relaxed font-normal">
                                        {value}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {currentSlide.highlight && (
                            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-2.5 sm:p-3 flex items-start gap-2.5 shadow-2xs">
                              <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300 block">
                                  Studi Kasus & Penerapan Kontekstual
                                </span>
                                <p className="text-xs sm:text-[12px] text-foreground/90 leading-relaxed font-normal">
                                  {currentSlide.highlight}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Slide Footer */}
                    <div className="border-t border-border/60 pt-2 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
                      <span>Bahan Tayang Pembelajaran Kelas</span>
                      <span className="font-mono">
                        {activeSlideIndex + 1} / {activeSlideDeck.slideCount}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Bottom Slide Strip Carousel */}
            <div className="border-t border-border bg-card p-2 sm:p-3 shrink-0">
              <div className="flex items-center justify-between mb-1.5 px-1 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Daftar Seluruh Slide ({activeSlideDeck.slideCount}):</span>
                <span className="hidden sm:inline">Gunakan tombol panah ← / → di keyboard untuk beralih</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {activeSlideDeck.slides.map((s, idx) => {
                  const isActive = idx === activeSlideIndex;
                  return (
                    <button
                      key={s.id || idx}
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`group relative shrink-0 w-28 sm:w-32 h-16 rounded-lg border p-1.5 text-left flex flex-col justify-between transition-all ${
                        isActive
                          ? "border-blue-600 bg-blue-500/10 ring-2 ring-blue-600 shadow-xs"
                          : "border-border/80 bg-background/80 hover:border-muted-foreground/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[9px] font-bold px-1 rounded ${isActive ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                          #{s.num}
                        </span>
                        {s.isCover && (
                          <span className="text-[8px] font-bold text-amber-500">COVER</span>
                        )}
                      </div>
                      <p className={`text-[9.5px] font-semibold line-clamp-1 leading-tight ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : "text-foreground"}`}>
                        {s.title}
                      </p>
                      <span className="text-[8px] text-muted-foreground truncate">
                        {s.layoutType === "narrative"
                          ? "Uraian Narasi"
                          : s.layoutType === "hybrid"
                          ? "Narasi & Poin"
                          : s.layoutType === "code"
                          ? "Kode & Analisis"
                          : `${s.bullets.length} butir`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* ALERT DIALOG: HAPUS PERMANEN SINGLE CHAT                                       */}
      {/* ============================================================================== */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Hapus Percakapan Secara Permanen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Riwayat percakapan beserta seluruh modul dan jawaban di dalamnya akan dihapus dari penyimpanan perangkat Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId) {
                  permanentlyDelete(deleteConfirmId);
                }
              }}
            >
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================================== */}
      {/* ALERT DIALOG: KOSONGKAN SEMUA SAMPAH                                           */}
      {/* ============================================================================== */}
      <AlertDialog
        open={emptyTrashConfirm}
        onOpenChange={setEmptyTrashConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Kosongkan Semua Tempat Sampah?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Semua ({trashSessions.length}) obrolan yang ada di tempat sampah akan dihapus secara permanen dan tidak dapat dipulihkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={emptyTrash}
            >
              Kosongkan Sampah
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
