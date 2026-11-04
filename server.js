import express from "express";
import helmet from "helmet";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!DATABASE_URL) throw new Error("DATABASE_URL belum diatur.");
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET wajib diisi minimal 32 karakter.");
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) throw new Error("ADMIN_PASSWORD wajib diisi minimal 10 karakter.");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const existing = await pool.query("SELECT id FROM app_users WHERE username = $1", ["admin"]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await pool.query("INSERT INTO app_users(username,password_hash) VALUES($1,$2)", ["admin", hash]);
  }
  await pool.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING", [
    JSON.stringify({
      students: [], fees: [], payments: [],
      school: { name: "Nama Sekolah", year: "2026/2027", head: "", address: "" },
      teachers: [], petugas: [],
      admin: { menuAccess: {} },
      sectionPasswords: { interview: "123456", registration: "654321" },
      lastSync: ""
    })
  ]);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    if (!token) throw new Error("missing");
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesi berakhir. Silakan login kembali." });
  }
}

app.get("/api/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, database: "connected" }); }
  catch { res.status(503).json({ ok: false, database: "unavailable" }); }
});

app.post("/api/login", async (req, res) => {
  const password = String(req.body?.password || "");
  if (!password || password.length > 200) return res.status(400).json({ error: "Password tidak valid." });
  try {
    const result = await pool.query("SELECT id,password_hash FROM app_users WHERE username=$1", ["admin"]);
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: "Password admin salah." });
    }
    const token = jwt.sign({ sub: String(result.rows[0].id), role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, expiresIn: 28800 });
  } catch (e) {
    console.error("login:", e);
    res.status(500).json({ error: "Server gagal memproses login." });
  }
});

app.get("/api/state", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query("SELECT data FROM app_state WHERE id=1");
    res.json(result.rows[0]?.data || {});
  } catch (e) {
    console.error("read state:", e);
    res.status(500).json({ error: "Gagal membaca database." });
  }
});

app.put("/api/state", requireAuth, async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Format data tidak valid." });
  }
  try {
    await pool.query(
      "UPDATE app_state SET data=$1::jsonb, updated_at=NOW() WHERE id=1",
      [JSON.stringify(req.body)]
    );
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) {
    console.error("save state:", e);
    res.status(500).json({ error: "Gagal menyimpan data ke database." });
  }
});

app.post("/api/change-password", requireAuth, async (req, res) => {
  const oldPassword = String(req.body?.oldPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 10 || newPassword.length > 200) {
    return res.status(400).json({ error: "Password baru minimal 10 karakter." });
  }
  try {
    const result = await pool.query("SELECT id,password_hash FROM app_users WHERE username=$1", ["admin"]);
    if (!result.rowCount || !(await bcrypt.compare(oldPassword, result.rows[0].password_hash))) {
      return res.status(401).json({ error: "Password lama tidak sesuai." });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE app_users SET password_hash=$1 WHERE id=$2", [hash, result.rows[0].id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("change password:", e);
    res.status(500).json({ error: "Gagal mengganti password." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`SPMB online server listening on ${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
