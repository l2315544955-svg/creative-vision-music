import crypto from "node:crypto";

import { pricingCatalog } from "../config/catalog.mjs";
import { getDatabase } from "./database.mjs";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function roundCredits(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function assertNonZeroAmount(amount) {
  const normalized = roundCredits(amount);

  if (!Number.isFinite(normalized) || normalized === 0) {
    throw new Error("积分变动值不能为 0。");
  }

  return normalized;
}

function createInsufficientCreditsError(precheck) {
  const error = new Error(
    `当前可用积分 ${precheck.account.availableBalance}，本次需要 ${precheck.requiredCredits}，还差 ${precheck.missingCredits}。`,
  );
  error.statusCode = 402;
  error.payload = precheck;
  return error;
}

function getSignupBonusCredits() {
  const raw = process.env.DEV_SIGNUP_CREDITS;

  if (raw === undefined || raw === null || raw === "") {
    return 120;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? roundCredits(parsed) : 120;
}

function normalizeAccount(row) {
  if (!row) {
    return null;
  }

  const balance = roundCredits(row.balance);
  const frozenBalance = roundCredits(row.frozen_balance);

  return {
    accountId: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    balance,
    frozenBalance,
    availableBalance: roundCredits(balance - frozenBalance),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeLedgerRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    direction: row.direction,
    amount: roundCredits(row.amount),
    balanceAfter: roundCredits(row.balance_after),
    frozenAfter: roundCredits(row.frozen_after),
    eventType: row.event_type,
    referenceType: row.reference_type || undefined,
    referenceId: row.reference_id || undefined,
    note: row.note || undefined,
    createdAt: row.created_at,
  };
}

function findPricingItemByCode(code) {
  return pricingCatalog.find((item) => item.code === code) || null;
}

function getTaskLedgerState(database, taskId) {
  const rows = database
    .prepare(`
      SELECT event_type
      FROM credit_ledger
      WHERE reference_type = 'music_task'
        AND reference_id = ?
    `)
    .all(String(taskId || "").trim());

  return rows.reduce(
    (state, row) => {
      if (row.event_type === "freeze_generate") {
        state.frozen = true;
      }

      if (row.event_type === "consume_generate") {
        state.consumed = true;
      }

      if (row.event_type === "release_generate") {
        state.released = true;
      }

      return state;
    },
    {
      frozen: false,
      consumed: false,
      released: false,
    },
  );
}

export function resolvePricingCodeForTask({ provider, taskType, modelCode }) {
  if (provider === "suno" && taskType === "lyrics") {
    return "suno_lyrics";
  }

  if (provider === "suno" && taskType === "music") {
    return "suno_music";
  }

  if (provider === "minimax") {
    return String(modelCode || "").trim();
  }

  return "";
}

function ensureAccountRow(database, userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    throw new Error("userId 不能为空。");
  }

  let row = database
    .prepare(
      "SELECT * FROM credit_accounts WHERE owner_type = 'user' AND owner_id = ? LIMIT 1",
    )
    .get(normalizedUserId);

  if (!row) {
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
  }

  return row;
}

function hasLedgerEvent(database, { referenceType, referenceId, eventType }) {
  if (!referenceType || !referenceId || !eventType) {
    return false;
  }

  const row = database
    .prepare(`
      SELECT id
      FROM credit_ledger
      WHERE reference_type = ?
        AND reference_id = ?
        AND event_type = ?
      LIMIT 1
    `)
    .get(String(referenceType), String(referenceId), String(eventType));

  return Boolean(row?.id);
}

function insertLedger(database, input) {
  database
    .prepare(`
      INSERT INTO credit_ledger (
        id,
        account_id,
        owner_type,
        owner_id,
        direction,
        amount,
        balance_after,
        frozen_after,
        event_type,
        reference_type,
        reference_id,
        note,
        created_at
      ) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      createId("led"),
      input.accountId,
      input.ownerId,
      input.direction,
      roundCredits(input.amount),
      roundCredits(input.balanceAfter),
      roundCredits(input.frozenAfter),
      input.eventType,
      input.referenceType || null,
      input.referenceId || null,
      input.note || null,
      nowIso(),
    );
}

function updateAccountBalances(database, accountId, balance, frozenBalance) {
  database
    .prepare(`
      UPDATE credit_accounts
      SET balance = ?,
          frozen_balance = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .run(roundCredits(balance), roundCredits(frozenBalance), nowIso(), accountId);
}

function mutateAccount(userId, handler) {
  const database = getDatabase();
  database.exec("BEGIN");

  try {
    const row = ensureAccountRow(database, userId);
    const result = handler({
      database,
      account: normalizeAccount(row),
    });

    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getUserCreditSummary(userId) {
  const database = getDatabase();
  const row = ensureAccountRow(database, userId);
  return normalizeAccount(row);
}

export function listUserCreditLedger(userId) {
  const database = getDatabase();
  const account = ensureAccountRow(database, userId);

  const rows = database
    .prepare(`
      SELECT *
      FROM credit_ledger
      WHERE account_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `)
    .all(account.id);

  return rows.map(normalizeLedgerRow);
}

export function grantCreditsToUser({
  userId,
  amount,
  eventType,
  referenceType,
  referenceId,
  note,
}) {
  const normalizedAmount = assertNonZeroAmount(amount);

  if (normalizedAmount < 0) {
    throw new Error("grantCreditsToUser 仅支持正向加分。");
  }

  return mutateAccount(userId, ({ database, account }) => {
    if (
      hasLedgerEvent(database, {
        referenceType,
        referenceId,
        eventType,
      })
    ) {
      return account;
    }

    const nextBalance = roundCredits(account.balance + normalizedAmount);
    updateAccountBalances(database, account.accountId, nextBalance, account.frozenBalance);
    insertLedger(database, {
      accountId: account.accountId,
      ownerId: account.ownerId,
      direction: "credit",
      amount: normalizedAmount,
      balanceAfter: nextBalance,
      frozenAfter: account.frozenBalance,
      eventType,
      referenceType,
      referenceId,
      note,
    });

    return {
      ...account,
      balance: nextBalance,
      availableBalance: roundCredits(nextBalance - account.frozenBalance),
      updatedAt: nowIso(),
    };
  });
}

export function adjustUserCredits({
  userId,
  amount,
  eventType = "manual_adjustment",
  referenceType = "console",
  referenceId,
  note,
}) {
  const normalizedAmount = assertNonZeroAmount(amount);

  return mutateAccount(userId, ({ database, account }) => {
    if (
      hasLedgerEvent(database, {
        referenceType,
        referenceId,
        eventType,
      })
    ) {
      return account;
    }

    if (normalizedAmount < 0 && account.availableBalance < Math.abs(normalizedAmount)) {
      throw new Error(
        `当前可调整积分不足，可用 ${account.availableBalance}，本次需要扣减 ${Math.abs(normalizedAmount)}。`,
      );
    }

    const nextBalance = roundCredits(account.balance + normalizedAmount);

    updateAccountBalances(database, account.accountId, nextBalance, account.frozenBalance);
    insertLedger(database, {
      accountId: account.accountId,
      ownerId: account.ownerId,
      direction: normalizedAmount > 0 ? "credit" : "debit",
      amount: Math.abs(normalizedAmount),
      balanceAfter: nextBalance,
      frozenAfter: account.frozenBalance,
      eventType,
      referenceType,
      referenceId,
      note,
    });

    return {
      ...account,
      balance: nextBalance,
      availableBalance: roundCredits(nextBalance - account.frozenBalance),
      updatedAt: nowIso(),
    };
  });
}

export function ensureUserCreditAccountBootstrapped(userId, options = {}) {
  const grantSignupBonus = Boolean(options.grantSignupBonus);
  const bonusCredits = getSignupBonusCredits();

  if (!grantSignupBonus || bonusCredits <= 0) {
    return getUserCreditSummary(userId);
  }

  return grantCreditsToUser({
    userId,
    amount: bonusCredits,
    eventType: "signup_bonus",
    referenceType: "user",
    referenceId: String(userId || "").trim(),
    note: "开发阶段新用户体验积分。",
  });
}

export function buildCreditPrecheck({ userId, pricingCode }) {
  const pricing = findPricingItemByCode(pricingCode);

  if (!pricing) {
    throw new Error(`未找到计费项：${pricingCode}`);
  }

  const account = ensureUserCreditAccountBootstrapped(userId);
  const requiredCredits = roundCredits(pricing.price);
  const missingCredits = roundCredits(Math.max(0, requiredCredits - account.availableBalance));

  return {
    account,
    pricingCode: pricing.code,
    pricingTitle: pricing.title,
    requiredCredits,
    sufficient: missingCredits <= 0,
    missingCredits,
    providerFamily: pricing.family,
  };
}

export function freezeCreditsForTask({ userId, taskId, pricingCode, note }) {
  const precheck = buildCreditPrecheck({ userId, pricingCode });

  if (!precheck.sufficient) {
    throw createInsufficientCreditsError(precheck);
  }

  return mutateAccount(userId, ({ database, account }) => {
    const ledgerState = getTaskLedgerState(database, taskId);

    if (ledgerState.frozen || ledgerState.consumed || ledgerState.released) {
      return getUserCreditSummary(userId);
    }

    const nextFrozen = roundCredits(account.frozenBalance + precheck.requiredCredits);
    updateAccountBalances(database, account.accountId, account.balance, nextFrozen);
    insertLedger(database, {
      accountId: account.accountId,
      ownerId: account.ownerId,
      direction: "freeze",
      amount: precheck.requiredCredits,
      balanceAfter: account.balance,
      frozenAfter: nextFrozen,
      eventType: "freeze_generate",
      referenceType: "music_task",
      referenceId: taskId,
      note:
        note ||
        `${precheck.pricingTitle} 冻结 ${precheck.requiredCredits} 积分。`,
    });

    return {
      ...account,
      frozenBalance: nextFrozen,
      availableBalance: roundCredits(account.balance - nextFrozen),
      updatedAt: nowIso(),
    };
  });
}

export function consumeFrozenCreditsForTask({ userId, taskId, pricingCode, note }) {
  const pricing = findPricingItemByCode(pricingCode);

  if (!pricing) {
    throw new Error(`未找到计费项：${pricingCode}`);
  }

  const amount = roundCredits(pricing.price);

  return mutateAccount(userId, ({ database, account }) => {
    const ledgerState = getTaskLedgerState(database, taskId);

    if (ledgerState.consumed || ledgerState.released) {
      return getUserCreditSummary(userId);
    }

    if (!ledgerState.frozen) {
      const availableBalance = roundCredits(account.balance - account.frozenBalance);

      if (availableBalance < amount) {
        throw createInsufficientCreditsError({
          account,
          pricingCode: pricing.code,
          pricingTitle: pricing.title,
          requiredCredits: amount,
          sufficient: false,
          missingCredits: roundCredits(amount - availableBalance),
          providerFamily: pricing.family,
        });
      }

      const nextBalance = roundCredits(account.balance - amount);
      updateAccountBalances(database, account.accountId, nextBalance, account.frozenBalance);
      insertLedger(database, {
        accountId: account.accountId,
        ownerId: account.ownerId,
        direction: "debit",
        amount,
        balanceAfter: nextBalance,
        frozenAfter: account.frozenBalance,
        eventType: "consume_generate",
        referenceType: "music_task",
        referenceId: taskId,
        note: note || `${pricing.title} 已直接扣减 ${amount} 积分。`,
      });

      return {
        ...account,
        balance: nextBalance,
        availableBalance: roundCredits(nextBalance - account.frozenBalance),
        updatedAt: nowIso(),
      };
    }

    const nextBalance = roundCredits(account.balance - amount);
    const nextFrozen = roundCredits(Math.max(0, account.frozenBalance - amount));
    updateAccountBalances(database, account.accountId, nextBalance, nextFrozen);
    insertLedger(database, {
      accountId: account.accountId,
      ownerId: account.ownerId,
      direction: "debit",
      amount,
      balanceAfter: nextBalance,
      frozenAfter: nextFrozen,
      eventType: "consume_generate",
      referenceType: "music_task",
      referenceId: taskId,
      note: note || `${pricing.title} 已正式扣减 ${amount} 积分。`,
    });

    return {
      ...account,
      balance: nextBalance,
      frozenBalance: nextFrozen,
      availableBalance: roundCredits(nextBalance - nextFrozen),
      updatedAt: nowIso(),
    };
  });
}

export function consumeAvailableCreditsForTask({ userId, taskId, pricingCode, note }) {
  const pricing = findPricingItemByCode(pricingCode);

  if (!pricing) {
    throw new Error(`未找到计费项：${pricingCode}`);
  }

  const precheck = buildCreditPrecheck({ userId, pricingCode });

  if (!precheck.sufficient) {
    throw createInsufficientCreditsError(precheck);
  }

  return mutateAccount(userId, ({ database, account }) => {
    if (
      hasLedgerEvent(database, {
        referenceType: "music_task",
        referenceId: taskId,
        eventType: "consume_generate",
      })
    ) {
      return getUserCreditSummary(userId);
    }

    const nextBalance = roundCredits(account.balance - precheck.requiredCredits);
    updateAccountBalances(database, account.accountId, nextBalance, account.frozenBalance);
    insertLedger(database, {
      accountId: account.accountId,
      ownerId: account.ownerId,
      direction: "debit",
      amount: precheck.requiredCredits,
      balanceAfter: nextBalance,
      frozenAfter: account.frozenBalance,
      eventType: "consume_generate",
      referenceType: "music_task",
      referenceId: taskId,
      note:
        note ||
        `${pricing.title} 已直接扣减 ${precheck.requiredCredits} 积分。`,
    });

    return {
      ...account,
      balance: nextBalance,
      availableBalance: roundCredits(nextBalance - account.frozenBalance),
      updatedAt: nowIso(),
    };
  });
}

export function releaseFrozenCreditsForTask({ userId, taskId, pricingCode, note }) {
  const pricing = findPricingItemByCode(pricingCode);

  if (!pricing) {
    throw new Error(`未找到计费项：${pricingCode}`);
  }

  const amount = roundCredits(pricing.price);

  return mutateAccount(userId, ({ database, account }) => {
    const ledgerState = getTaskLedgerState(database, taskId);

    if (ledgerState.released || ledgerState.consumed || !ledgerState.frozen) {
      return getUserCreditSummary(userId);
    }

    const nextFrozen = roundCredits(Math.max(0, account.frozenBalance - amount));
    updateAccountBalances(database, account.accountId, account.balance, nextFrozen);
    insertLedger(database, {
      accountId: account.accountId,
      ownerId: account.ownerId,
      direction: "release",
      amount,
      balanceAfter: account.balance,
      frozenAfter: nextFrozen,
      eventType: "release_generate",
      referenceType: "music_task",
      referenceId: taskId,
      note: note || `${pricing.title} 冻结积分已释放。`,
    });

    return {
      ...account,
      frozenBalance: nextFrozen,
      availableBalance: roundCredits(account.balance - nextFrozen),
      updatedAt: nowIso(),
    };
  });
}
