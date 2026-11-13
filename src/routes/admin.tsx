import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShieldAlert, LogIn, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-store";
import { AdminDashboard } from "./index";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Panel Admin — GuruPro" },
      {
        name: "description",
        content: "Pusat Operasional dan Kontrol Administrasi Sistem GuruPro.",
      },
    ],
  }),
  component: AdminPageRoute,
});

function AdminPageRoute() {
  const { profile, signedIn, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !signedIn) {
      void navigate({ to: "/login", replace: true });
    }
  }, [ready, signedIn, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (profile.role === "admin") {
    return <AdminDashboard />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Card className="border-destructive/30 shadow-sm">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">Akses Terbatas</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Halaman ini khusus untuk Administrator Sistem GuruPro. Akun Anda saat ini (
            <span className="font-semibold text-foreground">{profile.email || "Pengguna"}</span>) memiliki peran{" "}
            <span className="font-semibold text-foreground">{profile.role || "Tamu"}</span>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali ke Dashboard
              </Link>
            </Button>
            <Button asChild>
              <Link to="/login">
                <LogIn className="mr-2 h-4 w-4" />
                Masuk Akun Admin
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
