import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { fetchCurrentUser, fetchMyCredits, logout } from "./lib/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "./lib/auth";
import { CheckoutResultPage } from "./pages/CheckoutResultPage";
import { CreatePage } from "./pages/CreatePage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagementPage } from "./pages/ManagementPage";
import { WorksPage } from "./pages/WorksPage";
import type {
  AuthSessionPayload,
  AuthUser,
  CreditAccountSummary,
  OrganizationSummary,
  PermissionSummary,
} from "./types";

export function App() {
  const location = useLocation();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationSummary | null>(null);
  const [permissions, setPermissions] = useState<PermissionSummary | null>(null);
  const [credits, setCredits] = useState<CreditAccountSummary | null>(null);

  const isPublicRoute = location.pathname === "/" || location.pathname === "/login";
  const isWorkspaceRoute =
    location.pathname === "/create" ||
    location.pathname === "/works" ||
    location.pathname === "/console";

  async function refreshCredits() {
    const token = getAuthToken();

    if (!token) {
      setCredits(null);
      return null;
    }

    const summary = await fetchMyCredits();
    setCredits(summary);
    return summary;
  }

  useEffect(() => {
    async function hydrateSession() {
      const token = getAuthToken();

      if (!token) {
        setAuthReady(true);
        return;
      }

      try {
        const [{ user, organization, permissions: nextPermissions }, creditSummary] = await Promise.all([
          fetchCurrentUser(),
          fetchMyCredits(),
        ]);
        setCurrentUser(user);
        setCurrentOrganization(organization);
        setPermissions(nextPermissions);
        setCredits(creditSummary);
      } catch {
        clearAuthToken();
        setCurrentUser(null);
        setCurrentOrganization(null);
        setPermissions(null);
        setCredits(null);
      } finally {
        setAuthReady(true);
      }
    }

    hydrateSession();
  }, []);

  async function handleSignedIn(payload: AuthSessionPayload) {
    setAuthToken(payload.token);
    setCurrentUser(payload.user);
    setCurrentOrganization(payload.organization);
    setPermissions(payload.permissions);
    setCredits(payload.credits);
    setAuthReady(true);
  }

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // Ignore logout errors and clear the local session anyway.
    }

    clearAuthToken();
    setCurrentUser(null);
    setCurrentOrganization(null);
    setPermissions(null);
    setCredits(null);
    setAuthReady(true);
  }

  return (
    <div
      className={
        isPublicRoute
          ? "app-shell public-shell"
          : isWorkspaceRoute
            ? "app-shell workspace-shell"
            : "app-shell"
      }
    >
      {!isPublicRoute ? (
        <header className={isWorkspaceRoute ? "topbar workspace-topbar" : "topbar"}>
          <Link className="brand-block" to="/">
            <div className="brand-mark">CVM</div>
            <div>
              <p className="eyebrow">AI Music Studio</p>
              <h1>Creative Vision Music</h1>
            </div>
          </Link>

          <div className="topbar-panel">
            <nav className="nav-tabs" aria-label="Primary">
              <NavLink
                className={({ isActive }) => (isActive ? "nav-tab active" : "nav-tab")}
                to="/create"
              >
                创作台
              </NavLink>
              <NavLink
                className={({ isActive }) => (isActive ? "nav-tab active" : "nav-tab")}
                to="/works"
              >
                任务与作品
              </NavLink>
              {permissions?.canAccessConsole ? (
                <NavLink
                  className={({ isActive }) => (isActive ? "nav-tab active" : "nav-tab")}
                  to="/console"
                >
                  组织管理
                </NavLink>
              ) : null}
            </nav>

            <div className="topbar-actions">
              {currentUser ? (
                <>
                  {credits ? (
                    <div className="account-pill">
                      <span>可用积分</span>
                      <strong>{credits.availableBalance}</strong>
                      <small>
                        冻结 {credits.frozenBalance} / 总额 {credits.balance}
                      </small>
                    </div>
                  ) : null}
                  <div className="account-pill">
                    <span>{currentUser.displayName}</span>
                    <strong>{currentUser.roleLabel}</strong>
                    <small>{currentOrganization?.name || `@${currentUser.accountKey}`}</small>
                  </div>
                  <button className="ghost-button" onClick={handleSignOut} type="button">
                    退出
                  </button>
                </>
              ) : (
                <Link className="ghost-link" to="/login">
                  登录
                </Link>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main
        className={
          isPublicRoute
            ? "page-frame public-frame"
            : isWorkspaceRoute
              ? "page-frame workspace-frame"
              : "page-frame"
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                canAccessConsole={Boolean(permissions?.canAccessConsole)}
                isAuthenticated={Boolean(currentUser)}
                onSignedIn={handleSignedIn}
              />
            }
          />
          <Route
            path="/login"
            element={
              <LoginPage isAuthenticated={Boolean(currentUser)} />
            }
          />
          <Route
            path="/create"
            element={
              <RequireAuth isReady={authReady} user={currentUser}>
                {currentUser && permissions ? (
                  <CreatePage
                    onCreditsChanged={refreshCredits}
                  />
                ) : null}
              </RequireAuth>
            }
          />
          <Route
            path="/works"
            element={
              <RequireAuth isReady={authReady} user={currentUser}>
                <WorksPage onCreditsChanged={refreshCredits} />
              </RequireAuth>
            }
          />
          <Route
            path="/console"
            element={
              <RequireConsoleAccess
                isReady={authReady}
                permissions={permissions}
                user={currentUser}
              >
                {currentUser && permissions ? (
                  <ManagementPage
                    currentOrganization={currentOrganization}
                    currentUser={currentUser}
                    permissions={permissions}
                  />
                ) : null}
              </RequireConsoleAccess>
            }
          />
          <Route path="/checkout/result" element={<CheckoutResultPage />} />
        </Routes>
      </main>
    </div>
  );
}

function RequireAuth({
  children,
  isReady,
  user,
}: {
  children: ReactNode;
  isReady: boolean;
  user: AuthUser | null;
}) {
  const location = useLocation();

  if (!isReady) {
    return (
      <section className="studio-card loading-card">
        <div>
          <p className="eyebrow">Session</p>
          <h2>正在确认登录状态</h2>
          <p className="hint-text">准备用户上下文后再进入创作和任务页面。</p>
        </div>
      </section>
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate replace to={`/login?redirect=${encodeURIComponent(redirect)}`} />;
  }

  return children;
}

function RequireConsoleAccess({
  children,
  isReady,
  permissions,
  user,
}: {
  children: ReactNode;
  isReady: boolean;
  permissions: PermissionSummary | null;
  user: AuthUser | null;
}) {
  if (!isReady) {
    return (
      <section className="studio-card loading-card">
        <div>
          <p className="eyebrow">Console</p>
          <h2>正在加载组织管理权限</h2>
          <p className="hint-text">确认当前账号角色与组织范围。</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return <Navigate replace to="/login?redirect=%2Fconsole" />;
  }

  if (!permissions?.canAccessConsole) {
    return <Navigate replace to="/create" />;
  }

  return children;
}
