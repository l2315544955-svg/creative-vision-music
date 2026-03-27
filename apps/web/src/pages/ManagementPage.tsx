import { FormEvent, useEffect, useState } from "react";

import {
  adjustConsoleCredits,
  createConsoleAccount,
  createConsoleOrganization,
  fetchConsoleBootstrap,
} from "../lib/api";
import type {
  AuthUser,
  ConsoleBootstrapData,
  OrganizationSummary,
  PermissionSummary,
} from "../types";

interface ManagementPageProps {
  currentUser: AuthUser;
  currentOrganization: OrganizationSummary | null;
  permissions: PermissionSummary;
}

const initialOrganizationForm = {
  name: "",
  code: "",
  ownerAccountKey: "",
  ownerDisplayName: "",
  ownerPassword: "",
  initialCredits: "0",
};

const initialMemberForm = {
  organizationId: "",
  accountKey: "",
  displayName: "",
  password: "",
  initialCredits: "0",
};

function toNumberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleHint(roleCode: string) {
  if (roleCode === "org_owner") {
    return "一级账号";
  }

  if (roleCode === "org_member") {
    return "二级账号";
  }

  if (roleCode === "super_admin") {
    return "超管";
  }

  return "普通账号";
}

export function ManagementPage({
  currentUser,
  currentOrganization,
  permissions,
}: ManagementPageProps) {
  const [consoleData, setConsoleData] = useState<ConsoleBootstrapData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [organizationForm, setOrganizationForm] = useState(initialOrganizationForm);
  const [memberForm, setMemberForm] = useState({
    ...initialMemberForm,
    organizationId: currentOrganization?.id || "",
  });
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [creditNotes, setCreditNotes] = useState<Record<string, string>>({});

  function applyConsoleData(data: ConsoleBootstrapData, options?: { preferredOrganizationId?: string }) {
    setConsoleData(data);
    setMemberForm((current) => ({
      ...current,
      organizationId:
        options?.preferredOrganizationId ||
        current.organizationId ||
        data.organization?.id ||
        data.organizations[0]?.id ||
        "",
    }));
  }

  async function loadConsole() {
    setLoading(true);

    try {
      const payload = await fetchConsoleBootstrap();
      applyConsoleData(payload);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConsole().catch(() => {
      // loadConsole already writes the message.
    });
  }, []);

  async function handleCreateOrganization(event: FormEvent) {
    event.preventDefault();
    setBusyKey("organization");
    setMessage("");

    try {
      const payload = await createConsoleOrganization({
        name: organizationForm.name,
        code: organizationForm.code || undefined,
        ownerAccountKey: organizationForm.ownerAccountKey,
        ownerDisplayName: organizationForm.ownerDisplayName,
        ownerPassword: organizationForm.ownerPassword,
        initialCredits: toNumberOrZero(organizationForm.initialCredits),
      });

      applyConsoleData(payload.console, {
        preferredOrganizationId: payload.organization.id,
      });
      setOrganizationForm(initialOrganizationForm);
      setMessage(`组织 ${payload.organization.name} 与一级账号 ${payload.owner.accountKey} 已创建。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyKey("");
    }
  }

  async function handleCreateMember(event: FormEvent) {
    event.preventDefault();
    setBusyKey("member");
    setMessage("");

    try {
      const payload = await createConsoleAccount({
        organizationId: memberForm.organizationId || undefined,
        roleCode: "org_member",
        accountKey: memberForm.accountKey,
        displayName: memberForm.displayName,
        password: memberForm.password,
        initialCredits: toNumberOrZero(memberForm.initialCredits),
      });

      applyConsoleData(payload.console, {
        preferredOrganizationId: payload.user.organizationId,
      });
      setMemberForm((current) => ({
        ...initialMemberForm,
        organizationId: current.organizationId || payload.user.organizationId || "",
      }));
      setMessage(`二级账号 ${payload.user.accountKey} 已创建。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyKey("");
    }
  }

  async function handleAdjustCredits(userId: string, direction: "plus" | "minus") {
    const rawValue = creditAmounts[userId] || "0";
    const value = Math.abs(Number(rawValue || 0));

    if (!Number.isFinite(value) || value <= 0) {
      setMessage("请先输入大于 0 的积分数值。");
      return;
    }

    setBusyKey(`credit:${userId}`);
    setMessage("");

    try {
      const payload = await adjustConsoleCredits({
        targetUserId: userId,
        amount: direction === "plus" ? value : -value,
        note: creditNotes[userId] || undefined,
      });

      applyConsoleData(payload.console);
      setCreditAmounts((current) => ({
        ...current,
        [userId]: "",
      }));
      setCreditNotes((current) => ({
        ...current,
        [userId]: "",
      }));
      setMessage(
        `${payload.user.displayName} 已${direction === "plus" ? "增加" : "扣减"} ${value} 积分。`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyKey("");
    }
  }

  const scopedOrganization = consoleData?.organization || currentOrganization;
  const visibleOrganizations = consoleData?.organizations || (scopedOrganization ? [scopedOrganization] : []);

  return (
    <div className="console-shell">
      <section className="studio-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Organization Management</p>
            <h2>组织与点数管理</h2>
          </div>
          <button className="ghost-button" onClick={() => loadConsole()} type="button">
            刷新数据
          </button>
        </div>

        <div className="summary-strip">
          <article className="summary-tile">
            <span>当前账号</span>
            <strong>{currentUser.displayName}</strong>
            <small>
              @{currentUser.accountKey} · {currentUser.roleLabel}
            </small>
          </article>
          <article className="summary-tile">
            <span>组织数量</span>
            <strong>{consoleData?.summary.organizationCount ?? visibleOrganizations.length}</strong>
            <small>{permissions.canManageOrganizations ? "超管可查看全部组织" : "当前组织视角"}</small>
          </article>
          <article className="summary-tile">
            <span>可管理账号</span>
            <strong>{consoleData?.summary.managedUserCount ?? 0}</strong>
            <small>支持手动加减点数</small>
          </article>
          <article className="summary-tile">
            <span>总积分池</span>
            <strong>{consoleData?.summary.totalManagedCredits ?? 0}</strong>
            <small>按当前可管理账号汇总</small>
          </article>
        </div>

        {message ? <div className="status-banner">{message}</div> : null}
      </section>

      <div className="console-grid">
        <section className="studio-card console-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Structure</p>
              <h3>组织与账号创建</h3>
            </div>
          </div>

          <div className="rule-list">
            <div>
              <strong>超管</strong>
              <p>唯一平台账号，创建组织和一级账号。</p>
            </div>
            <div>
              <strong>一级账号</strong>
              <p>组织负责人，创建二级账号并调整成员积分。</p>
            </div>
            <div>
              <strong>普通账号</strong>
              <p>用户自注册登录，直接进入创作台，不属于组织管理链路。</p>
            </div>
          </div>

          {permissions.canManageOrganizations ? (
            <form className="form-stack" onSubmit={handleCreateOrganization}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Super Admin</p>
                  <h3>创建组织 + 一级账号</h3>
                </div>
              </div>

              <div className="field-group">
                <label>组织名称</label>
                <input
                  value={organizationForm.name}
                  onChange={(event) =>
                    setOrganizationForm({ ...organizationForm, name: event.target.value })
                  }
                  placeholder="例如：星河内容中心"
                />
              </div>

              <div className="field-group">
                <label>组织编码</label>
                <input
                  value={organizationForm.code}
                  onChange={(event) =>
                    setOrganizationForm({ ...organizationForm, code: event.target.value })
                  }
                  placeholder="可选，例如：galaxy-media"
                />
              </div>

              <div className="field-group">
                <label>一级账号</label>
                <input
                  value={organizationForm.ownerAccountKey}
                  onChange={(event) =>
                    setOrganizationForm({
                      ...organizationForm,
                      ownerAccountKey: event.target.value,
                    })
                  }
                  placeholder="例如：galaxy_owner"
                />
              </div>

              <div className="field-group">
                <label>一级账号显示名</label>
                <input
                  value={organizationForm.ownerDisplayName}
                  onChange={(event) =>
                    setOrganizationForm({
                      ...organizationForm,
                      ownerDisplayName: event.target.value,
                    })
                  }
                  placeholder="例如：星河内容中心负责人"
                />
              </div>

              <div className="field-group">
                <label>一级账号密码</label>
                <input
                  type="password"
                  value={organizationForm.ownerPassword}
                  onChange={(event) =>
                    setOrganizationForm({
                      ...organizationForm,
                      ownerPassword: event.target.value,
                    })
                  }
                  placeholder="至少 6 位"
                />
              </div>

              <div className="field-group">
                <label>初始积分</label>
                <input
                  value={organizationForm.initialCredits}
                  onChange={(event) =>
                    setOrganizationForm({
                      ...organizationForm,
                      initialCredits: event.target.value,
                    })
                  }
                  placeholder="例如：200"
                />
              </div>

              <button className="primary-button" disabled={busyKey === "organization"} type="submit">
                {busyKey === "organization" ? "创建中..." : "创建组织与一级账号"}
              </button>
            </form>
          ) : null}

          {permissions.canCreateOrgMember ? (
            <form className="form-stack" onSubmit={handleCreateMember}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Organization</p>
                  <h3>创建二级账号</h3>
                </div>
              </div>

              <div className="field-group">
                <label>所属组织</label>
                <select
                  value={memberForm.organizationId}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, organizationId: event.target.value })
                  }
                >
                  {visibleOrganizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label>二级账号</label>
                <input
                  value={memberForm.accountKey}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, accountKey: event.target.value })
                  }
                  placeholder="例如：galaxy_editor_01"
                />
              </div>

              <div className="field-group">
                <label>显示名称</label>
                <input
                  value={memberForm.displayName}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, displayName: event.target.value })
                  }
                  placeholder="例如：银河编辑一号"
                />
              </div>

              <div className="field-group">
                <label>密码</label>
                <input
                  type="password"
                  value={memberForm.password}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, password: event.target.value })
                  }
                  placeholder="至少 6 位"
                />
              </div>

              <div className="field-group">
                <label>初始积分</label>
                <input
                  value={memberForm.initialCredits}
                  onChange={(event) =>
                    setMemberForm({ ...memberForm, initialCredits: event.target.value })
                  }
                  placeholder="例如：80"
                />
              </div>

              <button className="primary-button" disabled={busyKey === "member"} type="submit">
                {busyKey === "member" ? "创建中..." : "创建二级账号"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="studio-card console-panel console-panel-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Accounts</p>
              <h3>账号列表与积分调整</h3>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <h3>正在加载组织数据</h3>
              <p>读取组织、成员和积分账户。</p>
            </div>
          ) : consoleData?.managedUsers.length ? (
            <div className="member-table">
              {consoleData.managedUsers.map((item) => (
                <article className="member-row" key={item.id}>
                  <div className="member-main">
                    <strong>{item.displayName}</strong>
                    <span>
                      @{item.accountKey} · {item.roleLabel} / {roleHint(item.roleCode)}
                    </span>
                    <small>{item.organizationName || "独立账号"}</small>
                  </div>

                  <div className="member-metric">
                    <span>总额</span>
                    <strong>{item.credits.balance}</strong>
                  </div>

                  <div className="member-metric">
                    <span>可用</span>
                    <strong>{item.credits.availableBalance}</strong>
                  </div>

                  <div className="member-metric">
                    <span>冻结</span>
                    <strong>{item.credits.frozenBalance}</strong>
                  </div>

                  {permissions.canManageCredits ? (
                    <div className="credit-actions">
                      <input
                        className="inline-input"
                        value={creditAmounts[item.id] || ""}
                        onChange={(event) =>
                          setCreditAmounts((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="积分数值"
                      />
                      <input
                        className="inline-input"
                        value={creditNotes[item.id] || ""}
                        onChange={(event) =>
                          setCreditNotes((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="备注，可为空"
                      />
                      <button
                        className="secondary-button"
                        disabled={busyKey === `credit:${item.id}`}
                        onClick={() => handleAdjustCredits(item.id, "plus")}
                        type="button"
                      >
                        加积分
                      </button>
                      <button
                        className="ghost-button"
                        disabled={busyKey === `credit:${item.id}`}
                        onClick={() => handleAdjustCredits(item.id, "minus")}
                        type="button"
                      >
                        扣积分
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>当前没有可管理账号</h3>
              <p>先创建组织或组织成员，再在这里统一调整积分。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
