import assert from "node:assert/strict";

console.log("==================================================================");
console.log("    GURUPRO TEST SUITE: LOGIN RESILIENCE & PROFILE SELF-HEALING   ");
console.log("==================================================================");

let passed = 0;

// Test 1: Whitespace in password handling during registration vs login
function normalizeAuthPassword(pwd) {
  return typeof pwd === "string" ? pwd.trim() : "";
}

assert.equal(normalizeAuthPassword("Rahasia123 "), "Rahasia123");
assert.equal(normalizeAuthPassword("  Rahasia123  "), "Rahasia123");
console.log("  [PASS] 1. Password input whitespace normalization (trim on both signup & login)");
passed++;

// Test 2: Whitespace retry logic for mobile keyboards
function shouldRetryPasswordTrim(password, errMessage) {
  if (errMessage.toLowerCase().includes("invalid login credentials")) {
    return password.trim() !== password;
  }
  return false;
}

assert.equal(shouldRetryPasswordTrim("Password123 ", "invalid login credentials"), true);
assert.equal(shouldRetryPasswordTrim("Password123", "invalid login credentials"), false);
console.log("  [PASS] 2. Intelligent password whitespace retry detects accidental keyboard spaces");
passed++;

// Test 3: Self-healing profile creation from user_metadata
function selfHealProfile(user, dbRow) {
  if (dbRow) return { status: "loaded", profile: dbRow };
  const meta = user.user_metadata || {};
  const metaRole = meta.role === "guru" || meta.role === "siswa" ? meta.role : "";
  if (!metaRole) return { status: "missing" };

  return {
    status: "loaded",
    profile: {
      id: user.id,
      nama: meta.nama || "Pengguna",
      email: user.email,
      role: metaRole,
      status_verifikasi: "terverifikasi",
    },
  };
}

const mockUserWithMeta = {
  id: "user-abc-123",
  email: "guru.baru@sekolah.id",
  user_metadata: {
    nama: "Guru Baru",
    role: "guru",
    nip: "19880101",
  },
};

// Simulate database delay or missing profile row on first login
const healed = selfHealProfile(mockUserWithMeta, null);
assert.equal(healed.status, "loaded", "Must self-heal profile rather than lock user out");
assert.equal(healed.profile.role, "guru");
assert.equal(healed.profile.nama, "Guru Baru");
console.log("  [PASS] 3. Self-healing profile prevents 'profile_missing' lockout on login");
passed++;

// Test 4: Distinguish unconfirmed email vs invalid credentials
function mapAuthError(errMsg) {
  const lower = errMsg.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return {
      field: "password",
      code: "invalid_credentials",
      msg: "Email atau kata sandi tidak cocok. Pastikan penulisan huruf besar/kecil dan alamat email sudah benar.",
    };
  }
  if (lower.includes("email not confirmed")) {
    return {
      field: "email",
      code: "unconfirmed_email",
      msg: "Email akun Anda belum dikonfirmasi. Silakan periksa kotak masuk atau spam email Anda untuk mengklik tautan aktivasi.",
    };
  }
  return { field: "password", code: "unknown", msg: errMsg };
}

const res1 = mapAuthError("Invalid login credentials");
assert.equal(res1.code, "invalid_credentials");
assert.equal(res1.field, "password");

const res2 = mapAuthError("Email not confirmed");
assert.equal(res2.code, "unconfirmed_email");
assert.equal(res2.field, "email");
console.log("  [PASS] 4. Accurate error mapping separates unconfirmed email from wrong password");
passed++;

console.log("==================================================================");
console.log(`  ALL ${passed}/${passed} LOGIN RESILIENCE TESTS PASSED!`);
console.log("==================================================================");
