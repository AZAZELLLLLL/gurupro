import { resetAllCloudStores } from "@/lib/cloud-store";
import { resetTahunAjaranStore } from "@/lib/tahun-ajaran-store";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logSystemEvent } from "@/lib/admin-store";

export interface GuruProfile {
  id?: string;
  nama: string;
  email: string;
  nip: string;
  nisn?: string;
  sekolah: string;
  mapel: string;
  kelas: string;
  telepon: string;
  bio: string;
  role?: "guru" | "siswa" | "admin" | string;
  status_verifikasi?: "menunggu" | "terverifikasi" | "ditolak" | string;
}

export type UserProfile = GuruProfile;

export type ProfileStatus = "idle" | "loading" | "loaded" | "missing" | "error";

export interface AuthState {
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  profile: GuruProfile;
  profileStatus: ProfileStatus;
  profileError: string | null;
}

export type LoginResult = { ok: true } | { ok: false; message: string; code?: string };

export type RegisterResult =
  | { ok: true; user?: User; needsConfirmation?: boolean; message?: string }
  | { ok: false; message: string; code?: string };

export type RegisterGuruInput = {
  nama: string;
  email: string;
  telepon: string;
  sekolah: string;
  mapel: string;
  nip: string;
  password: string;
};

export type RegisterSiswaInput = {
  nama: string;
  email: string;
  telepon?: string;
  sekolah: string;
  jenjang: string;
  nisn: string;
  password: string;
};

export type RegisterInput = RegisterGuruInput;

export const AUTH_PUBLIC_PATHS = [
  "/login",
  "/daftar",
  "/lupa-kata-sandi",
  "/landing",
  "/gabung",
] as const;

export function isAuthPublicPath(pathname: string) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return (
    (AUTH_PUBLIC_PATHS as readonly string[]).includes(
      clean as (typeof AUTH_PUBLIC_PATHS)[number],
    ) || clean.startsWith("/gabung/")
  );
}

export const DEFAULT_PROFILE: GuruProfile = {
  id: "",
  nama: "Pengguna GuruPro",
  email: "",
  nip: "",
  nisn: "",
  sekolah: "",
  mapel: "",
  kelas: "",
  telepon: "",
  bio: "",
  role: "",
  status_verifikasi: "terverifikasi",
};

const LOGGED_OUT: AuthState = {
  ready: false,
  signedIn: false,
  user: null,
  profile: DEFAULT_PROFILE,
  profileStatus: "idle",
  profileError: null,
};

let state: AuthState = { ...LOGGED_OUT };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const get = () => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  emit();
}

export function isGuru(profile: GuruProfile): boolean {
  return profile?.role === "guru";
}

export function isSiswa(profile: GuruProfile): boolean {
  return profile?.role === "siswa";
}

export const ADMIN_EMAILS: readonly string[] = [
  "admin@gurupro.id",
  "novaragroup67@gmail.com",
];

export function isSystemAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function isAdmin(profile: GuruProfile): boolean {
  return profile?.role === "admin" || isSystemAdminEmail(profile?.email);
}

export type FetchProfileResult =
  | { status: "loaded"; profile: GuruProfile }
  | { status: "missing"; profile: GuruProfile }
  | { status: "error"; message: string; profile: GuruProfile };

