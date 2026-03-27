import crypto from "node:crypto";

import { getDatabase } from "./database.mjs";

const ROLE_LABELS = {
  super_admin: "平台超管",
  org_owner: "组织负责人",
  org_member: "组织成员",
  personal_user: "普通用户",
};

function nowIso() {
  return new Date().toISOString();
}

function inDaysIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function normalizeAccountKey(accountKey) {
  return String(accountKey || "").trim().toLowerCase();
}

function normalizeOrganizationCode(code, name) {
  const raw = String(code || name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return raw || `org-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeRoleCode(roleCode) {
  const value = String(roleCode || "").trim() || "personal_user";
  return ROLE_LABELS[value] ? value : "personal_user";
}

function roleLabelFor(roleCode) {
  return ROLE_LABELS[normalizeRoleCode(roleCode)] || ROLE_LABELS.personal_user;
}

function buildUserSelect(whereClause = "1 = 1") {
  return `
    SELECT
      users.*,
      organizations.name AS organization_name,
      organizations.code AS organization_code
    FROM users
    LEFT JOIN organizations ON organizations.id = users.organization_id
    WHERE ${whereClause}
  `;
}

function normalizeUser(row) {
  if (!row) {
    return null;
  }

  const roleCode = normalizeRoleCode(row.role_code);

  return {
    id: row.id,
    accountKey: row.account_key,
    displayName: row.display_name,
    phone: row.phone || undefined,
    email: row.email || undefined,
    status: row.status,
    roleCode,
    roleLabel: roleLabelFor(roleCode),
    organizationId: row.organization_id || undefined,
    organizationName: row.organization_name || undefined,
    organizationCode: row.organization_code || undefined,
    parentUserId: row.parent_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeOrganization(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    code: row.code || undefined,
    name: row.name,
    ownerUserId: row.owner_user_id || undefined,
    ownerDisplayName: row.owner_display_name || undefined,
    status: row.status,
    memberCount: Number(row.member_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCreditAccount(row) {
  if (!row) {
    return null;
  }

  return {
    accountId: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    balance: Number(row.balance || 0),
    frozenBalance: Number(row.frozen_balance || 0),
    availableBalance: Number(row.balance || 0) - Number(row.frozen_balance || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const normalized = String(storedHash || "").trim();

  if (!normalized.includes(":")) {
    return false;
  }

  const [salt, digest] = normalized.split(":");

  if (!salt || !digest) {
    return false;
  }

  const computed = crypto.scryptSync(String(password || ""), salt, 64);
  const source = Buffer.from(digest, "hex");

  if (computed.length !== source.length) {
    return false;
  }

  return crypto.timingSafeEqual(computed, source);
}

function assertAccountKey(accountKey) {
  const normalized = normalizeAccountKey(accountKey);

  if (!normalized) {
    throw new Error("账号不能为空。");
  }

  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw new Error("账号只允许 3-32 位小写字母、数字、点、下划线或中划线。");
  }

  return normalized;
}

function assertPassword(password) {
  const normalized = String(password || "");

  if (normalized.length < 6) {
    throw new Error("密码至少需要 6 位。");
  }

  return normalized;
}

function getUserAuthRowByAccountKey(accountKey, database = getDatabase()) {
  return database
    .prepare(`${buildUserSelect("users.account_key = ?")} LIMIT 1`)
    .get(normalizeAccountKey(accountKey));
}

function getOrganizationRowById(organizationId, database = getDatabase()) {
  const normalizedId = String(organizationId || "").trim();

  if (!normalizedId) {
    return null;
  }

  return database
    .prepare(`
      SELECT
        organizations.*,
        owner.display_name AS owner_display_name,
        COUNT(members.user_id) AS member_count
      FROM organizations
      LEFT JOIN users owner ON owner.id = organizations.owner_user_id
      LEFT JOIN organization_members members
        ON members.organization_id = organizations.id
       AND members.status = 'active'
      WHERE organizations.id = ?
      GROUP BY organizations.id
      LIMIT 1
    `)
    .get(normalizedId);
}

function createUserRecord(input, database = getDatabase()) {
  const accountKey = assertAccountKey(input.accountKey);
  const password = assertPassword(input.password);
  const displayName = String(input.displayName || "").trim() || accountKey;
  const roleCode = normalizeRoleCode(input.roleCode);
  const now = nowIso();
  const existing = getUserAuthRowByAccountKey(accountKey, database);

  if (existing) {
    throw new Error(`账号已存在：${accountKey}`);
  }

  const user = {
    id: createId("usr"),
    accountKey,
    displayName,
    passwordHash: hashPassword(password),
    roleCode,
    organizationId: input.organizationId ? String(input.organizationId).trim() : null,
    parentUserId: input.parentUserId ? String(input.parentUserId).trim() : null,
    status: input.status ? String(input.status).trim() : "active",
    createdAt: now,
    updatedAt: now,
  };

  database
    .prepare(`
      INSERT INTO users (
        id,
        account_key,
        display_name,
        password_hash,
        role_code,
        organization_id,
        parent_user_id,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      user.id,
      user.accountKey,
      user.displayName,
      user.passwordHash,
      user.roleCode,
      user.organizationId,
      user.parentUserId,
      user.status,
      user.createdAt,
      user.updatedAt,
    );

  return findUserById(user.id);
}

function ensureOrganizationMember({
  organizationId,
  userId,
  role,
  database = getDatabase(),
}) {
  const normalizedOrganizationId = String(organizationId || "").trim();
  const normalizedUserId = String(userId || "").trim();
  const normalizedRole = String(role || "").trim() || "org_member";
  const existing = database
    .prepare(`
      SELECT id
      FROM organization_members
      WHERE organization_id = ?
        AND user_id = ?
      LIMIT 1
    `)
    .get(normalizedOrganizationId, normalizedUserId);

  if (existing?.id) {
    database
      .prepare(`
        UPDATE organization_members
        SET role = ?,
            status = 'active',
            updated_at = ?
        WHERE id = ?
      `)
      .run(normalizedRole, nowIso(), existing.id);
    return existing.id;
  }

  const memberId = createId("orgm");

  database
    .prepare(`
      INSERT INTO organization_members (
        id,
        organization_id,
        user_id,
        role,
        status,
        allocated_credits,
        used_credits,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'active', 0, 0, ?, ?)
    `)
    .run(memberId, normalizedOrganizationId, normalizedUserId, normalizedRole, nowIso(), nowIso());

  return memberId;
}

export function findUserById(userId) {
  const database = getDatabase();
  const row = database
    .prepare(`${buildUserSelect("users.id = ?")} LIMIT 1`)
    .get(String(userId || "").trim());

  return normalizeUser(row);
}

export function findUserByAccountKey(accountKey) {
  return normalizeUser(getUserAuthRowByAccountKey(accountKey));
}

export function getOrganizationById(organizationId) {
  return normalizeOrganization(getOrganizationRowById(organizationId));
}

export function isSuperAdmin(user) {
  return normalizeRoleCode(user?.roleCode) === "super_admin";
}

export function isOrgOwner(user) {
  return normalizeRoleCode(user?.roleCode) === "org_owner";
}

export function canAccessConsole(user) {
  return isSuperAdmin(user) || isOrgOwner(user);
}

export function canManageUser(viewer, targetUser) {
  if (!viewer || !targetUser) {
    return false;
  }

  if (isSuperAdmin(viewer)) {
    return true;
  }

  if (!isOrgOwner(viewer)) {
    return false;
  }

  return (
    Boolean(viewer.organizationId) &&
    viewer.organizationId === targetUser.organizationId &&
    normalizeRoleCode(targetUser.roleCode) !== "super_admin"
  );
}

export function buildPermissionSummary(user) {
  const superAdmin = isSuperAdmin(user);
  const orgOwner = isOrgOwner(user);

  return {
    canAccessConsole: superAdmin || orgOwner,
    canManageOrganizations: superAdmin,
    canManageMembers: superAdmin || orgOwner,
    canManageCredits: superAdmin || orgOwner,
    canCreateOrgOwner: superAdmin,
    canCreateOrgMember: superAdmin || orgOwner,
    canViewAllAccounts: superAdmin,
  };
}

export function registerPersonalUser({ accountKey, displayName, password }) {
  return createUserRecord({
    accountKey,
    displayName,
    password,
    roleCode: "personal_user",
  });
}

export function authenticateUser({ accountKey, password }) {
  const row = getUserAuthRowByAccountKey(accountKey);

  if (!row?.id || !row.password_hash) {
    return null;
  }

  if (!verifyPassword(password, row.password_hash)) {
    return null;
  }

  if (String(row.status || "active").trim() !== "active") {
    throw new Error("当前账号已被停用。");
  }

  return normalizeUser(row);
}

export function seedSystemAdmin() {
  const database = getDatabase();
  const seededAccountKey = normalizeAccountKey(process.env.SUPER_ADMIN_ACCOUNT || "admin");
  const seededPassword = String(process.env.SUPER_ADMIN_PASSWORD || "admin123");
  const seededDisplayName = String(process.env.SUPER_ADMIN_NAME || "Creative Vision 超管").trim();
  const existingAdmin = database
    .prepare(`${buildUserSelect("users.role_code = 'super_admin'")} LIMIT 1`)
    .get();

  if (existingAdmin?.id) {
    if (!existingAdmin.password_hash) {
      database
        .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(hashPassword(seededPassword), nowIso(), existingAdmin.id);
    }

    return normalizeUser(existingAdmin);
  }

  const accountRow = getUserAuthRowByAccountKey(seededAccountKey, database);

  if (accountRow?.id) {
    database
      .prepare(`
        UPDATE users
        SET display_name = ?,
            password_hash = ?,
            role_code = 'super_admin',
            organization_id = NULL,
            parent_user_id = NULL,
            status = 'active',
            updated_at = ?
        WHERE id = ?
      `)
      .run(
        seededDisplayName || accountRow.display_name,
        accountRow.password_hash || hashPassword(seededPassword),
        nowIso(),
        accountRow.id,
      );

    return findUserById(accountRow.id);
  }

  return createUserRecord(
    {
      accountKey: seededAccountKey,
      displayName: seededDisplayName,
      password: seededPassword,
      roleCode: "super_admin",
    },
    database,
  );
}

export function createOrganizationWithOwner({
  name,
  code,
  ownerAccountKey,
  ownerDisplayName,
  ownerPassword,
  creatorUserId,
}) {
  const database = getDatabase();
  const organizationName = String(name || "").trim();
  const organizationCode = normalizeOrganizationCode(code, name);

  if (!organizationName) {
    throw new Error("组织名称不能为空。");
  }

  database.exec("BEGIN");

  try {
    const duplicated = database
      .prepare("SELECT id FROM organizations WHERE code = ? LIMIT 1")
      .get(organizationCode);

    if (duplicated?.id) {
      throw new Error(`组织编码已存在：${organizationCode}`);
    }

    const organizationId = createId("org");
    const createdAt = nowIso();

    database
      .prepare(`
        INSERT INTO organizations (
          id,
          code,
          name,
          owner_user_id,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, NULL, 'active', ?, ?)
      `)
      .run(organizationId, organizationCode, organizationName, createdAt, createdAt);

    const owner = createUserRecord(
      {
        accountKey: ownerAccountKey,
        displayName: ownerDisplayName || `${organizationName} 负责人`,
        password: ownerPassword,
        roleCode: "org_owner",
        organizationId,
        parentUserId: creatorUserId,
      },
      database,
    );

    database
      .prepare(`
        UPDATE organizations
        SET owner_user_id = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .run(owner.id, nowIso(), organizationId);

    ensureOrganizationMember({
      organizationId,
      userId: owner.id,
      role: "org_owner",
      database,
    });

    database.exec("COMMIT");

    return {
      organization: getOrganizationById(organizationId),
      owner: findUserById(owner.id),
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createOrganizationMemberAccount({
  organizationId,
  accountKey,
  displayName,
  password,
  creatorUserId,
}) {
  const database = getDatabase();
  const organization = getOrganizationRowById(organizationId, database);

  if (!organization?.id) {
    throw new Error("组织不存在。");
  }

  database.exec("BEGIN");

  try {
    const member = createUserRecord(
      {
        accountKey,
        displayName,
        password,
        roleCode: "org_member",
        organizationId: organization.id,
        parentUserId: creatorUserId,
      },
      database,
    );

    ensureOrganizationMember({
      organizationId: organization.id,
      userId: member.id,
      role: "org_member",
      database,
    });

    database.exec("COMMIT");
    return findUserById(member.id);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function listOrganizationsForViewer(viewer) {
  const database = getDatabase();

  if (!viewer) {
    return [];
  }

  const whereClause = isSuperAdmin(viewer)
    ? "1 = 1"
    : "organizations.id = ?";
  const statement = database.prepare(`
    SELECT
      organizations.*,
      owner.display_name AS owner_display_name,
      COUNT(members.user_id) AS member_count
    FROM organizations
    LEFT JOIN users owner ON owner.id = organizations.owner_user_id
    LEFT JOIN organization_members members
      ON members.organization_id = organizations.id
     AND members.status = 'active'
    WHERE ${whereClause}
    GROUP BY organizations.id
    ORDER BY organizations.created_at DESC
  `);
  const rows = isSuperAdmin(viewer)
    ? statement.all()
    : viewer.organizationId
      ? statement.all(String(viewer.organizationId).trim())
      : [];

  return rows.map(normalizeOrganization);
}

export function listManagedUsersForViewer(viewer) {
  const database = getDatabase();

  if (!canAccessConsole(viewer)) {
    return [];
  }

  const rows = isSuperAdmin(viewer)
    ? database
        .prepare(`
          ${buildUserSelect("1 = 1")}
          ORDER BY
            CASE users.role_code
              WHEN 'super_admin' THEN 0
              WHEN 'org_owner' THEN 1
              WHEN 'org_member' THEN 2
              ELSE 3
            END,
            users.created_at DESC
        `)
        .all()
    : database
        .prepare(`
          ${buildUserSelect("users.organization_id = ?")}
          ORDER BY
            CASE users.role_code
              WHEN 'org_owner' THEN 0
              WHEN 'org_member' THEN 1
              ELSE 2
            END,
            users.created_at DESC
        `)
        .all(String(viewer.organizationId || "").trim());

  return rows.map(normalizeUser);
}

export function ensureUserCreditAccount(userId) {
  const database = getDatabase();
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    throw new Error("userId 不能为空。");
  }

  let row = database
    .prepare(
      "SELECT * FROM credit_accounts WHERE owner_type = 'user' AND owner_id = ? LIMIT 1",
    )
    .get(normalizedUserId);

  if (row) {
    return normalizeCreditAccount(row);
  }

  const createdAt = nowIso();
  const accountId = createId("acct");

  database
    .prepare(`
      INSERT INTO credit_accounts (
        id,
        owner_type,
        owner_id,
        balance,
        frozen_balance,
        created_at,
        updated_at
      ) VALUES (?, 'user', ?, 0, 0, ?, ?)
    `)
    .run(accountId, normalizedUserId, createdAt, createdAt);

  row = database
    .prepare(
      "SELECT * FROM credit_accounts WHERE owner_type = 'user' AND owner_id = ? LIMIT 1",
    )
    .get(normalizedUserId);

  return normalizeCreditAccount(row);
}

export function getUserCreditSummary(userId) {
  return ensureUserCreditAccount(userId);
}

export function createUserSession(userId) {
  const database = getDatabase();
  const token = `cvm_${crypto.randomBytes(24).toString("hex")}`;
  const createdAt = nowIso();
  const expiresAt = inDaysIso(30);

  database
    .prepare(`
      INSERT INTO user_sessions (
        token,
        user_id,
        created_at,
        expires_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?)
    `)
    .run(token, String(userId || "").trim(), createdAt, expiresAt, createdAt);

  return {
    token,
    createdAt,
    expiresAt,
  };
}

export function touchUserSession(token) {
  const database = getDatabase();
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    return;
  }

  database
    .prepare("UPDATE user_sessions SET last_seen_at = ? WHERE token = ?")
    .run(nowIso(), normalizedToken);
}

export function revokeUserSession(token) {
  const database = getDatabase();
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    return;
  }

  database
    .prepare("UPDATE user_sessions SET revoked_at = ? WHERE token = ?")
    .run(nowIso(), normalizedToken);
}

export function findUserBySessionToken(token) {
  const database = getDatabase();
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    return null;
  }

  const row = database
    .prepare(`
      ${buildUserSelect(`
        users.id IN (
          SELECT user_id
          FROM user_sessions
          WHERE token = ?
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > ?)
          LIMIT 1
        )
      `)}
      LIMIT 1
    `)
    .get(normalizedToken, nowIso());

  return normalizeUser(row);
}
