import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, resendConfirmationEmail } from "@/lib/auth-store";

interface LoginSearchParams {
  email?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearchParams => {
    return {
      email: typeof search.email === "string" ? search.email : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Masuk — GuruPro" },
      {
        name: "description",
        content: "Masuk ke akun GuruPro untuk mengelola administrasi pembelajaran Anda.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [email, setEmail] = useState(search.email || "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [ingat, setIngat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [isUnconfirmed, setIsUnconfirmed] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string | undefined;
    password?: string | undefined;
  }>({});

  const handleResend = async () => {
    if (!email.trim()) return;
    setResending(true);
    try {
      const res = await resendConfirmationEmail(email);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setResending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!email.trim()) found.email = "Email wajib diisi.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Format email tidak valid.";
    if (!password) found.password = "Kata sandi wajib diisi.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setIsUnconfirmed(false);
    try {
      const result = await login(email, password, ingat);
      if (!result.ok) {
        if (result.code === "unconfirmed_email") {
          setIsUnconfirmed(true);
          setErrors({ email: result.message });
        } else if (result.code === "invalid_credentials") {
          setErrors({ password: result.message });
        } else {
          setErrors({ password: result.message || "Gagal masuk ke aplikasi." });
        }
        toast.error(result.message || "Gagal masuk. Periksa email dan kata sandi Anda.");
        return;
      }

      toast.success("Berhasil masuk. Selamat datang kembali!");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">Masuk ke GuruPro</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Masuk dengan email dan kata sandi akun GuruPro Anda.
      </p>

      <Card className="mt-6">
        <CardContent className="p-5 sm:p-6">
          <form className="grid gap-4" onSubmit={submit} noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="nama@email.com"
                aria-invalid={!!errors.email}
              />
              {errors.email ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-destructive">{errors.email}</p>
                  {isUnconfirmed ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResend}
                      disabled={resending}
                      className="h-7 text-xs gap-1 text-primary hover:text-primary"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {resending ? "Mengirim ulang…" : "Kirim Ulang Tautan Konfirmasi"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Kata sandi</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="••••••••"
                  className="pr-10"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password}</p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={ingat} onCheckedChange={(v) => setIngat(v === true)} />
              Ingat saya di perangkat ini
            </label>

            <Button type="submit" disabled={loading} className="uppercase tracking-wide">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? "Memeriksa akun…" : "Masuk"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/lupa-kata-sandi" className="font-medium text-primary hover:underline">
              Lupa kata sandi?
            </Link>
            <span className="px-1.5">·</span>
            <Link to="/daftar" className="font-medium text-primary hover:underline">
              Daftar akun baru
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