export async function fetchProfileForUser(user: User): Promise<FetchProfileResult> {
  const isSysAdmin = isSystemAdminEmail(user.email);
  const fallbackProfile: GuruProfile = {
    id: user.id,
    nama: isSysAdmin ? "Administrator GuruPro" : user.email?.split("@")[0] || "Pengguna",
    email: user.email || "",
    nip: isSysAdmin ? "ADMIN-001" : "",
    nisn: "",
    sekolah: isSysAdmin ? "GuruPro Command Center" : "",
    mapel: isSysAdmin ? "Manajemen Sistem" : "",
    kelas: "",
    telepon: "",
    bio: isSysAdmin ? "Akun Khusus Administrator GuruPro" : "",
    role: isSysAdmin ? "admin" : "",
    status_verifikasi: "terverifikasi",
  };

  try {
    const { data: initialData, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[Auth] Real DB/RLS query error during fetchProfileForUser:", error.message, error);
      if (isSysAdmin) {
        return {
          status: "loaded",
          profile: fallbackProfile,
        };
      }
      return {
        status: "error",
        message: error.message || "Gagal memuat profil akun dari basis data.",
        profile: fallbackProfile,
      };
    }

    let profileRow: any = initialData;

    if (!profileRow) {
      console.warn("[Auth] No profile row found in DB for auth.uid():", user.id, "- attempting self-healing creation from user_metadata");
      const meta = (user.user_metadata || {}) as Record<string, any>;
      const rawRole = String(meta.role || "").toLowerCase().trim();
      const metaRole = rawRole === "guru" || rawRole === "siswa" ? rawRole : "";

      if (metaRole || isSysAdmin) {
        const resolvedRole = isSysAdmin ? "admin" : metaRole;
        const newProfileRow = {
          id: user.id,
          nama: meta.nama || (isSysAdmin ? "Administrator GuruPro" : user.email?.split("@")[0] || "Pengguna"),
          email: user.email || "",
          nip: resolvedRole === "siswa" ? "" : (meta.nip || (isSysAdmin ? "ADMIN-001" : "")),
          nisn: resolvedRole === "siswa" ? (meta.nisn || "") : "",
          sekolah: meta.sekolah || (isSysAdmin ? "GuruPro Command Center" : ""),
          mapel: meta.mapel || (isSysAdmin ? "Manajemen Sistem" : ""),
          kelas: meta.jenjang || meta.kelas || "",
          telepon: meta.telepon || "",
          bio: isSysAdmin ? "Akun Khusus Administrator GuruPro" : "",
          role: resolvedRole,
          status_verifikasi: "terverifikasi",
        };

        try {
          const { data: insertedData, error: insertError } = await supabase
            .from("profiles")
            .upsert(newProfileRow, { onConflict: "id" })
            .select()
            .maybeSingle();

          if (!insertError && insertedData) {
            console.log("[Auth] Self-healing profile created successfully:", insertedData.id);
            profileRow = insertedData;
          } else {
            console.warn("[Auth] Self-healing insert warning, using metadata profile:", insertError?.message);
            profileRow = newProfileRow;
          }
        } catch (healErr) {
          console.warn("[Auth] Self-healing exception, using metadata profile:", healErr);
          profileRow = newProfileRow;
        }
      } else if (isSysAdmin) {
        return {
          status: "loaded",
          profile: fallbackProfile,
        };
      } else {
        return {
          status: "missing",
          profile: fallbackProfile,
        };
      }
    }

    // Fail-safe role validation: strictly from DB, never trust client user_metadata for role elevation
    const rawRole = profileRow.role || "";
    let validatedRole =
      rawRole === "guru" || rawRole === "siswa" || rawRole === "admin" ? rawRole : "";

    if (isSysAdmin) {
      validatedRole = "admin";
    }

    const resolvedNisn =
      profileRow.nisn ||
      (validatedRole === "siswa" ? profileRow.nip : "") ||
      "";
    const resolvedNip =
      validatedRole === "siswa" ? "" : profileRow.nip || (isSysAdmin ? "ADMIN-001" : "");

    return {
      status: "loaded",
      profile: {
        id: profileRow.id,
        nama: profileRow.nama || (isSysAdmin ? "Administrator GuruPro" : "Pengguna"),
        email: profileRow.email || user.email || "",
        nip: resolvedNip,
        nisn: resolvedNisn,
        sekolah: profileRow.sekolah || (isSysAdmin ? "GuruPro Command Center" : ""),
        mapel: profileRow.mapel || (isSysAdmin ? "Manajemen Sistem" : ""),
        kelas: profileRow.kelas || "",
        telepon: profileRow.telepon || "",
        bio: profileRow.bio || (isSysAdmin ? "Akun Khusus Administrator GuruPro" : ""),
        role: validatedRole,
        status_verifikasi: isSysAdmin ? "terverifikasi" : (profileRow.status_verifikasi || "terverifikasi"),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data profil.";
    console.error("[Auth] Exception in fetchProfileForUser:", msg);
    if (isSysAdmin) {
      return {
        status: "loaded",
        profile: fallbackProfile,
      };
    }
    return {
      status: "error",
      message: msg,
      profile: fallbackProfile,
    };
  }
}

let authRequestId = 0;

async function syncProfile(user: User | null): Promise<FetchProfileResult | null> {
  const reqId = ++authRequestId;
  if (!user) {
    resetAllCloudStores();
    setState({
      ready: true,
      signedIn: false,
      user: null,
      profile: DEFAULT_PROFILE,
      profileStatus: "idle",
      profileError: null,
    });
    return null;
  }

  // Set loading status jika profil belum loaded
  if (state.profileStatus !== "loaded" || state.user?.id !== user.id) {
    setState({
      ready: true,
      signedIn: true,
      user,
      profileStatus: "loading",
      profileError: null,
    });
  }

  const result = await fetchProfileForUser(user);

  // Jika ada request auth yang lebih baru saat query berjalan, abaikan hasil usang
  if (reqId !== authRequestId) {
    return result;
  }

  setState({
    ready: true,
    signedIn: true,
    user,
    profile: result.profile,
    profileStatus: result.status,
    profileError: result.status === "error" ? result.message : null,
  });

  return result;
}

export async function refreshProfile(): Promise<FetchProfileResult | null> {
  return syncProfile(state.user);
}

let initialized = false;

function initAuth() {
  if (initialized) return;
  initialized = true;

  // Cek sesi awal
  supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (error) {
      console.error("[Auth] Error getting session:", error.message);
      setState({
        ready: true,
        signedIn: false,
        user: null,
        profile: DEFAULT_PROFILE,
        profileStatus: "idle",
        profileError: null,
      });
      return;
    }
    void syncProfile(session?.user ?? null);
  });

  // Listen perubahan auth state (misal login, logout, token refresh)
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      void syncProfile(session.user);
    } else {
      void syncProfile(null);
    }
  });
}

