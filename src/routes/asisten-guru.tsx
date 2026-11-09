import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  FileQuestion,
  FileText,
  MessageSquare,
  Paperclip,
  Plus,
  Presentation,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { chatWithGuruAiServerFn } from "@/lib/asisten-guru.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/asisten-guru")({
  component: AsistenGuruPage,
});

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "gurupro_asisten_guru_sessions_v1";

const STARTER_PROMPTS = [
  {
    icon: BookOpen,
    badge: "Modul Ajar",
    title: "Buat Modul Ajar Lengkap",
    prompt:
      "Tolong buatkan Modul Ajar Kurikulum Merdeka yang lengkap dan terstruktur untuk materi Pemrograman Dasar bab Percabangan IF-ELSE bagi siswa SMK kelas X. Sertakan Tujuan Pembelajaran, Pemahaman Bermakna, Pertanyaan Pemantik, dan Kegiatan Pembelajaran.",
  },
  {
    icon: Presentation,
    badge: "Presentasi PPT",
    title: "Rancang Slide Presentasi",
    prompt:
      "Rancang outline 5 slide presentasi PPT yang interaktif dan menarik untuk materi Struktur Data Array. Berikan judul tiap slide, poin-poin materi ringkas, dan ide visual yang cocok.",
  },
  {
    icon: Sparkles,
    badge: "Ide Ilustrasi Visual",
    title: "Rancang Diagram Edukatif",
    prompt:
      "Rancang konsep ilustrasi diagram alur (flowchart) logika keputusan percabangan IF-ELSE yang sangat jelas dan ramah siswa. Jelaskan setiap bentuk simbol (terminator, keputusan belah ketupat, proses) dan alur logikanya.",
  },
  {
    icon: FileQuestion,
    badge: "Asesmen & Soal",
    title: "Buat 5 Soal HOTS",
    prompt:
      "Buatkan 5 soal pilihan ganda berbasis HOTS (Higher Order Thinking Skills) untuk menguji pemahaman logika pemrograman dan algoritma, lengkap dengan opsi A-E, kunci jawaban, dan pembahasan mendalam.",
  },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    }
  }, []);

  // Save sessions to localStorage
  const persistSessions = (newSessions: ChatSession[]) => {
    setSessions(newSessions);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions));
    } catch (e) {
      console.error("Failed to persist sessions:", e);
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
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    if (updated.length === 0) {
      persistSessions([DEFAULT_SESSION]);
      setActiveSessionId(DEFAULT_SESSION.id);
    } else {
      persistSessions(updated);
      if (activeSessionId === id) {
        setActiveSessionId(updated[0].id);
      }
    }
    toast.success("Percakapan telah dihapus.");
  };

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || DEFAULT_SESSION;
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
        },
      });

      const assistantMsg: ChatMessage = {
        id: "msg_ai_" + Date.now(),
        role: "assistant",
        content: res.reply,
        createdAt: new Date().toISOString(),
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

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* SIDEBAR RIWAYAT CHAT */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0 -translate-x-full overflow-hidden md:w-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">AI Asisten Guru</h2>
              <p className="text-[11px] text-muted-foreground">Google Gemini 3.6 Flash</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-3">
          <Button
            onClick={createNewSession}
            className="w-full justify-start gap-2 rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>Percakapan Baru</span>
          </Button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari percakapan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/40 py-1.5 pl-8 pr-3 text-xs focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {filteredSessions.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Belum ada riwayat percakapan.
            </p>
          ) : (
            filteredSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  className={`group relative flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground font-medium shadow-xs"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{s.title || "Percakapan Baru"}</span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    title="Hapus percakapan"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-3 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Gemini AI Ready (Free Tier)
          </div>
        </div>
      </aside>

      {/* WORKSPACE CHAT UTAMA */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* HEADER ATAS */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="gap-1.5 rounded-lg text-xs"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Riwayat</span>
              </Button>
            )}
            <h1 className="text-sm font-semibold truncate max-w-xs md:max-w-md">
              {activeSession?.title || "AI Asisten Guru"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowContextModal(true)}
              className={`rounded-xl text-xs gap-1.5 ${
                contextMateri.trim() ? "border-primary text-primary bg-primary/5" : ""
              }`}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span>{contextMateri.trim() ? "Materi Terlampir" : "Lampirkan Bahan Ajar"}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={createNewSession}
              className="text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* CONTAINER PESAN */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {currentMessages.length === 0 ? (
            /* EMPTY HERO STATE */
            <div className="mx-auto my-auto max-w-2xl text-center py-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Halo, Bapak/Ibu Guru!
              </h2>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                Apa yang ingin kita rancang hari ini? Ketik pertanyaan Anda secara bebas, atau pilih salah satu kartu ide di bawah ini:
              </p>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 text-left">
                {STARTER_PROMPTS.map((starter, i) => {
                  const Icon = starter.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(starter.prompt)}
                      className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Icon className="h-3 w-3" />
                            {starter.badge}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <h3 className="text-xs font-bold text-foreground">
                          {starter.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {starter.prompt}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* MESSAGE LIST */
            <div className="mx-auto max-w-3xl space-y-5">
              {currentMessages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed sm:text-sm shadow-xs ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground"
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans">
                        {m.content}
                      </div>

                      {!isUser && (
                        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-muted-foreground">
                          <span className="text-[10px]">Gemini 3.6 Flash</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopy(m.id, m.content)}
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] hover:bg-muted transition-colors"
                              title="Salin teks jawaban"
                            >
                              {copiedId === m.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" />
                                  <span className="text-emerald-500">Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Salin</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => {
                                toast.info("Membuka Modul Ajar...");
                                void navigate({ to: "/modul-ajar" });
                              }}
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] hover:bg-muted transition-colors text-primary"
                              title="Gunakan materi di modul ajar"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>Ke Modul Ajar</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs animate-pulse">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                    <span>GuruPro AI sedang berpikir dan menyusun materi...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* BOTTOM INPUT BAR */}
        <div className="border-t border-border bg-card/80 p-3 md:p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-3xl">
            {/* Context attachment indicator */}
            {contextMateri.trim() && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Bahan Ajar Terlampir: {contextMateri.slice(0, 60)}...
                  </span>
                </div>
                <button
                  onClick={() => setContextMateri("")}
                  className="hover:text-destructive shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Quick Action Chips */}
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
              <button
                onClick={() => setInputMessage("Buatkan Modul Ajar Kurikulum Merdeka tentang ")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <BookOpen className="h-3 w-3 text-primary" />
                <span>Buat Modul Ajar</span>
              </button>
              <button
                onClick={() => setInputMessage("Rancang 5 slide presentasi PPT untuk materi ")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <Presentation className="h-3 w-3 text-primary" />
                <span>Buat Slide PPT</span>
              </button>
              <button
                onClick={() => setInputMessage("Rancang konsep gambar ilustrasi edukatif tentang ")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Buat Ide Ilustrasi</span>
              </button>
              <button
                onClick={() => setInputMessage("Buatkan 5 soal HOTS pilihan ganda tentang ")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <FileQuestion className="h-3 w-3 text-primary" />
                <span>Buat Soal Kuis</span>
              </button>
            </div>

            {/* Textarea Input Card */}
            <div className="relative flex items-end rounded-2xl border border-border bg-background shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
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
                placeholder="Tanyakan materi, minta dibuatkan modul, presentasi, atau ide gambar..."
                className="w-full resize-none bg-transparent p-3 text-xs sm:text-sm focus:outline-none max-h-32 min-h-[46px]"
              />

              <div className="flex items-center gap-1.5 p-2">
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
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              GuruPro AI Assistant menggunakan Google Gemini. Selalu telaah kesesuaian materi sebelum diajarkan di kelas.
            </p>
          </div>
        </div>
      </main>

      {/* MODAL LAMPIRKAN BAHAN AJAR */}
      {showContextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">Lampirkan Bahan Ajar Guru</h3>
              </div>
              <button
                onClick={() => setShowContextModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Tempelkan teks Capaian Pembelajaran (CP), silabus, ringkasan buku, atau catatan materi guru. AI akan menjawab berdasarkan rujukan ini.
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
    </div>
  );
}
