import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Tipos e constantes
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type Role = "driver" | "admin" | "gestor";

interface PublicUser {
  id: number;
  name: string;
  email: string;
  cpf: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  is_master: boolean;
  current_plate: string | null;
  shift_started_at: string | null;
  shift_status: "ON_SHIFT" | "OFF_SHIFT";
}

interface WsMessage {
  type: "NEW_OS" | "DATA_CHANGED" | "SESSION_REVOKED";
  os_id?: number;
  os_number?: string;
  title?: string;
  message?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      sessionToken?: string;
    }
  }
}

const TZ = "America/Manaus";
const ROLES: Role[] = ["driver", "admin", "gestor"];
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;
const VEHICLE_ITEMS = ["pneus", "luzes", "oleo", "freios", "limpeza"] as const;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** E-mails das contas de demonstração da versão antiga (as senhas delas eram públicas). */
const LEGACY_DEMO_EMAILS = new Set(["admin@logitrack.com", "gestor@logitrack.com", "motorista@logitrack.com"]);
// Senhas que foram publicadas no README antigo; usadas só para neutralizar essas contas na migração.
const LEGACY_PUBLIC_PASSWORDS: Record<string, string> = {
  "admin@logitrack.com": "admin123",
  "gestor@logitrack.com": "gestor123",
  "motorista@logitrack.com": "123456",
};

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, message: string, code?: string): never {
  throw new HttpError(status, message, code);
}

// ---------------------------------------------------------------------------
// Datas (Manaus)
// ---------------------------------------------------------------------------

const manausFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function manausParts(date = new Date()) {
  const parts = manausFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function todayInManaus(): string {
  return manausParts().date;
}

function nowInManausLocal(): string {
  const p = manausParts();
  return `${p.date}T${p.time}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayLabel(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

// ---------------------------------------------------------------------------
// Senhas
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: unknown, stored: unknown): boolean {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = crypto.scryptSync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Usado quando o e-mail não existe, para o tempo de resposta ser parecido.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex"));

// ---------------------------------------------------------------------------
// Banco de dados
// ---------------------------------------------------------------------------

const dbPath = path.resolve(process.env.DATABASE_PATH || "logistic.db");

function backupStamp(): string {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

function openDatabase(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  console.log(`[db] Banco de dados: ${file}`);
  if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    console.warn("============================================================");
    console.warn("[db] ATENÇÃO: rodando no Railway SEM volume.");
    console.warn("[db] Todos os dados serão PERDIDOS no próximo deploy.");
    console.warn("[db] Crie um Volume em /data e use DATABASE_PATH=/data/logistic.db");
    console.warn("============================================================");
  }
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (volume && !file.startsWith(path.resolve(volume) + path.sep)) {
    console.warn(`[db] ATENÇÃO: o banco NÃO está dentro do volume (${volume}). Use DATABASE_PATH=${path.join(volume, "logistic.db")}`);
  }

  const existed = fs.existsSync(file) && fs.statSync(file).size > 0;
  let database = new Database(file);
  if (existed && Number(database.pragma("user_version", { simple: true })) < 1) {
    database.close();
    const backup = `${file}.bak-${backupStamp()}`;
    fs.copyFileSync(file, backup);
    console.log(`[db] Cópia de segurança antes da migração: ${backup}`);
    database = new Database(file);
  }
  database.pragma("busy_timeout = 5000");
  return database;
}

const db = openDatabase(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    cpf TEXT UNIQUE,
    role TEXT CHECK(role IN ('driver', 'admin', 'gestor')),
    is_active INTEGER DEFAULT 1,
    shift_status TEXT DEFAULT 'OFF_SHIFT',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    current_plate TEXT,
    shift_started_at TEXT
  );

  CREATE TABLE IF NOT EXISTS service_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_number TEXT UNIQUE,
    driver_id INTEGER,
    motorista_original_id INTEGER,
    plate TEXT,
    truck_plate TEXT,
    origin TEXT,
    destination TEXT,
    status TEXT DEFAULT 'ABERTA',
    admin_note TEXT,
    last_reassigned_at DATETIME,
    reassignment_count INTEGER DEFAULT 0,
    has_pickup INTEGER DEFAULT 0,
    has_delivery INTEGER DEFAULT 0,
    distance_km REAL,
    haulage_cost REAL,
    scheduled_date TEXT,
    os_start_time TEXT,
    os_end_time TEXT,
    route_start_time TEXT,
    route_end_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES users(id),
    FOREIGN KEY(motorista_original_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS os_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER,
    type TEXT CHECK(type IN ('COLETA', 'ENTREGA')),
    photo_data TEXT,
    lat REAL,
    lng REAL,
    accuracy REAL,
    battery_level REAL,
    network_type TEXT,
    device_id TEXT,
    local_time DATETIME,
    server_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    observation TEXT,
    plate TEXT,
    trailer_state TEXT,
    FOREIGN KEY(os_id) REFERENCES service_orders(id)
  );

  CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER,
    vehicle_plate TEXT,
    type TEXT CHECK(type IN ('VEHICLE', 'CONTAINER')),
    os_id INTEGER,
    items JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES users(id),
    FOREIGN KEY(os_id) REFERENCES service_orders(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER,
    actor_id INTEGER,
    actor_role TEXT,
    action TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(os_id) REFERENCES service_orders(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reassignment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER,
    requested_by_user_id INTEGER,
    requested_by_role TEXT,
    current_driver_id INTEGER,
    new_driver_id INTEGER,
    reason TEXT,
    status TEXT DEFAULT 'PENDENTE',
    manager_user_id INTEGER,
    decision_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,
    FOREIGN KEY(os_id) REFERENCES service_orders(id),
    FOREIGN KEY(requested_by_user_id) REFERENCES users(id),
    FOREIGN KEY(current_driver_id) REFERENCES users(id),
    FOREIGN KEY(new_driver_id) REFERENCES users(id),
    FOREIGN KEY(manager_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Colunas adicionadas depois (bancos antigos)
try { db.prepare("ALTER TABLE service_orders ADD COLUMN motorista_original_id INTEGER").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN last_reassigned_at DATETIME").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN reassignment_count INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN has_pickup INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN has_delivery INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN distance_km REAL").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN haulage_cost REAL").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN scheduled_date TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN os_start_time TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN os_end_time TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN route_start_time TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN route_end_time TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE service_orders ADD COLUMN truck_plate TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE audit_log ADD COLUMN actor_role TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN cpf TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN shift_status TEXT DEFAULT 'OFF_SHIFT'").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN current_plate TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN shift_started_at TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0").run(); } catch {}
db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");
try { db.prepare("ALTER TABLE os_events ADD COLUMN plate TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE os_events ADD COLUMN trailer_state TEXT").run(); } catch {}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_so_driver ON service_orders(driver_id);
  CREATE INDEX IF NOT EXISTS idx_so_scheduled ON service_orders(scheduled_date);
  CREATE INDEX IF NOT EXISTS idx_events_os ON os_events(os_id);
  CREATE INDEX IF NOT EXISTS idx_checklists_driver ON checklists(driver_id);
  CREATE INDEX IF NOT EXISTS idx_checklists_os ON checklists(os_id);
  CREATE INDEX IF NOT EXISTS idx_audit_os ON audit_log(os_id);
  CREATE INDEX IF NOT EXISTS idx_requests_os ON reassignment_requests(os_id, status);
`);

/** Migração única (versão 1): senhas, CPF, valores falsos e datas antigas. */
function migrateToV1() {
  const run = db.transaction(() => {
    let hashed = 0;
    for (const u of db.prepare("SELECT id, email, password FROM users").all() as Row[]) {
      const pw = u.password;
      if (typeof pw === "string" && pw.startsWith("scrypt$")) continue;
      if (typeof pw !== "string" || pw.length === 0) {
        console.warn(`[migração] Usuário #${u.id} (${u.email}) sem senha válida — pulado. Use "Resetar senha".`);
        continue;
      }
      try {
        const email = String(u.email ?? "").trim().toLowerCase();
        let newPassword = pw;
        if (LEGACY_DEMO_EMAILS.has(email) && pw === LEGACY_PUBLIC_PASSWORDS[email]) {
          if (email === "admin@logitrack.com" && process.env.ADMIN_PASSWORD) {
            // A senha pública do admin antigo é trocada pela de ADMIN_PASSWORD.
            newPassword = process.env.ADMIN_PASSWORD;
            console.warn(`[migração] Senha pública de ${email} substituída pela de ADMIN_PASSWORD.`);
          } else if (email === "admin@logitrack.com") {
            console.warn(`[migração] ATENÇÃO: ${email} ainda usa a senha pública. Defina ADMIN_PASSWORD ou troque a senha agora.`);
          } else {
            // Contas de demonstração com senha pública ficam desativadas (o admin pode reativar e resetar).
            db.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(u.id);
            console.warn(`[migração] Conta de demonstração ${email} desativada (usava senha pública).`);
          }
        }
        db.prepare("UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?").run(hashPassword(newPassword), u.id);
        hashed++;
      } catch (err) {
        console.warn(`[migração] Não foi possível converter a senha do usuário #${u.id} — pulado.`, err);
      }
    }

    db.prepare("UPDATE users SET cpf = NULL WHERE cpf IS NOT NULL AND trim(cpf) = ''").run();
    db.prepare("UPDATE users SET shift_status = 'OFF_SHIFT', shift_started_at = NULL, current_plate = NULL").run();

    for (const u of db.prepare("SELECT id, email FROM users WHERE email IS NOT NULL").all() as Row[]) {
      const normalized = String(u.email).trim().toLowerCase();
      if (normalized === u.email) continue;
      const clash = db.prepare("SELECT id FROM users WHERE id != ? AND lower(trim(email)) = ?").get(u.id, normalized);
      if (clash) {
        console.warn(`[migração] E-mail de #${u.id} não foi passado para minúsculas (conflito com #${(clash as Row).id}).`);
        continue;
      }
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(normalized, u.id);
    }

    const zeroed = db
      .prepare("UPDATE service_orders SET distance_km = NULL, haulage_cost = NULL WHERE distance_km IS NOT NULL OR haulage_cost IS NOT NULL")
      .run().changes;
    const fakeChecklists = db.prepare("DELETE FROM checklists WHERE vehicle_plate = 'FROTA-LOGI'").run().changes;
    db.prepare(
      "UPDATE service_orders SET scheduled_date = COALESCE(date(created_at, '-4 hours'), ?) WHERE scheduled_date IS NULL OR trim(scheduled_date) = ''"
    ).run(todayInManaus());

    db.pragma("user_version = 1");
    console.log(
      `[migração] v1 concluída: ${hashed} senha(s) protegida(s), ${zeroed} OS com KM/custo antigos zerados, ${fakeChecklists} checklist(s) falso(s) removido(s).`
    );
  });
  run();
}

if (Number(db.pragma("user_version", { simple: true })) < 1) migrateToV1();

function createSeedUser(name: string, email: string, password: string, role: Role) {
  db.prepare(
    "INSERT INTO users (name, email, password, role, is_active, must_change_password, shift_status) VALUES (?, ?, ?, ?, 1, 1, 'OFF_SHIFT')"
  ).run(name, email, hashPassword(password), role);
}

/** Dados do Master vindos das variáveis de ambiente (ou null se incompletos). */
function masterFromEnv(): { name: string; email: string; password: string } | null {
  const name = process.env.MASTER_NAME?.trim();
  const email = process.env.MASTER_EMAIL?.trim().toLowerCase();
  const password = process.env.MASTER_PASSWORD;
  if (!name && !email && !password) return null;
  if (!name || !email || !password) {
    console.warn("[master] Defina MASTER_NAME, MASTER_EMAIL e MASTER_PASSWORD juntas — conta Master não configurada.");
    return null;
  }
  if (password.length < MIN_PASSWORD) {
    console.warn(`[master] MASTER_PASSWORD precisa ter pelo menos ${MIN_PASSWORD} caracteres — conta Master não configurada.`);
    return null;
  }
  return { name, email, password };
}

/**
 * Cria ou atualiza a conta Master a partir de MASTER_NAME / MASTER_EMAIL / MASTER_PASSWORD.
 * Só existe um Master. A senha da variável só é aplicada quando ela muda (guardamos um hash
 * da última senha aplicada), então reiniciar não desfaz uma troca de senha feita pelo app.
 */
function bootstrapMaster() {
  const master = masterFromEnv();
  if (!master) return;
  const getSetting = (key: string) =>
    (db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as Row | undefined)?.value as string | undefined;
  const setSetting = (key: string, value: string) =>
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);

  db.transaction(() => {
    let row = db.prepare("SELECT * FROM users WHERE lower(email) = ? ORDER BY id LIMIT 1").get(master.email) as Row | undefined;
    const appliedHash = getSetting("master_password_hash");
    const passwordChanged = !appliedHash || !verifyPassword(master.password, appliedHash);

    if (!row) {
      db.prepare(
        "INSERT INTO users (name, email, password, role, is_active, must_change_password, is_master, shift_status) VALUES (?, ?, ?, 'admin', 1, 0, 1, 'OFF_SHIFT')"
      ).run(master.name, master.email, hashPassword(master.password));
      row = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(master.email) as Row;
      console.log(`[master] Conta Master criada: ${master.email}`);
    } else {
      db.prepare(
        "UPDATE users SET name = ?, role = 'admin', is_active = 1, is_master = 1, shift_started_at = NULL, current_plate = NULL, shift_status = 'OFF_SHIFT' WHERE id = ?"
      ).run(master.name, row.id);
      if (passwordChanged) {
        db.prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(master.password), row.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
        console.log(`[master] Senha do Master redefinida pela variável MASTER_PASSWORD: ${master.email}`);
      }
      if (!row.is_master) console.log(`[master] Conta ${master.email} promovida a Master.`);
    }

    const demoted = db.prepare("UPDATE users SET is_master = 0 WHERE is_master = 1 AND id != ?").run(row.id).changes;
    if (demoted) console.log(`[master] ${demoted} conta(s) deixaram de ser Master (só existe um, o de MASTER_EMAIL).`);
    if (passwordChanged) setSetting("master_password_hash", hashPassword(master.password));
  })();
}