export function useAuth(): {
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  profile: GuruProfile;
  profileStatus: ProfileStatus;
  profileError: string | null;
  isGuru: boolean;
  isSiswa: boolean;
  isAdmin: boolean;
} {
  const current = useSyncExternalStore(subscribe, get, get);
  const [, force] = useState(0);

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (current.signedIn && current.user && current.profileStatus === "missing") {
      const timer = setTimeout(() => {
        void syncProfile(current.user);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [current.signedIn, current.user, current.profileStatus]);

  return {
    ready: current.ready,
    signedIn: current.signedIn,
    user: current.user,
    profile: current.profile,
    profileStatus: current.profileStatus,
    profileError: current.profileError,
    isGuru: isGuru(current.profile),
    isSiswa: isSiswa(current.profile),
    isAdmin: isAdmin(current.profile),
  };
}

export async function login(
  email: string,
  password: string,
  _remember?: boolean,
): Promise<LoginResult> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    // 1. Coba login dengan kredensial yang dimasukkan
    let { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    // 2. Jika gagal karena "invalid login credentials", coba variasi whitespace keyboard
    if (error && error.message.toLowerCase().includes("invalid login credentials")) {
      if (cleanPassword.trim() !== cleanPassword) {
        // Coba versi trim jika pengguna atau keyboard memasukkan spasi di ujung
        const retryTrim = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword.trim(),
        });
        if (!retryTrim.error && retryTrim.data.user) {
          data = retryTrim.data;
          error = null;
        }
      } else {
        // Coba variasi trailing space jika pengguna saat daftar tak sengaja menyertakan spasi
        const retrySpace = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword + " ",
        });
        if (!retrySpace.error && retrySpace.data.user) {
          data = retrySpace.data;
          error = null;
        }
      }
    }

    if (error) {
      const errMsg = error.message.toLowerCase();
      let code: string | undefined = undefined;
      let friendlyMessage = error.message;

      if (errMsg.includes("invalid login credentials")) {
        code = "invalid_credentials";
        friendlyMessage =
          "Email atau kata sandi tidak cocok. Pastikan penulisan huruf besar/kecil dan alamat email sudah benar.";
      } else if (errMsg.includes("email not confirmed")) {
        code = "unconfirmed_email";
        friendlyMessage =
          "Email akun Anda belum dikonfirmasi. Silakan periksa kotak masuk atau spam email Anda untuk mengklik tautan aktivasi.";
      } else if (errMsg.includes("rate limit") || errMsg.includes("too many requests")) {
        code = "rate_limit";
        friendlyMessage =
          "Terlalu banyak percobaan masuk. Silakan tunggu beberapa saat sebelum mencoba kembali.";
      }

      return { ok: false, message: friendlyMessage, code };
    }

    if (!data.user) {
      return {
        ok: false,
        message: "Tidak ada data pengguna yang dikembalikan dari server autentikasi.",
        code: "session_missing",
      };
    }

    // Tunggu syncProfile selesai untuk mendapatkan role yang valid
    let profileResult = await syncProfile(data.user);

    if (profileResult?.status === "error") {
      return {
        ok: false,
        message: `Gagal memuat profil akun: ${profileResult.message}`,
        code: "database_error",
      };
    }

    // Jika profil kosong tapi user_metadata memiliki role valid, pulihkan otomatis
    if (profileResult?.status === "missing" || !profileResult?.profile.role) {
      const metaRole = String(data.user.user_metadata?.role || "").toLowerCase().trim();
      if (metaRole === "guru" || metaRole === "siswa") {
        console.warn("[Auth] Restoring missing profile from user_metadata during login");
        const restoredProfile = {
          id: data.user.id,
          nama: String(data.user.user_metadata?.nama || cleanEmail.split("@")[0] || "Pengguna"),
          email: cleanEmail,
          nip: metaRole === "guru" ? String(data.user.user_metadata?.nip || "") : "",
          nisn: metaRole === "siswa" ? String(data.user.user_metadata?.nisn || "") : "",
          sekolah: String(data.user.user_metadata?.sekolah || ""),
          mapel: String(data.user.user_metadata?.mapel || ""),
          kelas: String(data.user.user_metadata?.jenjang || data.user.user_metadata?.kelas || ""),
          telepon: String(data.user.user_metadata?.telepon || ""),
          bio: "",
          role: metaRole,
          status_verifikasi: "terverifikasi",
        };
        await supabase.from("profiles").upsert(restoredProfile, { onConflict: "id" });
        profileResult = {
          status: "loaded",
          profile: restoredProfile,
        };
      } else if (isSystemAdminEmail(cleanEmail)) {
        profileResult = {
          status: "loaded",
          profile: {
            id: data.user.id,
            nama: "Administrator GuruPro",
            email: cleanEmail,
            nip: "ADMIN-001",
            nisn: "",
            sekolah: "GuruPro Command Center",
            mapel: "Manajemen Sistem",
            kelas: "",
            telepon: "",
            bio: "Akun Khusus Administrator GuruPro",
            role: "admin",
            status_verifikasi: "terverifikasi",
          },
        };
      } else {
        return {
          ok: false,
          message: "Data profil akun tidak ditemukan di basis data. Hubungi administrator.",
          code: "profile_missing",
        };
      }
    }

    if (!profileResult?.profile.role) {
      return {
        ok: false,
        message: "Akun ini belum memiliki peran pengguna (Guru/Siswa/Admin) yang valid.",
        code: "invalid_role",
      };
    }

    logSystemEvent({
      action: "LOGIN",
      category: "auth",
      detail: `Pengguna masuk: ${data.user.email} (${profileResult.profile.role})`,
      userEmail: data.user.email,
      userRole: profileResult.profile.role,
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengirim ulang tautan email konfirmasi bagi akun yang belum terkonfirmasi.
 */
export async function resendConfirmationEmail(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: "Tautan konfirmasi baru telah dikirim. Silakan periksa email Anda." };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Gagal mengirim ulang email konfirmasi." };
  }
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[Auth] Sign out error:", err);
  } finally {
    resetAllCloudStores();
    resetTahunAjaranStore();
    setState({
      ...LOGGED_OUT,
      ready: true,
    });
  }
}

