import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { login, register } from "../lib/api";
import type { AuthSessionPayload } from "../types";

type AuthMode = "login" | "register";

function resolvePostLoginPath(payload: AuthSessionPayload, redirect: string) {
  if (redirect) {
    return redirect;
  }

  return payload.user.roleCode === "super_admin" ? "/console" : "/create";
}

interface AuthDialogProps {
  mode: AuthMode;
  redirect?: string;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  onSignedIn: (payload: AuthSessionPayload) => void | Promise<void>;
}

export function AuthDialog({
  mode,
  redirect = "",
  onClose,
  onModeChange,
  onSignedIn,
}: AuthDialogProps) {
  const navigate = useNavigate();
  const [accountKey, setAccountKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    if (mode === "register" && password !== confirmPassword) {
      setBusy(false);
      setMessage("两次输入的密码不一致。");
      return;
    }

    try {
      const payload =
        mode === "login"
          ? await login({
              accountKey,
              password,
            })
          : await register({
              accountKey,
              displayName,
              password,
            });

      await onSignedIn(payload);
      navigate(resolvePostLoginPath(payload, redirect), { replace: true });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing-auth-backdrop" onClick={onClose}>
      <section
        className="studio-card landing-auth-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Account Access</p>
            <h2>{mode === "login" ? "登录工作台" : "注册账号"}</h2>
          </div>
          <button className="ghost-button landing-auth-close" onClick={onClose} type="button">
            关闭
          </button>
        </div>

        <p className="landing-auth-copy">
          {mode === "login"
            ? "使用账号密码进入创作工作台，继续当前账号的创作与任务流程。"
            : "注册后即可进入工作台并开始创作。"}
        </p>

        <div className="landing-auth-mode-row">
          <button
            className={mode === "login" ? "landing-auth-mode-button active" : "landing-auth-mode-button"}
            onClick={() => onModeChange("login")}
            type="button"
          >
            登录
          </button>
          <button
            className={
              mode === "register" ? "landing-auth-mode-button active" : "landing-auth-mode-button"
            }
            onClick={() => onModeChange("register")}
            type="button"
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label>账号</label>
            <input
              autoComplete="username"
              value={accountKey}
              onChange={(event) => setAccountKey(event.target.value)}
              placeholder="例如：night-studio"
            />
          </div>

          {mode === "register" ? (
            <div className="field-group">
              <label>显示名称</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：夜航音乐"
              />
            </div>
          ) : null}

          <div className="field-group">
            <label>密码</label>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
            />
          </div>

          {mode === "register" ? (
            <div className="field-group">
              <label>确认密码</label>
              <input
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
              />
            </div>
          ) : null}

          <div className="action-row">
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "提交中..." : mode === "login" ? "登录" : "注册并进入"}
            </button>
            <p className="hint-text">
              {mode === "login"
                ? "登录后会恢复当前账号的工作区、组织与点数信息。"
                : "注册成功后会自动进入对应工作台。"}
            </p>
          </div>
        </form>

        {message ? <div className="status-banner">{message}</div> : null}
      </section>
    </div>
  );
}