function seedUsers() {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row).n;
  if (count === 0 && masterFromEnv()) {
    console.log("[seed] Banco vazio com MASTER_* definido: a conta Master será a primeira administradora.");
  } else if (count === 0) {
    const email = (process.env.ADMIN_EMAIL || "admin@logitrack.com").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "admin123";
    if (password.length < MIN_PASSWORD) console.warn(`[seed] ADMIN_PASSWORD tem menos de ${MIN_PASSWORD} caracteres.`);
    createSeedUser("Administrador", email, password, "admin");
    console.log(`[seed] Conta de administrador criada: ${email} (troca de senha obrigatória no primeiro acesso).`);
  }

  const optional: { prefix: string; role: Role }[] = [
    { prefix: "GESTOR", role: "gestor" },
    { prefix: "MOTORISTA", role: "driver" },
  ];
  for (const { prefix, role } of optional) {
    const name = process.env[`${prefix}_NAME`]?.trim();
    const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
    const password = process.env[`${prefix}_TEMP_PASSWORD`];
    if (!name || !email || !password) continue;
    if (password.length < MIN_PASSWORD) {
      console.warn(`[seed] ${prefix}_TEMP_PASSWORD precisa ter pelo menos ${MIN_PASSWORD} caracteres — usuário não criado.`);
      continue;
    }
    if (db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email)) continue;
    createSeedUser(name, email, password, role);
    console.log(`[seed] Usuário ${role} criado a partir das variáveis ${prefix}_*: ${email}`);
  }
}

seedUsers();
bootstrapMaster();

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

function getBody(req: Request): Row {
  const body = req.body;
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

function toId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Texto opcional: undefined = não enviado; null = apagar. */
function optText(value: unknown, label: string, max = 500): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") fail(400, `Valor inválido em "${label}".`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) fail(400, `"${label}" pode ter no máximo ${max} caracteres.`);
  return text;
}

function optPlate(value: unknown, label: string): string | null | undefined {
  const text = optText(value, label, 20);
  return typeof text === "string" ? text.toUpperCase().replace(/\s+/g, "") : text;
}

function optTime(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(400, `${label}: horário inválido. Use o formato HH:MM.`);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function optDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : "";
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T12:00:00Z`).toISOString().slice(0, 10) === text;
  if (!valid) fail(400, "Data inválida.");
  return text;
}

function optAmount(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0) fail(400, "Use números, ex.: 1200,50");
  return Math.round(n * 100) / 100;
}

function parseBool(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  return null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

function isValidEmail(email: string): boolean {
  return email.length <= 200 && /^[^\s@]+@[^\s@]+$/.test(email);
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeCpf(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") fail(400, "CPF inválido.");
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (digits.length !== 11) fail(400, "CPF inválido. Use os 11 números.");
  return digits;
}

function checkNewPassword(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD) {
    fail(400, `${label} precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  if (value.length > MAX_PASSWORD) fail(400, `${label} pode ter no máximo ${MAX_PASSWORD} caracteres.`);
  return value;
}

