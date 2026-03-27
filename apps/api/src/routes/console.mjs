import { requireAuth } from "../lib/auth.mjs";
import { adjustUserCredits, getUserCreditSummary } from "../lib/creditsStore.mjs";
import {
  buildPermissionSummary,
  canAccessConsole,
  canManageUser,
  createOrganizationMemberAccount,
  createOrganizationWithOwner,
  findUserById,
  getOrganizationById,
  isSuperAdmin,
  listManagedUsersForViewer,
  listOrganizationsForViewer,
} from "../lib/userStore.mjs";

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

function forbidden(res, message = "当前账号没有控制台权限。") {
  return res.status(403).json({
    success: false,
    message,
  });
}

function toManagedUserSummary(user) {
  return {
    ...user,
    credits: getUserCreditSummary(user.id),
  };
}

function buildConsoleBootstrap(viewer) {
  const organizations = listOrganizationsForViewer(viewer);
  const managedUsers = listManagedUsersForViewer(viewer).map(toManagedUserSummary);

  return {
    viewer,
    organization: viewer.organizationId ? getOrganizationById(viewer.organizationId) : null,
    permissions: buildPermissionSummary(viewer),
    organizations,
    managedUsers,
    summary: {
      organizationCount: organizations.length,
      managedUserCount: managedUsers.length,
      totalManagedCredits: managedUsers.reduce(
        (sum, user) => sum + Number(user.credits?.balance || 0),
        0,
      ),
    },
  };
}

function requireConsoleViewer(req, res) {
  const auth = requireAuth(req, res);

  if (!auth) {
    return null;
  }

  if (!canAccessConsole(auth.user)) {
    forbidden(res);
    return null;
  }

  return auth.user;
}

function parseInitialCredits(value) {
  if (value === "" || value === undefined || value === null) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("初始积分必须是大于等于 0 的数字。");
  }

  return parsed;
}

export function registerConsoleRoutes(app) {
  app.get("/api/console/bootstrap", (req, res) => {
    const viewer = requireConsoleViewer(req, res);

    if (!viewer) {
      return;
    }

    return res.json({
      success: true,
      data: buildConsoleBootstrap(viewer),
    });
  });

  app.post("/api/console/organizations", (req, res) => {
    const viewer = requireConsoleViewer(req, res);

    if (!viewer) {
      return;
    }

    if (!isSuperAdmin(viewer)) {
      return forbidden(res, "只有超管可以创建组织和一级账号。");
    }

    const name = String(req.body?.name || "").trim();
    const code = String(req.body?.code || "").trim();
    const ownerAccountKey = String(req.body?.ownerAccountKey || "").trim().toLowerCase();
    const ownerDisplayName = String(req.body?.ownerDisplayName || "").trim();
    const ownerPassword = String(req.body?.ownerPassword || "");

    if (!name) {
      return badRequest(res, "组织名称不能为空。");
    }

    if (!ownerAccountKey) {
      return badRequest(res, "一级账号不能为空。");
    }

    if (!ownerPassword) {
      return badRequest(res, "一级账号密码不能为空。");
    }

    try {
      const initialCredits = parseInitialCredits(req.body?.initialCredits);
      const created = createOrganizationWithOwner({
        name,
        code,
        ownerAccountKey,
        ownerDisplayName,
        ownerPassword,
        creatorUserId: viewer.id,
      });

      if (initialCredits > 0) {
        adjustUserCredits({
          userId: created.owner.id,
          amount: initialCredits,
          eventType: "organization_owner_seed",
          referenceType: "organization",
          referenceId: created.organization.id,
          note: `超管为一级账号分配初始积分 ${initialCredits}。`,
        });
      }

      return res.json({
        success: true,
        data: {
          organization: created.organization,
          owner: created.owner,
          ownerCredits: getUserCreditSummary(created.owner.id),
          console: buildConsoleBootstrap(viewer),
        },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "创建组织失败。",
      });
    }
  });

  app.post("/api/console/accounts", (req, res) => {
    const viewer = requireConsoleViewer(req, res);

    if (!viewer) {
      return;
    }

    const roleCode = String(req.body?.roleCode || "org_member").trim();
    const accountKey = String(req.body?.accountKey || "").trim().toLowerCase();
    const displayName = String(req.body?.displayName || "").trim();
    const password = String(req.body?.password || "");
    const requestedOrganizationId = String(req.body?.organizationId || "").trim();
    const organizationId = isSuperAdmin(viewer)
      ? requestedOrganizationId
      : String(viewer.organizationId || "").trim();

    if (roleCode !== "org_member") {
      return badRequest(res, "当前阶段控制台仅支持创建组织二级账号。");
    }

    if (!organizationId) {
      return badRequest(res, "organizationId 不能为空。");
    }

    if (!accountKey) {
      return badRequest(res, "账号不能为空。");
    }

    if (!password) {
      return badRequest(res, "密码不能为空。");
    }

    if (!isSuperAdmin(viewer) && organizationId !== viewer.organizationId) {
      return forbidden(res, "只能在当前组织下创建二级账号。");
    }

    try {
      const initialCredits = parseInitialCredits(req.body?.initialCredits);
      const user = createOrganizationMemberAccount({
        organizationId,
        accountKey,
        displayName,
        password,
        creatorUserId: viewer.id,
      });

      if (initialCredits > 0) {
        adjustUserCredits({
          userId: user.id,
          amount: initialCredits,
          eventType: "organization_member_seed",
          referenceType: "organization_member",
          referenceId: user.id,
          note: `控制台创建账号时分配初始积分 ${initialCredits}。`,
        });
      }

      return res.json({
        success: true,
        data: {
          user,
          credits: getUserCreditSummary(user.id),
          console: buildConsoleBootstrap(viewer),
        },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "创建账号失败。",
      });
    }
  });

  app.post("/api/console/credits/adjust", (req, res) => {
    const viewer = requireConsoleViewer(req, res);

    if (!viewer) {
      return;
    }

    const targetUserId = String(req.body?.targetUserId || "").trim();
    const note = String(req.body?.note || "").trim();
    const amount = Number(req.body?.amount);

    if (!targetUserId) {
      return badRequest(res, "targetUserId 不能为空。");
    }

    if (!Number.isFinite(amount) || amount === 0) {
      return badRequest(res, "amount 必须是非 0 数字。");
    }

    const targetUser = findUserById(targetUserId);

    if (!targetUser) {
      return badRequest(res, "目标账号不存在。");
    }

    if (!canManageUser(viewer, targetUser)) {
      return forbidden(res, "当前账号不能管理该用户。");
    }

    try {
      const credits = adjustUserCredits({
        userId: targetUser.id,
        amount,
        eventType: amount > 0 ? "console_credit_grant" : "console_credit_deduct",
        referenceType: "console_user",
        referenceId: `${viewer.id}:${targetUser.id}:${Date.now()}`,
        note:
          note ||
          (amount > 0
            ? `控制台加分 ${amount}。`
            : `控制台扣减 ${Math.abs(amount)}。`),
      });

      return res.json({
        success: true,
        data: {
          user: targetUser,
          credits,
          console: buildConsoleBootstrap(viewer),
        },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "积分调整失败。",
      });
    }
  });
}
