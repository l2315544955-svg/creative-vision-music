import { logoutAuthToken, requireAuth } from "../lib/auth.mjs";
import {
  ensureUserCreditAccountBootstrapped,
  listUserCreditLedger,
} from "../lib/creditsStore.mjs";
import {
  authenticateUser,
  buildPermissionSummary,
  createUserSession,
  getOrganizationById,
  registerPersonalUser,
} from "../lib/userStore.mjs";

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

function buildViewerProfile(user) {
  return {
    user,
    organization: user.organizationId ? getOrganizationById(user.organizationId) : null,
    permissions: buildPermissionSummary(user),
  };
}

function buildAuthenticatedPayload(user, session) {
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    ...buildViewerProfile(user),
    credits: ensureUserCreditAccountBootstrapped(user.id, {
      grantSignupBonus: user.roleCode === "personal_user",
    }),
  };
}

export function registerAuthRoutes(app) {
  app.post("/api/auth/register", (req, res) => {
    const accountKey = String(req.body?.accountKey || "").trim().toLowerCase();
    const displayName = String(req.body?.displayName || "").trim();
    const password = String(req.body?.password || "");

    if (!accountKey) {
      return badRequest(res, "accountKey 不能为空。");
    }

    if (!password) {
      return badRequest(res, "password 不能为空。");
    }

    try {
      const user = registerPersonalUser({
        accountKey,
        displayName,
        password,
      });
      const session = createUserSession(user.id);

      return res.json({
        success: true,
        data: buildAuthenticatedPayload(user, session),
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "注册失败。",
      });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const accountKey = String(req.body?.accountKey || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!accountKey) {
      return badRequest(res, "accountKey 不能为空。");
    }

    if (!password) {
      return badRequest(res, "password 不能为空。");
    }

    try {
      const user = authenticateUser({
        accountKey,
        password,
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "账号或密码错误。",
        });
      }

      const session = createUserSession(user.id);

      return res.json({
        success: true,
        data: buildAuthenticatedPayload(user, session),
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "登录失败。",
      });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    logoutAuthToken(req);

    return res.json({
      success: true,
      data: {
        loggedOut: true,
      },
    });
  });

  app.get("/api/me", (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    return res.json({
      success: true,
      data: buildViewerProfile(auth.user),
    });
  });

  app.get("/api/me/credits", (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    return res.json({
      success: true,
      data: ensureUserCreditAccountBootstrapped(auth.user.id, {
        grantSignupBonus: auth.user.roleCode === "personal_user",
      }),
    });
  });

  app.get("/api/me/ledger", (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    return res.json({
      success: true,
      data: listUserCreditLedger(auth.user.id),
    });
  });
}