/** local_time do celular: 'YYYY-MM-DDTHH:mm:ss' no horário de Manaus. */
function normalizeLocalTime(value: unknown): string {
  if (value === undefined || value === null || value === "") return nowInManausLocal();
  if (typeof value !== "string") fail(400, "Horário do evento inválido.");
  const text = value.trim();
  const m = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (m) {
    if (Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59) fail(400, "Horário do evento inválido.");
    return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}`;
  }
  // Com fuso (ex.: ISO em UTC) → converte para Manaus.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) {
      const p = manausParts(d);
      return `${p.date}T${p.time}`;
    }
  }
  fail(400, "Horário do evento inválido.");
}

function parseItems(raw: unknown): Row {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Usuários, sessões e auditoria
// ---------------------------------------------------------------------------

function publicUser(row: Row): PublicUser {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    cpf: row.cpf || null,
    role: row.role,
    is_active: !!row.is_active,
    must_change_password: !!row.must_change_password,
    is_master: !!row.is_master,
    current_plate: row.current_plate ?? null,
    shift_started_at: row.shift_started_at ?? null,
    shift_status: row.shift_started_at ? "ON_SHIFT" : "OFF_SHIFT",
  };
}

function getUserRow(id: number): Row | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
}

function getUserOr404(idParam: unknown): Row {
  const id = toId(idParam);
  const row = id ? getUserRow(id) : undefined;
  if (!row) fail(404, "Usuário não encontrado.");
  return row;
}

function getActiveDriver(id: number | null): Row | undefined {
  if (!id) return undefined;
  return db.prepare("SELECT * FROM users WHERE id = ? AND role = 'driver' AND is_active = 1").get(id) as Row | undefined;
}

function ensureUniqueEmail(email: string, exceptId = 0) {
  if (db.prepare("SELECT id FROM users WHERE lower(email) = ? AND id != ?").get(email, exceptId)) {
    fail(409, "E-mail já cadastrado");
  }
}

function ensureUniqueCpf(cpf: string | null | undefined, exceptId = 0) {
  if (!cpf) return;
  const clash = db
    .prepare(
      "SELECT id FROM users WHERE id != ? AND replace(replace(replace(replace(cpf, '.', ''), '-', ''), ' ', ''), '/', '') = ?"
    )
    .get(exceptId, cpf);
  if (clash) fail(409, "CPF já cadastrado");
}

function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, new Date().toISOString());
  return token;
}

function isSessionExpired(createdAt: unknown): boolean {
  const t = Date.parse(String(createdAt ?? ""));
  return Number.isNaN(t) || Date.now() - t > SESSION_TTL_MS;
}

/** Sessão válida → usuário ativo; senão null (e limpa o que estiver inválido). */
function resolveSession(token: unknown): Row | null {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as Row | undefined;
  if (!session) return null;
  if (isSessionExpired(session.created_at)) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  const user = getUserRow(session.user_id);
  if (!user || !user.is_active) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return user;
}

function endShift(userId: number) {
  db.prepare("UPDATE users SET shift_started_at = NULL, current_plate = NULL, shift_status = 'OFF_SHIFT' WHERE id = ?").run(userId);
}

function audit(osId: number | null, actor: PublicUser, action: string, details: Row = {}) {
  db.prepare("INSERT INTO audit_log (os_id, actor_id, actor_role, action, details) VALUES (?, ?, ?, ?, ?)").run(
    osId,
    actor.id,
    actor.role,
    action,
    JSON.stringify(details)
  );
}

// ---------------------------------------------------------------------------
// WebSocket: conexões e avisos
// ---------------------------------------------------------------------------

interface SocketClient {
  ws: WebSocket;
  role: Role;
  token: string;
  alive: boolean;
}

const sockets = new Map<number, Set<SocketClient>>();

function sendTo(client: SocketClient, msg: WsMessage) {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  try {
    client.ws.send(JSON.stringify(msg));
  } catch (err) {
    console.error("[ws] Falha ao enviar mensagem", err);
  }
}

function notifyUser(userId: number | null | undefined, msg: WsMessage) {
  if (!userId) return;
  sockets.get(Number(userId))?.forEach((client) => sendTo(client, msg));
}

function notifyRole(role: Role, msg: WsMessage) {
  for (const set of sockets.values()) {
    set.forEach((client) => {
      if (client.role === role) sendTo(client, msg);
    });
  }
}

/** Avisa todos os admins e gestores conectados. */
function notifyStaff(msg: WsMessage) {
  notifyRole("admin", msg);
  notifyRole("gestor", msg);
}

/** Derruba as sessões do usuário (menos `exceptToken`) e fecha os WebSockets delas. */
function revokeUser(userId: number, options: { exceptToken?: string; message?: string } = {}) {
  const { exceptToken, message = "Sua sessão foi encerrada. Entre novamente." } = options;
  if (exceptToken) db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, exceptToken);
  else db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

  const set = sockets.get(userId);
  if (!set) return;
  for (const client of [...set]) {
    if (exceptToken && client.token === exceptToken) continue;
    sendTo(client, { type: "SESSION_REVOKED", title: "Sessão encerrada", message });
    try {
      client.ws.close(4401, "Sessão encerrada");
    } catch {}
    set.delete(client);
  }
  if (set.size === 0) sockets.delete(userId);
}

function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });
  wss.on("error", (err) => console.error("[ws] Erro no servidor WebSocket", err));

  wss.on("connection", (ws, req) => {
    ws.on("error", (err) => console.error("[ws] Erro na conexão", err));
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const token = url.searchParams.get("token") || "";
      const user = resolveSession(token);
      if (!user) {
        ws.close(4401, "Sessão inválida");
        return;
      }
      const client: SocketClient = { ws, role: user.role, token, alive: true };
      const userId = Number(user.id);
      if (!sockets.has(userId)) sockets.set(userId, new Set());
      sockets.get(userId)!.add(client);

      ws.on("pong", () => {
        client.alive = true;
      });
      ws.on("close", () => {
        const set = sockets.get(userId);
        if (!set) return;
        set.delete(client);
        if (set.size === 0) sockets.delete(userId);
      });
    } catch (err) {
      console.error("[ws] Falha ao aceitar conexão", err);
      try {
        ws.close(1011, "Erro interno");
      } catch {}
    }
  });

  const heartbeat = setInterval(() => {
    for (const [userId, set] of sockets) {
      for (const client of [...set]) {
        try {
          if (!client.alive) {
            client.ws.terminate();
            set.delete(client);
            continue;
          }
          if (!resolveSession(client.token)) {
            client.ws.close(4401, "Sessão expirada");
            set.delete(client);
            continue;
          }
          client.alive = false;
          client.ws.ping();
        } catch (err) {
          console.error("[ws] Falha no ping", err);
          set.delete(client);
        }
      }
      if (set.size === 0) sockets.delete(userId);
    }
  }, 30_000);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));
  return wss;
}

// ---------------------------------------------------------------------------
// OS: consultas e regras compartilhadas
// ---------------------------------------------------------------------------

const OS_SELECT = `
  SELECT so.*, u.name AS driver_name, u.is_active AS driver_is_active
  FROM service_orders so
  LEFT JOIN users u ON u.id = so.driver_id
`;

const REQUEST_SELECT = `
  SELECT rr.*, so.os_number,
    rq.name AS requested_by_name, nd.name AS new_driver_name,
    cd.name AS current_driver_name, mg.name AS manager_name
  FROM reassignment_requests rr
  LEFT JOIN service_orders so ON so.id = rr.os_id
  LEFT JOIN users rq ON rq.id = rr.requested_by_user_id
  LEFT JOIN users nd ON nd.id = rr.new_driver_id
  LEFT JOIN users cd ON cd.id = rr.current_driver_id
  LEFT JOIN users mg ON mg.id = rr.manager_user_id
`;

function formatOS(row: Row): Row {
  return {
    ...row,
    reassignment_count: Number(row.reassignment_count ?? 0),
    has_pickup: !!row.has_pickup,
    has_delivery: !!row.has_delivery,
    driver_is_active: !!row.driver_is_active,
  };
}

function getOSRow(id: number): Row | undefined {
  return db.prepare(`${OS_SELECT} WHERE so.id = ?`).get(id) as Row | undefined;
}

function getOSOr404(idParam: unknown): Row {
  const id = toId(idParam);
  const row = id ? getOSRow(id) : undefined;
  if (!row) fail(404, "OS não encontrada.");
  return row;
}

function hasPendingRequest(osId: number): boolean {
  return !!db.prepare("SELECT id FROM reassignment_requests WHERE os_id = ? AND status = 'PENDENTE'").get(osId);
}

/** Cancela pedidos de realocação pendentes (usar dentro de transação). */
function cancelPendingRequests(osId: number, actor: PublicUser, note: string): number {
  const changes = db
    .prepare(
      "UPDATE reassignment_requests SET status = 'CANCELADO', manager_user_id = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE os_id = ? AND status = 'PENDENTE'"
    )
    .run(actor.id, note, osId).changes;
  if (changes > 0) audit(osId, actor, "REALLOCATION_CANCELLED", { reason: note });
  return changes;
}

/** Troca o motorista da OS (usar dentro de transação). */
function applyDriverChange(osId: number, newDriverId: number) {
  db.prepare(
    "UPDATE service_orders SET driver_id = ?, last_reassigned_at = CURRENT_TIMESTAMP, reassignment_count = COALESCE(reassignment_count, 0) + 1 WHERE id = ?"
  ).run(newDriverId, osId);
}

function notifyNewOS(os: Row, driverId: number) {
  notifyUser(driverId, {
    type: "NEW_OS",
    os_id: os.id,
    os_number: os.os_number,
    title: "Nova OS atribuída",
    message: `Você recebeu a OS ${os.os_number}: ${os.origin} → ${os.destination}.`,
  });
}

function notifyDriverChange(os: Row, oldDriverId: number | null, newDriverId: number) {
  if (oldDriverId && oldDriverId !== newDriverId) {
    notifyUser(oldDriverId, {
      type: "DATA_CHANGED",
      os_id: os.id,
      title: "OS retirada",
      message: `A OS ${os.os_number} foi passada para outro motorista.`,
    });
  }
  notifyNewOS(os, newDriverId);
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------

const loginFailures = new Map<string, { count: number; first: number }>();

function isLoginBlocked(key: string): boolean {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || now - entry.first > LOGIN_WINDOW_MS) loginFailures.set(key, { count: 1, first: now });
  else entry.count++;
}

/** O Master é um admin que também tem todos os poderes do gestor. */
function actsAsGestor(user: PublicUser): boolean {
  return user.role === "gestor" || user.is_master;
}

function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    const allowed =
      !!user && (roles.includes(user.role) || (user.is_master && (roles.includes("admin") || roles.includes("gestor"))));
    if (!allowed) fail(403, "Você não tem permissão para fazer isso.");
    next();
  };
}

const MASTER_ONLY_MESSAGE = "A conta Master só pode ser alterada pelo próprio Master.";

const PASSWORD_CHANGE_ALLOWED = new Set(["GET /api/me", "POST /api/me/password", "POST /api/logout"]);

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // CORS (o front na Vercel chama a API no Railway com token no header)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "2mb" }));

  // ---------------- Público ----------------

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/login", (req, res) => {
    const { email: rawEmail, password } = getBody(req);
    if (typeof rawEmail !== "string" || typeof password !== "string" || !rawEmail.trim() || !password) {
      fail(400, "Informe e-mail e senha.");
    }
    const email = rawEmail.trim().toLowerCase();
    const key = `${req.ip}|${email}`;
    if (isLoginBlocked(key)) {
      fail(429, "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.", "TOO_MANY_ATTEMPTS");
    }

    const candidates = db.prepare("SELECT * FROM users WHERE lower(email) = ? ORDER BY id").all(email) as Row[];
    let user: Row | undefined;
    if (candidates.length === 0) verifyPassword(password, DUMMY_HASH);
    for (const candidate of candidates) {
      if (verifyPassword(password, candidate.password)) {
        user = candidate;
        break;
      }
    }
    if (!user) {
      recordLoginFailure(key);
      fail(401, "E-mail ou senha incorretos.", "INVALID_CREDENTIALS");
    }
    loginFailures.delete(key);
    if (!user.is_active) fail(403, "Usuário desativado", "USER_INACTIVE");

    const token = createSession(user.id);
    res.json({ token, user: publicUser(user) });
  });

  // ---------------- Autenticação ----------------

  app.use("/api", (req, _res, next) => {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) fail(401, "Faça login para continuar.", "UNAUTHORIZED");
    const user = resolveSession(match[1]);
    if (!user) fail(401, "Sua sessão expirou. Entre novamente.", "UNAUTHORIZED");
    req.user = publicUser(user);
    req.sessionToken = match[1];

    if (req.user.must_change_password) {
      const route = `${req.method} ${(req.baseUrl + req.path).replace(/\/+$/, "")}`;
      if (!PASSWORD_CHANGE_ALLOWED.has(route)) {
        fail(403, "Troque sua senha provisória para continuar.", "PASSWORD_CHANGE_REQUIRED");
      }
    }
    next();
  });

  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(req.sessionToken);
    res.json({ success: true });
  });

  app.get("/api/me", (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/me/password", (req, res) => {
    const me = req.user!;
    const { current_password, new_password } = getBody(req);
    const row = getUserRow(me.id)!;
    if (!verifyPassword(current_password, row.password)) fail(400, "Senha atual incorreta.", "WRONG_PASSWORD");
    const next = checkNewPassword(new_password, "A nova senha");
    if (next === current_password) fail(400, "A nova senha precisa ser diferente da atual.");

    db.transaction(() => {
      db.prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(next), me.id);
      audit(null, me, "PASSWORD_CHANGED", { user_id: me.id });
    })();
    revokeUser(me.id, { exceptToken: req.sessionToken, message: "Sua senha foi alterada. Entre novamente." });
    notifyStaff({ type: "DATA_CHANGED" });
    res.json({ user: publicUser(getUserRow(me.id)!) });
  });

  // ---------------- Usuários ----------------

  app.get("/api/users", requireRole("admin", "gestor"), (_req, res) => {
    const rows = db.prepare("SELECT * FROM users ORDER BY is_active DESC, name COLLATE NOCASE").all() as Row[];
    res.json(rows.map(publicUser));
  });

  app.post("/api/users", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const b = getBody(req);
    const role = b.role === undefined || b.role === null || b.role === "" ? "driver" : b.role;
    if (!ROLES.includes(role)) fail(400, "Papel inválido.");
    if (actor.role === "gestor" && role !== "driver") fail(403, "O gestor só pode cadastrar motoristas.");

    const name = optText(b.name, "Nome", 120);
    const email = normalizeEmail(b.email);
    if (!name || !email || typeof b.password !== "string" || !b.password) {
      fail(400, "Preencha nome, e-mail e senha provisória.");
    }
    if (!isValidEmail(email)) fail(400, "E-mail inválido.");
    const password = checkNewPassword(b.password, "A senha provisória");
    const cpf = normalizeCpf(b.cpf) ?? null;
    ensureUniqueEmail(email);
    ensureUniqueCpf(cpf);

    const id = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO users (name, email, password, cpf, role, is_active, must_change_password, shift_status) VALUES (?, ?, ?, ?, ?, 1, 1, 'OFF_SHIFT')"
        )
        .run(name, email, hashPassword(password), cpf, role);
      const newId = Number(info.lastInsertRowid);
      audit(null, actor, "USER_CREATED", { user_id: newId, name, email, role });
      return newId;
    })();

    notifyStaff({ type: "DATA_CHANGED" });
    res.status(201).json({ success: true, user: publicUser(getUserRow(id)!) });
  });

  app.patch("/api/users/:id", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const target = getUserOr404(req.params.id);
    const isSelf = target.id === actor.id;
    if (actor.role === "gestor" && target.role !== "driver") fail(403, "O gestor só pode alterar motoristas.");
    if (target.is_master && !isSelf) fail(403, MASTER_ONLY_MESSAGE);
    const b = getBody(req);
    const changes: Row = {};

    if (b.name !== undefined) {
      const name = optText(b.name, "Nome", 120);
      if (!name) fail(400, "Informe o nome.");
      if (name !== target.name) changes.name = name;
    }
    if (b.email !== undefined) {
      const email = normalizeEmail(b.email);
      if (!email || !isValidEmail(email)) fail(400, "E-mail inválido.");
      if (email !== String(target.email ?? "").trim().toLowerCase()) {
        if (target.is_master) fail(400, "O e-mail do Master é definido pela variável MASTER_EMAIL no Railway.");
        ensureUniqueEmail(email, target.id);
        changes.email = email;
      }
    }
    if (b.cpf !== undefined) {
      const cpf = normalizeCpf(b.cpf) ?? null;
      const current = onlyDigits(target.cpf) || null;
      if (cpf !== current) {
        ensureUniqueCpf(cpf, target.id);
        changes.cpf = cpf;
      }
    }
    if (b.role !== undefined && b.role !== target.role) {
      if (!ROLES.includes(b.role)) fail(400, "Papel inválido.");
      if (actor.role !== "admin") fail(403, "Só o administrador pode mudar o papel.");
      if (isSelf) fail(400, "Você não pode mudar o seu próprio papel.");
      changes.role = b.role;
    }
    if (b.is_active !== undefined) {
      const active = parseBool(b.is_active);
      if (active === null) fail(400, "Valor inválido para ativo/inativo.");
      if (active !== !!target.is_active) {
        if (!active && isSelf) fail(400, "Você não pode desativar a sua própria conta.");
        changes.is_active = active ? 1 : 0;
      }
    }

    const losingRole = changes.is_active === 0 || changes.role !== undefined;
    if (losingRole && target.is_active && (target.role === "admin" || target.role === "gestor")) {
      const others = (
        db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = ? AND is_active = 1 AND id != ?").get(target.role, target.id) as Row
      ).n;
      if (others === 0) {
        fail(409, target.role === "admin" ? "É preciso ter pelo menos um administrador ativo." : "É preciso ter pelo menos um gestor ativo.");
      }
    }

    const fields = Object.keys(changes);
    if (fields.length === 0) return res.json({ success: true, user: publicUser(target) });

    const endsShift = !!target.shift_started_at && (changes.is_active === 0 || (changes.role && target.role === "driver"));
    db.transaction(() => {
      db.prepare(`UPDATE users SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`).run(
        ...fields.map((f) => changes[f]),
        target.id
      );
      if (endsShift) {
        endShift(target.id);
        audit(null, actor, "SHIFT_ENDED_BY_STAFF", { user_id: target.id, name: target.name, started_at: target.shift_started_at });
      }
      const diff: Row = {};
      for (const f of fields) {
        diff[f] = f === "is_active" ? { from: !!target.is_active, to: !!changes.is_active } : { from: target[f] ?? null, to: changes[f] };
      }
      audit(null, actor, "USER_UPDATED", { user_id: target.id, name: target.name, changes: diff });
    })();

    if (changes.is_active === 0) {
      revokeUser(target.id, { message: "Seu acesso foi desativado. Fale com o administrador." });
    } else if (changes.email !== undefined || changes.role !== undefined) {
      revokeUser(target.id, {
        exceptToken: isSelf ? req.sessionToken : undefined,
        message: "Seus dados de acesso mudaram. Entre novamente.",
      });
    } else {
      notifyUser(target.id, { type: "DATA_CHANGED" });
    }
    notifyStaff({ type: "DATA_CHANGED" });
    res.json({ success: true, user: publicUser(getUserRow(target.id)!) });
  });

  app.post("/api/users/:id/reset-password", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const target = getUserOr404(req.params.id);
    if (target.id === actor.id) fail(400, 'Para trocar a sua própria senha, use "Alterar senha".');
    if (actor.role === "gestor" && target.role !== "driver") fail(403, "O gestor só pode resetar a senha de motoristas.");
    if (target.is_master) fail(403, MASTER_ONLY_MESSAGE);
    const temp = checkNewPassword(getBody(req).temp_password, "A senha provisória");

    db.transaction(() => {
      db.prepare("UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?").run(hashPassword(temp), target.id);
      audit(null, actor, "PASSWORD_RESET", { user_id: target.id, name: target.name });
    })();
    revokeUser(target.id, { message: "Sua senha foi redefinida. Entre com a senha provisória." });
    notifyStaff({ type: "DATA_CHANGED" });
    res.json({ success: true, user: publicUser(getUserRow(target.id)!) });
  });

  app.post("/api/users/:id/end-shift", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const target = getUserOr404(req.params.id);
    if (!target.shift_started_at) return res.json({ success: true, already: true, user: publicUser(target) });

    db.transaction(() => {
      endShift(target.id);
      audit(null, actor, "SHIFT_ENDED_BY_STAFF", {
        user_id: target.id,
        name: target.name,
        started_at: target.shift_started_at,
        vehicle_plate: target.current_plate,
      });
    })();
    notifyUser(target.id, { type: "DATA_CHANGED", title: "Turno encerrado", message: "Seu turno foi encerrado pela equipe." });
    notifyStaff({ type: "DATA_CHANGED" });
    res.json({ success: true, user: publicUser(getUserRow(target.id)!) });
  });

  // ---------------- Turno do motorista ----------------

  app.post("/api/shift/start", requireRole("driver"), (req, res) => {
    const me = req.user!;
    if (me.shift_started_at) return res.json({ success: true, already: true, user: me });

    const b = getBody(req);
    const plate = optPlate(b.vehicle_plate, "Placa do cavalo");
    if (!plate) fail(400, "Informe a placa do cavalo.");
    const raw = b.items;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(400, "Responda o checklist do veículo.");
    const items: Row = {};
    for (const key of VEHICLE_ITEMS) {
      if (typeof raw[key] !== "boolean") fail(400, "Marque OK ou Problema em todos os itens do checklist.");
      items[key] = raw[key];
    }
    const note = optText(raw.observacao, "Observação", 1000);
    if (note) items.observacao = note;

    const checklistId = db.transaction(() => {
      const info = db
        .prepare("INSERT INTO checklists (driver_id, vehicle_plate, type, os_id, items) VALUES (?, ?, 'VEHICLE', NULL, ?)")
        .run(me.id, plate, JSON.stringify(items));
      db.prepare("UPDATE users SET current_plate = ?, shift_started_at = ?, shift_status = 'ON_SHIFT' WHERE id = ?").run(
        plate,
        new Date().toISOString(),
        me.id
      );
      const id = Number(info.lastInsertRowid);
      audit(null, me, "SHIFT_STARTED", {
        vehicle_plate: plate,
        checklist_id: id,
        problems: VEHICLE_ITEMS.filter((k) => !items[k]),
      });
      return id;
    })();

    notifyStaff({ type: "DATA_CHANGED" });
    notifyUser(me.id, { type: "DATA_CHANGED" });
    res.json({ success: true, checklist_id: checklistId, user: publicUser(getUserRow(me.id)!) });
  });

  app.post("/api/shift/end", requireRole("driver"), (req, res) => {
    const me = req.user!;
    if (!me.shift_started_at) return res.json({ success: true, already: true, user: me });
    db.transaction(() => {
      endShift(me.id);
      audit(null, me, "SHIFT_ENDED", { started_at: me.shift_started_at, vehicle_plate: me.current_plate });
    })();
    notifyStaff({ type: "DATA_CHANGED" });
    notifyUser(me.id, { type: "DATA_CHANGED" });
    res.json({ success: true, user: publicUser(getUserRow(me.id)!) });
  });

  // ---------------- Ordens de serviço ----------------

  app.get("/api/os", (req, res) => {
    const me = req.user!;
    const where: string[] = [];
    const params: unknown[] = [];
    if (me.role === "driver") {
      where.push("so.driver_id = ?");
      params.push(me.id);
    }
    if (typeof req.query.status === "string" && req.query.status.trim()) {
      where.push("so.status = ?");
      params.push(req.query.status.trim().toUpperCase());
    }
    const sql = `${OS_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY so.created_at DESC, so.id DESC`;
    res.json((db.prepare(sql).all(...params) as Row[]).map(formatOS));
  });

  app.get("/api/os/:id", (req, res) => {
    const me = req.user!;
    const os = getOSOr404(req.params.id);
    if (me.role === "driver" && Number(os.driver_id) !== me.id) {
      fail(403, "Esta OS não está mais com você.", "NOT_YOUR_OS");
    }

    const events = db.prepare("SELECT * FROM os_events WHERE os_id = ? ORDER BY id").all(os.id);
    const checklists = (
      db
        .prepare(
          `SELECT c.*, u.name AS driver_name, so.os_number
           FROM checklists c
           LEFT JOIN users u ON u.id = c.driver_id
           LEFT JOIN service_orders so ON so.id = c.os_id
           WHERE c.os_id = ? ORDER BY c.id`
        )
        .all(os.id) as Row[]
    ).map((c) => ({ ...c, items: parseItems(c.items) }));
    const pending_request = db.prepare(`${REQUEST_SELECT} WHERE rr.os_id = ? AND rr.status = 'PENDENTE' ORDER BY rr.id DESC LIMIT 1`).get(os.id) ?? null;
    const last_decision =
      db
        .prepare(
          `${REQUEST_SELECT} WHERE rr.os_id = ? AND rr.status != 'PENDENTE' ORDER BY COALESCE(rr.decided_at, rr.created_at) DESC, rr.id DESC LIMIT 1`
        )
        .get(os.id) ?? null;

    const result: Row = { ...formatOS(os), events, checklists, pending_request, last_decision };
    if (me.role === "admin" || me.role === "gestor") {
      result.audit = db
        .prepare(
          `SELECT al.*, u.name AS actor_name FROM audit_log al
           LEFT JOIN users u ON u.id = al.actor_id
           WHERE al.os_id = ? ORDER BY al.created_at DESC, al.id DESC`
        )
        .all(os.id);
    }
    res.json(result);
  });

  app.post("/api/os", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const b = getBody(req);
    const osNumber = optText(b.os_number, "Número da OS", 50);
    const origin = optText(b.origin, "Origem");
    const destination = optText(b.destination, "Destino");
    const driverId = toId(b.driver_id);
    if (!osNumber || !origin || !destination || !driverId) {
      fail(400, "Preencha número da OS, motorista, origem e destino.");
    }
    const driver = getActiveDriver(driverId);
    if (!driver) fail(400, "Escolha um motorista ativo.");

    const values = {
      plate: optPlate(b.plate, "Placa") ?? null,
      scheduled_date: optDate(b.scheduled_date) ?? todayInManaus(),
      os_start_time: optTime(b.os_start_time, "Início previsto") ?? null,
      os_end_time: optTime(b.os_end_time, "Fim previsto") ?? null,
      admin_note: optText(b.admin_note, "Observação", 2000) ?? null,
      distance_km: optAmount(b.distance_km) ?? null,
      haulage_cost: optAmount(b.haulage_cost) ?? null,
    };
    if (db.prepare("SELECT id FROM service_orders WHERE os_number = ?").get(osNumber)) {
      fail(409, "Já existe uma OS com esse número.");
    }

    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO service_orders (
            os_number, driver_id, motorista_original_id, plate, origin, destination, status,
            scheduled_date, os_start_time, os_end_time, admin_note, distance_km, haulage_cost,
            reassignment_count, has_pickup, has_delivery
          ) VALUES (?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?, ?, ?, ?, 0, 0, 0)`
        )
        .run(
          osNumber,
          driverId,
          driverId,
          values.plate,
          origin,
          destination,
          values.scheduled_date,
          values.os_start_time,
          values.os_end_time,
          values.admin_note,
          values.distance_km,
          values.haulage_cost
        );
      const newId = Number(info.lastInsertRowid);
      audit(newId, actor, "OS_CREATED", {
        os_number: osNumber,
        driver_id: driverId,
        driver_name: driver.name,
        origin,
        destination,
        ...values,
      });
      return newId;
    })();

    const os = getOSRow(id)!;
    notifyNewOS(os, driverId);
    notifyStaff({ type: "DATA_CHANGED", os_id: id });
    res.status(201).json({ success: true, id, os: formatOS(os) });
  });

  app.patch("/api/os/:id", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const os = getOSOr404(req.params.id);
    const b = getBody(req);
    const isClosed = os.status === "FECHADA" || os.status === "CANCELADA";

    // Campos simples
    const fields: Row = {};
    const requiredText = (key: string, label: string, emptyMessage: string, max?: number) => {
      const value = optText(b[key], label, max);
      if (value === undefined) return;
      if (!value) fail(400, emptyMessage);
      fields[key] = value;
    };
    requiredText("os_number", "Número da OS", "Informe o número da OS.", 50);
    requiredText("origin", "Origem", "Informe a origem.");
    requiredText("destination", "Destino", "Informe o destino.");
    if (b.scheduled_date !== undefined) {
      const date = optDate(b.scheduled_date);
      if (!date) fail(400, "Informe a data da OS.");
      fields.scheduled_date = date;
    }
    const optional: [string, () => unknown][] = [
      ["plate", () => optPlate(b.plate, "Placa")],
      ["os_start_time", () => optTime(b.os_start_time, "Início previsto")],
      ["os_end_time", () => optTime(b.os_end_time, "Fim previsto")],
      ["route_start_time", () => optTime(b.route_start_time, "Início realizado")],
      ["route_end_time", () => optTime(b.route_end_time, "Fim realizado")],
      ["admin_note", () => optText(b.admin_note, "Observação", 2000)],
      ["distance_km", () => optAmount(b.distance_km)],
      ["haulage_cost", () => optAmount(b.haulage_cost)],
    ];
    for (const [key, parse] of optional) {
      const value = parse();
      if (value !== undefined) fields[key] = value;
    }

    const diff: Row = {};
    for (const [key, value] of Object.entries(fields)) {
      if ((os[key] ?? null) !== value) diff[key] = { from: os[key] ?? null, to: value };
    }
    if (diff.os_number && db.prepare("SELECT id FROM service_orders WHERE os_number = ? AND id != ?").get(fields.os_number, os.id)) {
      fail(409, "Já existe uma OS com esse número.");
    }

    // Cancelamento
    let cancel = false;
    if (b.status !== undefined && b.status !== os.status) {
      if (b.status !== "CANCELADA") fail(400, "Status inválido.");
      if (!actsAsGestor(actor)) fail(403, "Só o gestor pode cancelar uma OS.");
      if (os.status === "FECHADA") fail(409, "Esta OS já foi finalizada e não pode ser cancelada.");
      cancel = true;
    }

    // Troca de motorista
    const oldDriverId = os.driver_id == null ? null : Number(os.driver_id);
    let newDriver: Row | undefined;
    if (b.driver_id !== undefined && b.driver_id !== null && b.driver_id !== "" && Number(b.driver_id) !== oldDriverId) {
      if (cancel) fail(400, "Cancele a OS sem trocar o motorista.");
      if (isClosed) fail(409, "Não é possível trocar o motorista de uma OS finalizada ou cancelada.");
      if (!actsAsGestor(actor) && (os.status !== "ABERTA" || hasPendingRequest(os.id))) {
        fail(409, 'Esta OS já começou ou tem um pedido pendente. Use "Realocar".');
      }
      newDriver = getActiveDriver(toId(b.driver_id));
      if (!newDriver) fail(400, "Escolha um motorista ativo.");
    }

    const hasAnyField = Object.keys(fields).length > 0 || b.status !== undefined || b.driver_id !== undefined;
    if (!hasAnyField) fail(400, "Nada para atualizar.");
    const diffKeys = Object.keys(diff);
    if (diffKeys.length === 0 && !cancel && !newDriver) {
      return res.json({ success: true, unchanged: true, os: formatOS(os) });
    }

    db.transaction(() => {
      if (diffKeys.length > 0) {
        db.prepare(`UPDATE service_orders SET ${diffKeys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
          ...diffKeys.map((k) => fields[k]),
          os.id
        );
        audit(os.id, actor, "OS_UPDATED", { changes: diff });
      }
      if (newDriver) {
        cancelPendingRequests(os.id, actor, "Motorista trocado pelo gestor.");
        applyDriverChange(os.id, newDriver.id);
        audit(os.id, actor, "DRIVER_CHANGED", {
          from: oldDriverId,
          from_name: os.driver_name ?? null,
          to: newDriver.id,
          to_name: newDriver.name,
        });
      }
      if (cancel) {
        db.prepare("UPDATE service_orders SET status = 'CANCELADA' WHERE id = ?").run(os.id);
        cancelPendingRequests(os.id, actor, "OS cancelada.");
        audit(os.id, actor, "OS_CANCELLED", { previous_status: os.status });
      }
    })();

    const updated = getOSRow(os.id)!;
    if (newDriver) {
      notifyDriverChange(updated, oldDriverId, newDriver.id);
    } else if (cancel) {
      notifyUser(oldDriverId, {
        type: "DATA_CHANGED",
        os_id: os.id,
        title: "OS cancelada",
        message: `A OS ${updated.os_number} foi cancelada.`,
      });
    } else {
      const relevant = ["os_number", "origin", "destination", "scheduled_date", "os_start_time", "os_end_time", "admin_note", "plate"];
      const notice = !isClosed && diffKeys.some((k) => relevant.includes(k));
      notifyUser(
        oldDriverId,
        notice
          ? { type: "DATA_CHANGED", os_id: os.id, title: "OS atualizada", message: `A OS ${updated.os_number} foi atualizada.` }
          : { type: "DATA_CHANGED", os_id: os.id }
      );
    }
    notifyStaff({ type: "DATA_CHANGED", os_id: os.id });
    res.json({ success: true, os: formatOS(updated) });
  });

  app.delete("/api/os/:id", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const os = getOSOr404(req.params.id);
    const events = (db.prepare("SELECT COUNT(*) AS n FROM os_events WHERE os_id = ?").get(os.id) as Row).n;
    if (os.status !== "ABERTA" || events > 0) fail(409, 'Esta OS já tem movimentação. Use "Cancelar".');

    db.transaction(() => {
      db.prepare("DELETE FROM reassignment_requests WHERE os_id = ?").run(os.id);
      db.prepare("DELETE FROM checklists WHERE os_id = ?").run(os.id);
      db.prepare("DELETE FROM audit_log WHERE os_id = ?").run(os.id);
      db.prepare("DELETE FROM service_orders WHERE id = ?").run(os.id);
      audit(null, actor, "OS_DELETED", { os_id: os.id, os_number: os.os_number, driver_id: os.driver_id });
    })();

    notifyUser(os.driver_id, {
      type: "DATA_CHANGED",
      os_id: os.id,
      title: "OS removida",
      message: `A OS ${os.os_number} foi removida.`,
    });
    notifyStaff({ type: "DATA_CHANGED", os_id: os.id });
    res.json({ success: true });
  });

  app.post("/api/os/:id/event", requireRole("driver"), (req, res) => {
    const me = req.user!;
    const os = getOSOr404(req.params.id);
    if (Number(os.driver_id) !== me.id) fail(403, "Esta OS não está mais com você.", "NOT_YOUR_OS");
    const b = getBody(req);
    const type = b.type;
    if (type !== "COLETA" && type !== "ENTREGA") fail(400, "Tipo de evento inválido.");

    if (type === "COLETA") {
      if ((os.status === "EM_ROTA" || os.status === "FECHADA") && os.has_pickup) {
        return res.json({ success: true, duplicate: true });
      }
      if (os.status === "CANCELADA") fail(409, "Esta OS foi cancelada.");
      if (os.status !== "ABERTA") fail(409, "Esta OS não pode ser iniciada agora.");
    } else {
      if (os.status === "FECHADA") return res.json({ success: true, duplicate: true });
      if (os.status === "CANCELADA") fail(409, "Esta OS foi cancelada.");
      if (os.status !== "EM_ROTA") fail(409, "Inicie a viagem antes de finalizar.");
    }

    const localTime = normalizeLocalTime(b.local_time);
    const hhmm = localTime.slice(11, 16);
    const observation = optText(b.observation, "Observação", 2000) ?? null;

    if (type === "COLETA") {
      const plate = optPlate(b.plate, "Placa da carreta");
      if (!plate) fail(400, "Informe a placa da carreta.");
      const trailerState = b.trailer_state;
      if (trailerState !== "CHEIA" && trailerState !== "VAZIA") fail(400, "Informe se a carreta está cheia ou vazia.");

      db.transaction(() => {
        db.prepare(
          "INSERT INTO os_events (os_id, type, local_time, observation, plate, trailer_state) VALUES (?, 'COLETA', ?, ?, ?, ?)"
        ).run(os.id, localTime, observation, plate, trailerState);
        db.prepare(
          "UPDATE service_orders SET status = 'EM_ROTA', has_pickup = 1, route_start_time = ?, plate = ?, truck_plate = ? WHERE id = ?"
        ).run(hhmm, plate, me.current_plate, os.id);
        db.prepare("INSERT INTO checklists (driver_id, vehicle_plate, type, os_id, items) VALUES (?, ?, 'CONTAINER', ?, ?)").run(
          me.id,
          plate,
          os.id,
          JSON.stringify({ estado_carreta: trailerState })
        );
        audit(os.id, me, "PICKUP_RECORDED", {
          local_time: localTime,
          plate,
          truck_plate: me.current_plate,
          trailer_state: trailerState,
        });
      })();
    } else {
      db.transaction(() => {
        db.prepare("INSERT INTO os_events (os_id, type, local_time, observation) VALUES (?, 'ENTREGA', ?, ?)").run(
          os.id,
          localTime,
          observation
        );
        db.prepare("UPDATE service_orders SET status = 'FECHADA', has_delivery = 1, route_end_time = ? WHERE id = ?").run(hhmm, os.id);
        cancelPendingRequests(os.id, me, "OS finalizada antes da decisão.");
        audit(os.id, me, "DELIVERY_RECORDED", { local_time: localTime, observation });
      })();
    }

    notifyStaff({ type: "DATA_CHANGED", os_id: os.id });
    notifyUser(me.id, { type: "DATA_CHANGED", os_id: os.id });
    res.json({ success: true, os: formatOS(getOSRow(os.id)!) });
  });

  // ---------------- Realocação ----------------

  app.post("/api/os/:id/reassign", requireRole("admin", "gestor"), (req, res) => {
    const actor = req.user!;
    const os = getOSOr404(req.params.id);
    if (os.status === "FECHADA" || os.status === "CANCELADA") {
      fail(409, "Não é possível realocar uma OS finalizada ou cancelada.");
    }
    const b = getBody(req);
    const newDriver = getActiveDriver(toId(b.new_driver_id));
    if (!newDriver) fail(400, "Escolha um motorista ativo.");
    const oldDriverId = os.driver_id == null ? null : Number(os.driver_id);
    if (newDriver.id === oldDriverId) fail(400, "Esse motorista já está com a OS.");
    const reason = optText(b.reason, "Motivo", 1000);
    if (!reason) fail(400, "Informe o motivo da realocação.");
    const details = { from: oldDriverId, from_name: os.driver_name ?? null, to: newDriver.id, to_name: newDriver.name, reason };

    if (!actsAsGestor(actor)) {
      if (hasPendingRequest(os.id)) fail(409, "Já existe um pedido de realocação pendente para esta OS.");
      const requestId = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO reassignment_requests (os_id, requested_by_user_id, requested_by_role, current_driver_id, new_driver_id, reason, status)
             VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE')`
          )
          .run(os.id, actor.id, actor.role, oldDriverId, newDriver.id, reason);
        const id = Number(info.lastInsertRowid);
        audit(os.id, actor, "REALLOCATION_REQUESTED", { request_id: id, ...details });
        return id;
      })();
      notifyRole("gestor", {
        type: "DATA_CHANGED",
        os_id: os.id,
        title: "Pedido de realocação",
        message: `A OS ${os.os_number} aguarda sua aprovação.`,
      });
      notifyRole("admin", { type: "DATA_CHANGED", os_id: os.id });
      return res.json({ success: true, pending: true, request_id: requestId });
    }

    // Gestor: aplica na hora
    const requestId = db.transaction(() => {
      cancelPendingRequests(os.id, actor, "Substituído por realocação direta do gestor.");
      const info = db
        .prepare(
          `INSERT INTO reassignment_requests (os_id, requested_by_user_id, requested_by_role, current_driver_id, new_driver_id, reason,
             status, manager_user_id, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, 'APROVADO', ?, CURRENT_TIMESTAMP)`
        )
        .run(os.id, actor.id, actor.role, oldDriverId, newDriver.id, reason, actor.id);
      const id = Number(info.lastInsertRowid);
      applyDriverChange(os.id, newDriver.id);
      audit(os.id, actor, "REALLOCATION_APPROVED", { request_id: id, direct: true, ...details });
      return id;
    })();
    notifyDriverChange(getOSRow(os.id)!, oldDriverId, newDriver.id);
    notifyStaff({ type: "DATA_CHANGED", os_id: os.id });
    res.json({ success: true, applied: true, request_id: requestId });
  });

  app.get("/api/reassign/pending", requireRole("admin", "gestor"), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT rr.*, so.os_number, so.origin, so.destination, so.status AS os_status,
           rq.name AS requested_by_name, nd.name AS new_driver_name, cd.name AS current_driver_name
         FROM reassignment_requests rr
         LEFT JOIN service_orders so ON so.id = rr.os_id
         LEFT JOIN users rq ON rq.id = rr.requested_by_user_id
         LEFT JOIN users nd ON nd.id = rr.new_driver_id
         LEFT JOIN users cd ON cd.id = rr.current_driver_id
         WHERE rr.status = 'PENDENTE'
         ORDER BY rr.created_at DESC, rr.id DESC`
      )
      .all();
    res.json(rows);
  });

  app.post("/api/reassign/:id/decide", requireRole("gestor"), (req, res) => {
    const actor = req.user!;
    const requestId = toId(req.params.id);
    const request = requestId
      ? (db.prepare("SELECT * FROM reassignment_requests WHERE id = ?").get(requestId) as Row | undefined)
      : undefined;
    if (!request) fail(404, "Pedido de realocação não encontrado.");
    const b = getBody(req);
    const status = b.status;
    if (status !== "APROVADO" && status !== "REPROVADO") fail(400, "Decisão inválida. Use APROVADO ou REPROVADO.");
    if (request.status !== "PENDENTE") fail(409, "Este pedido já foi decidido.");
    const note = optText(b.decision_note, "Observação", 1000) ?? null;

    const os = getOSRow(request.os_id);
    let newDriver: Row | undefined;
    if (status === "APROVADO") {
      if (!os || os.status === "FECHADA" || os.status === "CANCELADA") fail(409, "A OS já foi finalizada ou cancelada.");
      newDriver = getActiveDriver(Number(request.new_driver_id));
      if (!newDriver) fail(409, "O motorista escolhido está desativado.");
      if (Number(os.driver_id) !== Number(request.current_driver_id)) {
        fail(409, "O motorista da OS mudou desde o pedido. Peça uma nova realocação.");
      }
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE reassignment_requests SET status = ?, manager_user_id = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(status, actor.id, note, request.id);
      if (newDriver) applyDriverChange(request.os_id, newDriver.id);
      audit(request.os_id, actor, status === "APROVADO" ? "REALLOCATION_APPROVED" : "REALLOCATION_REJECTED", {
        request_id: request.id,
        from: request.current_driver_id,
        to: request.new_driver_id,
        to_name: newDriver?.name ?? null,
        note,
      });
    })();

    if (newDriver && os) notifyDriverChange(getOSRow(os.id)!, Number(request.current_driver_id), newDriver.id);
    notifyStaff({ type: "DATA_CHANGED", os_id: request.os_id });
    res.json({ success: true });
  });

  // ---------------- Checklists ----------------

  app.get("/api/checklists", (req, res) => {
    const me = req.user!;
    const where: string[] = [];
    const params: unknown[] = [];
    if (me.role === "driver") {
      where.push("c.driver_id = ?");
      params.push(me.id);
    } else if (req.query.driverId !== undefined && req.query.driverId !== "") {
      where.push("c.driver_id = ?");
      params.push(toId(req.query.driverId) ?? 0);
    }
    if (req.query.osId !== undefined && req.query.osId !== "") {
      where.push("c.os_id = ?");
      params.push(toId(req.query.osId) ?? 0);
    }
    if (req.query.type === "VEHICLE" || req.query.type === "CONTAINER") {
      where.push("c.type = ?");
      params.push(req.query.type);
    }
    const rows = db
      .prepare(
        `SELECT c.*, so.os_number, u.name AS driver_name
         FROM checklists c
         JOIN users u ON u.id = c.driver_id
         LEFT JOIN service_orders so ON so.id = c.os_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY c.created_at DESC, c.id DESC`
      )
      .all(...params) as Row[];
    res.json(rows.map((c) => ({ ...c, items: parseItems(c.items) })));
  });

  // ---------------- Painel ----------------

  app.get("/api/stats", requireRole("admin", "gestor"), (_req, res) => {
    const totals = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status = 'ABERTA' THEN 1 ELSE 0 END), 0) AS aberta,
           COALESCE(SUM(CASE WHEN status = 'EM_ROTA' THEN 1 ELSE 0 END), 0) AS em_rota,
           COALESCE(SUM(CASE WHEN status = 'FECHADA' THEN 1 ELSE 0 END), 0) AS fechada,
           COALESCE(SUM(CASE WHEN status = 'CANCELADA' THEN 1 ELSE 0 END), 0) AS cancelada,
           COALESCE(SUM(CASE WHEN COALESCE(status, '') != 'CANCELADA' THEN haulage_cost END), 0) AS total_haulage_cost,
           COALESCE(SUM(CASE WHEN COALESCE(status, '') != 'CANCELADA' THEN distance_km END), 0) AS total_distance_km
         FROM service_orders`
      )
      .get() as Row;
    const pending = (db.prepare("SELECT COUNT(*) AS n FROM reassignment_requests WHERE status = 'PENDENTE'").get() as Row).n;
    const onShift = (
      db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'driver' AND is_active = 1 AND shift_started_at IS NOT NULL")
        .get() as Row
    ).n;

    const today = todayInManaus();
    const first = addDays(today, -6);
    const perDay = new Map<string, Row>();
    for (const row of db
      .prepare(
        `SELECT scheduled_date AS date, COUNT(*) AS os, COALESCE(SUM(haulage_cost), 0) AS cost
         FROM service_orders
         WHERE scheduled_date BETWEEN ? AND ? AND COALESCE(status, '') != 'CANCELADA'
         GROUP BY scheduled_date`
      )
      .all(first, today) as Row[]) {
      perDay.set(row.date, row);
    }
    const by_day = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(first, i);
      const row = perDay.get(date);
      return {
        date,
        label: weekdayLabel(date),
        os: Number(row?.os ?? 0),
        cost: Math.round(Number(row?.cost ?? 0) * 100) / 100,
      };
    });

    const base = totals.total - totals.cancelada;
    res.json({
      total: totals.total,
      aberta: totals.aberta,
      em_rota: totals.em_rota,
      fechada: totals.fechada,
      cancelada: totals.cancelada,
      total_haulage_cost: Math.round(totals.total_haulage_cost * 100) / 100,
      total_distance_km: Math.round(totals.total_distance_km * 100) / 100,
      pending_approvals: pending,
      drivers_on_shift: onShift,
      completion_rate: base > 0 ? Math.round((totals.fechada / base) * 1000) / 10 : null,
      by_day,
    });
  });

  // Rota /api desconhecida → 404 em JSON (antes do SPA)
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota não encontrada.", code: "NOT_FOUND" });
  });

  // ---------------- Frontend ----------------

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve("dist");
    const indexFile = path.join(distDir, "index.html");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      if (!fs.existsSync(indexFile)) return res.status(404).send("Frontend não compilado. Rode npm run build.");
      res.sendFile(indexFile);
    });
  }

  // Erros sempre em JSON
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) {
      return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Os dados enviados estão em formato inválido." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Os dados enviados são grandes demais." });
    if (typeof err?.code === "string" && err.code.startsWith("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: "Esses dados já estão cadastrados." });
    }
    if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: "Requisição inválida." });
    }
    console.error(`[erro] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: "Erro interno no servidor. Tente de novo em instantes." });
  });

  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
  server.on("error", (err) => {
    console.error("[http] Falha no servidor", err);
    process.exit(1);
  });
  const wss = setupWebSocket(server);

  // Limpeza periódica: sessões vencidas e tentativas de login antigas
  const cleanup = () => {
    try {
      db.prepare("DELETE FROM sessions WHERE created_at < ?").run(new Date(Date.now() - SESSION_TTL_MS).toISOString());
      const now = Date.now();
      for (const [key, entry] of loginFailures) {
        if (now - entry.first > LOGIN_WINDOW_MS) loginFailures.delete(key);
      }
    } catch (err) {
      console.error("[limpeza] Falha", err);
    }
  };
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();

  const shutdown = (signal: string) => {
    console.log(`[http] ${signal} recebido, encerrando...`);
    try {
      wss.close();
      server.close();
      db.close();
    } catch {}
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  console.error("[processo] Promise rejeitada sem tratamento", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[processo] Erro não tratado — reiniciando", err);
  process.exit(1);
});

startServer().catch((err) => {
  console.error("[processo] Falha ao iniciar o servidor", err);
  process.exit(1);
});
