import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, "../../../..");
const dataDir = path.join(workspaceRoot, "apps", "data");
const legacyPaymentOrdersFile = path.join(dataDir, "payment-orders.json");

let databaseInstance = null;

function resolveDatabaseFile() {
  const configured = String(process.env.SQLITE_DB_FILE || "").trim();

  if (!configured) {
    return path.join(dataDir, "creative-vision-music.sqlite");
  }

  return path.isAbsolute(configured) ? configured : path.join(workspaceRoot, configured);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      account_key TEXT UNIQUE,
      display_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      password_hash TEXT,
      role_code TEXT NOT NULL DEFAULT 'personal_user',
      organization_id TEXT,
      parent_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      owner_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      allocated_credits INTEGER NOT NULL DEFAULT 0,
      used_credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (organization_id, user_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credit_accounts (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      frozen_balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (owner_type, owner_id)
    );

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      frozen_after INTEGER NOT NULL DEFAULT 0,
      event_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES credit_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS music_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      organization_id TEXT,
      provider TEXT NOT NULL,
      task_type TEXT NOT NULL,
      title TEXT,
      model_code TEXT,
      status TEXT NOT NULL,
      remote_task_id TEXT,
      request_payload TEXT,
      result_payload TEXT,
      fail_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS music_works (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      clip_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      audio_url TEXT,
      image_url TEXT,
      video_url TEXT,
      duration REAL,
      raw_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (task_id, clip_id),
      FOREIGN KEY (task_id) REFERENCES music_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS billing_orders (
      order_no TEXT PRIMARY KEY,
      order_type TEXT NOT NULL DEFAULT 'topup',
      source TEXT NOT NULL DEFAULT 'personal',
      provider TEXT NOT NULL DEFAULT 'manual_confirm',
      user_id TEXT,
      organization_id TEXT,
      package_code TEXT,
      package_name TEXT,
      amount REAL NOT NULL,
      total_credits INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      trade_status TEXT,
      trade_no TEXT,
      payment_method TEXT,
      buyer_id TEXT,
      buyer_pay_amount TEXT,
      checkout_mode TEXT,
      settlement_mode TEXT,
      channels TEXT,
      pay_url TEXT,
      instructions TEXT,
      gateway_payload TEXT,
      expires_at TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    );

  `);
}

function listTableColumns(database, tableName) {
  return database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => String(row.name || "").trim());
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = listTableColumns(database, tableName);

  if (columns.includes(columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function runMigrations(database) {
  ensureColumn(database, "users", "password_hash", "TEXT");
  ensureColumn(database, "users", "role_code", "TEXT NOT NULL DEFAULT 'personal_user'");
  ensureColumn(database, "users", "organization_id", "TEXT");
  ensureColumn(database, "users", "parent_user_id", "TEXT");
  ensureColumn(database, "organizations", "code", "TEXT");
  ensureColumn(database, "music_tasks", "organization_id", "TEXT");
  ensureColumn(database, "billing_orders", "organization_id", "TEXT");

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_credit_accounts_owner
      ON credit_accounts(owner_type, owner_id);

    CREATE INDEX IF NOT EXISTS idx_users_role_org
      ON users(role_code, organization_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_code
      ON organizations(code);

    CREATE INDEX IF NOT EXISTS idx_user_sessions_user
      ON user_sessions(user_id, revoked_at, expires_at);

    CREATE INDEX IF NOT EXISTS idx_credit_ledger_owner_created
      ON credit_ledger(owner_type, owner_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_music_tasks_owner_created
      ON music_tasks(user_id, organization_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_music_tasks_remote_task
      ON music_tasks(provider, remote_task_id);

    CREATE INDEX IF NOT EXISTS idx_music_works_task
      ON music_works(task_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_billing_orders_owner_created
      ON billing_orders(user_id, organization_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_billing_orders_status_created
      ON billing_orders(status, created_at DESC);
  `);
}

function migrateLegacyPaymentOrders(database) {
  if (!fs.existsSync(legacyPaymentOrdersFile)) {
    return;
  }

  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(legacyPaymentOrdersFile, "utf8"));
  } catch (error) {
    console.warn(
      `[creative-vision-music-api] failed to parse legacy payment orders: ${error.message}`,
    );
    return;
  }

  const orders = Object.values(parsed?.orders || {});

  if (!orders.length) {
    return;
  }

  const insert = database.prepare(`
    INSERT OR IGNORE INTO billing_orders (
      order_no,
      order_type,
      source,
      provider,
      package_code,
      package_name,
      amount,
      total_credits,
      status,
      trade_status,
      trade_no,
      payment_method,
      buyer_id,
      buyer_pay_amount,
      checkout_mode,
      settlement_mode,
      channels,
      pay_url,
      instructions,
      gateway_payload,
      expires_at,
      paid_at,
      created_at,
      updated_at
    ) VALUES (
      :orderNo,
      'topup',
      'personal',
      :provider,
      :packageCode,
      :packageName,
      :amount,
      :totalCredits,
      :status,
      :tradeStatus,
      :tradeNo,
      :paymentMethod,
      :buyerId,
      :buyerPayAmount,
      :checkoutMode,
      :settlementMode,
      :channels,
      :payUrl,
      :instructions,
      :gatewayPayload,
      :expiresAt,
      :paidAt,
      :createdAt,
      :updatedAt
    )
  `);

  database.exec("BEGIN");

  try {
    for (const item of orders) {
      if (!item?.orderNo) {
        continue;
      }

      const createdAt = item.createdAt ? String(item.createdAt) : new Date().toISOString();
      const updatedAt = item.updatedAt ? String(item.updatedAt) : createdAt;

      insert.run({
        orderNo: String(item.orderNo),
        provider: String(item.provider || "alipay_page"),
        packageCode: item.packageCode ? String(item.packageCode) : null,
        packageName: item.packageName ? String(item.packageName) : null,
        amount: Number(item.amount || 0),
        totalCredits: Number(item.totalCredits || 0),
        status: String(item.status || "PENDING_PAYMENT"),
        tradeStatus: item.tradeStatus ? String(item.tradeStatus) : null,
        tradeNo: item.tradeNo ? String(item.tradeNo) : null,
        paymentMethod: item.paymentMethod ? String(item.paymentMethod) : null,
        buyerId: item.buyerId ? String(item.buyerId) : null,
        buyerPayAmount:
          item.buyerPayAmount === undefined || item.buyerPayAmount === null
            ? null
            : String(item.buyerPayAmount),
        checkoutMode: item.provider === "alipay_page" ? "alipay_page" : "manual_confirm",
        settlementMode: null,
        channels: null,
        payUrl: null,
        instructions: null,
        gatewayPayload: null,
        expiresAt: item.expiresAt ? String(item.expiresAt) : null,
        paidAt: item.paidAt ? String(item.paidAt) : null,
        createdAt,
        updatedAt,
      });
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function createDatabase() {
  const databaseFile = resolveDatabaseFile();
  ensureParentDir(databaseFile);

  const database = new DatabaseSync(databaseFile);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA busy_timeout = 5000;");

  createSchema(database);
  runMigrations(database);
  migrateLegacyPaymentOrders(database);

  return database;
}

export function getDatabase() {
  if (!databaseInstance) {
    databaseInstance = createDatabase();
  }

  return databaseInstance;
}

export function initializeDatabase() {
  getDatabase();
}

export function getDatabaseRuntime() {
  return {
    engine: "sqlite",
    file: resolveDatabaseFile(),
    ready: Boolean(databaseInstance),
    legacyPaymentOrdersFile,
  };
}
