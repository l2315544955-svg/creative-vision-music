import { findUserBySessionToken, revokeUserSession, touchUserSession } from "./userStore.mjs";

function unauthorized(res, message) {
  return res.status(401).json({
    success: false,
    message,
  });
}

export function readAuthToken(req) {
  const authorization = String(req.headers.authorization || "").trim();

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return String(req.headers["x-cvm-token"] || "").trim();
}

export function getOptionalAuth(req) {
  const token = readAuthToken(req);

  if (!token) {
    return null;
  }

  const user = findUserBySessionToken(token);

  if (!user) {
    return {
      token,
      user: null,
      invalid: true,
    };
  }

  touchUserSession(token);

  return {
    token,
    user,
    invalid: false,
  };
}

export function requireAuth(req, res) {
  const auth = getOptionalAuth(req);

  if (!auth) {
    unauthorized(res, "请先登录。");
    return null;
  }

  if (auth.invalid || !auth.user) {
    unauthorized(res, "登录状态已失效，请重新登录。");
    return null;
  }

  return auth;
}

export function logoutAuthToken(req) {
  const token = readAuthToken(req);

  if (!token) {
    return false;
  }

  revokeUserSession(token);
  return true;
}