export async function registerGuru(
  input: RegisterGuruInput,
): Promise<RegisterResult> {
  try {
    const cleanPassword = input.password.trim();
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: cleanPassword,
      options: {
        data: {
          nama: input.nama.trim(),
          role: "guru",
          nip: input.nip.trim(),
          sekolah: input.sekolah.trim(),
          mapel: input.mapel.trim(),
          telepon: input.telepon.trim(),
        },
      },
    });

    if (error) {
      const errMsg = error.message.toLowerCase();
      let code: string | undefined = undefined;
      let userFriendlyMessage = error.message;

      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already exists") ||
        errMsg.includes("user already exists")
      ) {
        code = "user_already_exists";
        userFriendlyMessage = "Email ini sudah terdaftar. Silakan login atau gunakan email lain.";
      } else if (errMsg.includes("rate limit") || errMsg.includes("too many requests")) {
        code = "rate_limit";
        userFriendlyMessage = "Terlalu banyak permintaan pendaftaran. Tunggu beberapa saat lalu coba lagi.";
      } else if (errMsg.includes("peran") && (errMsg.includes("tidak valid") || errMsg.includes("invalid"))) {
        code = "invalid_role";
        userFriendlyMessage = "Peran pendaftaran tidak valid. Hanya peran guru atau siswa yang diizinkan.";
      }

      return { ok: false, message: userFriendlyMessage, code };
    }

    const user = data.user ?? undefined;

    // Deteksi akun email sudah terdaftar via Supabase anti-enumeration (identities kosong)
    if (user && Array.isArray(user.identities) && user.identities.length === 0) {
      return {
        ok: false,
        message: "Email ini sudah terdaftar. Silakan login atau gunakan email lain.",
        code: "user_already_exists",
      };
    }

    const needsConfirmation = !data.session && Boolean(user);

    const message = needsConfirmation
      ? "Pendaftaran berhasil! Tautan konfirmasi telah dikirim ke email Anda. Silakan cek kotak masuk atau spam."
      : "Pendaftaran berhasil! Akun Anda telah aktif.";

    // Hanya sinkronkan profil jika sesi aktif berhasil dibuat (bukan flow konfirmasi email tertunda)
    if (data.session && user) {
      void syncProfile(user);
    }

    logSystemEvent({
      action: "REGISTER_GURU",
      category: "auth",
      detail: `Guru baru mendaftar: ${input.email} (${input.nama})`,
      userEmail: input.email,
      userRole: "guru",
    });

    return { ok: true, user, needsConfirmation, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function registerSiswa(
  input: RegisterSiswaInput,
): Promise<RegisterResult> {
  try {
    const cleanPassword = input.password.trim();
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: cleanPassword,
      options: {
        data: {
          nama: input.nama.trim(),
          role: "siswa",
          nisn: input.nisn.trim(),
          sekolah: input.sekolah.trim(),
          jenjang: input.jenjang.trim(),
          telepon: (input.telepon ?? "").trim(),
        },
      },
    });

    if (error) {
      const errMsg = error.message.toLowerCase();
      let code: string | undefined = undefined;
      let userFriendlyMessage = error.message;

      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already exists") ||
        errMsg.includes("user already exists")
      ) {
        code = "user_already_exists";
        userFriendlyMessage = "Email ini sudah terdaftar. Silakan login atau gunakan email lain.";
      } else if (errMsg.includes("rate limit") || errMsg.includes("too many requests")) {
        code = "rate_limit";
        userFriendlyMessage = "Terlalu banyak permintaan pendaftaran. Tunggu beberapa saat lalu coba lagi.";
      } else if (errMsg.includes("peran") && (errMsg.includes("tidak valid") || errMsg.includes("invalid"))) {
        code = "invalid_role";
        userFriendlyMessage = "Peran pendaftaran tidak valid. Hanya peran guru atau siswa yang diizinkan.";
      }

      return { ok: false, message: userFriendlyMessage, code };
    }

    const user = data.user ?? undefined;

    // Deteksi akun email sudah terdaftar via Supabase anti-enumeration (identities kosong)
    if (user && Array.isArray(user.identities) && user.identities.length === 0) {
      return {
        ok: false,
        message: "Email ini sudah terdaftar. Silakan login atau gunakan email lain.",
        code: "user_already_exists",
      };
    }

    const needsConfirmation = !data.session && Boolean(user);

    const message = needsConfirmation
      ? "Pendaftaran berhasil! Tautan konfirmasi telah dikirim ke email Anda. Silakan cek kotak masuk atau spam."
      : "Pendaftaran berhasil! Akun Anda telah aktif.";

    // Hanya sinkronkan profil jika sesi aktif berhasil dibuat (bukan flow konfirmasi email tertunda)
    if (data.session && user) {
      void syncProfile(user);
    }

    logSystemEvent({
      action: "REGISTER_SISWA",
      category: "auth",
      detail: `Siswa baru mendaftar: ${input.email} (${input.nama})`,
      userEmail: input.email,
      userRole: "siswa",
    });

    return { ok: true, user, needsConfirmation, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function updateProfile(
  patch: Partial<GuruProfile>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const current = get();
  if (!current.user) {
    return {
      ok: false,
      message: "Sesi autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
    };
  }

  // Strip privilege & identity fields to prevent client-side authorization escalation
  const { role: _r, status_verifikasi: _s, id: _id, ...safePatch } = patch;
  const nextProfile = { ...current.profile, ...safePatch };

  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        nama: nextProfile.nama,
        nip: nextProfile.nip,
        nisn: nextProfile.nisn ?? "",
        sekolah: nextProfile.sekolah,
        mapel: nextProfile.mapel,
        kelas: nextProfile.kelas,
        telepon: nextProfile.telepon,
        bio: nextProfile.bio,
      })
      .eq("id", current.user.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    // Update in-memory state only AFTER Supabase confirms write
    setState({ profile: nextProfile });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui profil di database.";
    return { ok: false, message: msg };
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const redirectUrl =
      typeof window !== "undefined" ? `${window.location.origin}/lupa-kata-sandi` : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectUrl,
    });

    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim permintaan reset kata sandi.";
    return { ok: false, message: msg };
  }
}

export async function completePasswordReset(
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui kata sandi.";
    return { ok: false, message: msg };
  }
}

export function initials(nama: string | undefined | null) {
  if (!nama || typeof nama !== "string") return "GP";
  return (
    nama
      .replace(/^(Bu|Pak|Bapak|Ibu)\s+/i, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || "GP"
  );
}

export function shortName(nama: string | undefined | null) {
  if (!nama || typeof nama !== "string") return "Pengguna";
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Pengguna";
}
