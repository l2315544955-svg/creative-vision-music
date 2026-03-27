import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthDialog } from "../components/AuthDialog";
import type { AuthSessionPayload } from "../types";

interface LandingPageProps {
  isAuthenticated: boolean;
  canAccessConsole: boolean;
  onSignedIn: (payload: AuthSessionPayload) => void | Promise<void>;
}

const featureItems = ["文本创作", "模型切换", "任务追踪", "作品留存", "组织协作", "账号体系", "积分管理"];

export function LandingPage({
  isAuthenticated,
  canAccessConsole,
  onSignedIn,
}: LandingPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ideaPrompt, setIdeaPrompt] = useState("");
  const authMode = searchParams.get("auth");
  const redirect = searchParams.get("redirect") || "";
  const dialogMode = authMode === "register" ? "register" : authMode === "login" ? "login" : null;
  const primaryHref = isAuthenticated ? "/create" : "/login";
  const secondaryHref = isAuthenticated ? (canAccessConsole ? "/console" : "/works") : "/?auth=register";
  const secondaryLabel = isAuthenticated ? (canAccessConsole ? "组织管理" : "查看任务") : "注册";

  function buildCreatePath(promptValue: string) {
    const normalizedPrompt = promptValue.trim();

    if (!normalizedPrompt) {
      return "/create";
    }

    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set("prompt", normalizedPrompt);
    return `/create?${nextSearchParams.toString()}`;
  }

  function openDialog(mode: "login" | "register", nextRedirect?: string) {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("auth", mode);

    if (typeof nextRedirect === "string" && nextRedirect.length > 0) {
      nextSearchParams.set("redirect", nextRedirect);
    } else if (typeof nextRedirect === "string") {
      nextSearchParams.delete("redirect");
    }

    navigate(`/?${nextSearchParams.toString()}`);
  }

  function closeDialog() {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("auth");
    nextSearchParams.delete("redirect");
    const search = nextSearchParams.toString();
    navigate(search ? `/?${search}` : "/", { replace: true });
  }

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPath = buildCreatePath(ideaPrompt);

    if (isAuthenticated) {
      navigate(nextPath);
      return;
    }

    openDialog("login", nextPath);
  }

  return (
    <section className="landing-shell">
      <div className="landing-noise" aria-hidden="true" />

      <header className="landing-topbar">
        <Link className="landing-wordmark" to="/">
          <span className="landing-wordmark-mark">CVM</span>
          <span className="landing-wordmark-text">Creative Vision Music</span>
        </Link>

        <div className="landing-top-actions">
          {isAuthenticated ? (
            <>
              <Link className="landing-top-link" to={primaryHref}>
                创作台
              </Link>
              <Link className="landing-top-button" to={secondaryHref}>
                {secondaryLabel}
              </Link>
            </>
          ) : (
            <>
              <button className="landing-top-link" onClick={() => openDialog("login")} type="button">
                登录
              </button>
              <button
                className="landing-top-button"
                onClick={() => openDialog("register")}
                type="button"
              >
                注册
              </button>
            </>
          )}
        </div>
      </header>

      <div className="landing-content">
        <article className="landing-art-card landing-art-card-left">
          <div className="landing-art-cover landing-art-cover-left" />
          <div className="landing-art-meta">
            <strong>Nocturnal Drive</strong>
            <span>Lo-Fi Rocks</span>
          </div>
          <span className="landing-art-play" aria-hidden="true">
            ▶
          </span>
        </article>

        <main className="landing-center">
          <h1 aria-label="音乐创作 从灵感开始" className="landing-title">
            <span className="landing-title-primary">音乐创作</span>
            <span className="landing-title-secondary">从灵感开始</span>
          </h1>
          <p className="landing-description">
            登录后继续创作、查看任务，并按组织管理成员与点数。
          </p>

          <form className="landing-command" onSubmit={handleCommandSubmit}>
            <div className="landing-command-main">
              <input
                autoComplete="off"
                className="landing-command-input"
                onChange={(event) => setIdeaPrompt(event.target.value)}
                placeholder="输入一句灵感，进入创作台继续生成"
                value={ideaPrompt}
              />
              <div className="landing-command-tags">
                <span className="landing-command-tag">Suno 音乐</span>
                <span className="landing-command-tag">海螺音乐</span>
              </div>
            </div>
            <div className="landing-command-actions">
              {isAuthenticated ? (
                <button className="landing-create-button" type="submit">
                  进入创作台
                </button>
              ) : (
                <button className="landing-create-button" type="submit">
                  开始创作
                </button>
              )}
            </div>
          </form>
        </main>

        <article className="landing-art-card landing-art-card-right">
          <div className="landing-art-cover landing-art-cover-right" />
          <div className="landing-art-meta">
            <strong>Ride to Sunset</strong>
            <span>Midnight Session</span>
          </div>
          <span className="landing-art-play" aria-hidden="true">
            ▶
          </span>
        </article>
      </div>

      <footer className="landing-logo-strip" aria-label="product capabilities">
        {featureItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </footer>

      {dialogMode ? (
        <AuthDialog
          mode={dialogMode}
          onClose={closeDialog}
          onModeChange={(mode) => openDialog(mode, redirect)}
          onSignedIn={onSignedIn}
          redirect={redirect}
        />
      ) : null}
    </section>
  );
}
