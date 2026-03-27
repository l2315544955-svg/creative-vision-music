import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { MusicIdeationAssistant } from "../components/MusicIdeationAssistant";
import {
  type ApiRequestError,
  createMusicTask,
  fetchBootstrap,
  fetchMyMusicTasks,
  fetchMyMusicWorks,
  precheckBilling,
  refreshMyMusicTask,
} from "../lib/api";
import type {
  BootstrapResponse,
  CreditAccountSummary,
  CreditPrecheck,
  PricingItem,
  StoredTask,
  SunoVersion,
  WorkItem,
} from "../types";

type Mode = "inspiration" | "custom";
type Provider = "suno" | "minimax";

const initialState = {
  title: "",
  tags: "cinematic pop, female vocal, emotional chorus",
  lyrics: "",
  inspiration: "写一首关于夜晚城市灯光与迟来热爱的流行抒情歌。",
  negativeTags: "",
  continuationTaskId: "",
  continuationClipId: "",
  continuationTime: "",
  instrumental: false,
  minimaxPrompt: "独立民谣,温暖,夜晚散步,柔和木吉他,都市回忆",
};

function getStatusTone(status: string) {
  const value = status.toUpperCase();

  if (value.includes("SUCCESS")) {
    return "success";
  }

  if (value.includes("FAIL") || value.includes("ERROR")) {
    return "danger";
  }

  if (
    value.includes("SUBMITTED") ||
    value.includes("PENDING") ||
    value.includes("RUNNING") ||
    value.includes("PROCESS")
  ) {
    return "pending";
  }

  return "neutral";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString();
}

function isCreditPrecheckDetail(detail: unknown): detail is CreditPrecheck {
  return Boolean(
    detail &&
      typeof detail === "object" &&
      "requiredCredits" in detail &&
      "missingCredits" in detail &&
      "account" in detail,
  );
}

export function CreatePage({
  onCreditsChanged,
}: {
  onCreditsChanged: () => Promise<CreditAccountSummary | null>;
}) {
  const [searchParams] = useSearchParams();
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [provider, setProvider] = useState<Provider>("suno");
  const [mode, setMode] = useState<Mode>("inspiration");
  const [sunoVersion, setSunoVersion] = useState("chirp-crow");
  const [minimaxModel, setMinimaxModel] = useState("music-1.5");
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [busyAction, setBusyAction] = useState<"music" | "refresh" | "">("");
  const [sidePanel, setSidePanel] = useState<"activity" | "assistant">("activity");
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const promptPrefill = searchParams.get("prompt")?.trim() || "";
  const selectedSunoVersion =
    bootstrap?.sunoVersions.find((item) => item.code === sunoVersion) || null;

  const selectedPricing =
    provider === "suno"
      ? bootstrap?.pricingCatalog.find((item) => item.code === "suno_music") || null
      : bootstrap?.pricingCatalog.find((item) => item.code === minimaxModel) || null;
  const assistantRuntimeConfigured = Boolean(bootstrap?.runtime?.configured);
  const assistantRuntimeModel = bootstrap?.runtime?.chatModel || "deepseek-v3.2";
  const selectedModelLabel =
    provider === "suno" ? selectedSunoVersion?.label || sunoVersion : minimaxModel;
  const activeWorkflowLabel =
    provider === "suno" ? (mode === "inspiration" ? "灵感模式" : "固定歌词") : "中文直出";
  const pricingLabel = selectedPricing
    ? `${selectedPricing.price} 积分 / ${selectedPricing.unit}`
    : "等待计费信息";
  const pendingTaskCount = tasks.filter((item) => getStatusTone(item.status) === "pending").length;
  const successfulTaskCount = tasks.filter((item) => getStatusTone(item.status) === "success").length;
  const playableWorkCount = works.filter((item) => Boolean(item.audioUrl)).length;
  const assistantContext = {
    provider,
    mode,
    model: selectedModelLabel,
    title: form.title,
    tags: form.tags,
    negativeTags: form.negativeTags,
    instrumental: form.instrumental,
    inspiration: form.inspiration,
    lyrics: form.lyrics,
    minimaxPrompt: form.minimaxPrompt,
  };

  async function loadActivity(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setActivityLoading(true);
    }

    try {
      const [taskItems, workItems] = await Promise.all([fetchMyMusicTasks(), fetchMyMusicWorks()]);
      setTasks(taskItems);
      setWorks(workItems);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (!options?.silent) {
        setActivityLoading(false);
      }
    }
  }

  useEffect(() => {
    fetchBootstrap()
      .then((payload) => {
        setBootstrap(payload);

        if (payload.sunoVersions.length > 0) {
          setSunoVersion((current) =>
            payload.sunoVersions.some((item) => item.code === current)
              ? current
              : payload.sunoVersions[0].code,
          );
        }
      })
      .catch((error: Error) => setMessage(error.message));

    loadActivity().catch(() => {
      // loadActivity already writes the error message.
    });
  }, []);

  useEffect(() => {
    if (!promptPrefill) {
      return;
    }

    setProvider("suno");
    setMode("inspiration");
    setForm((current) => {
      if (
        current.inspiration === promptPrefill &&
        current.minimaxPrompt === promptPrefill
      ) {
        return current;
      }

      return {
        ...current,
        inspiration: promptPrefill,
        minimaxPrompt: promptPrefill,
      };
    });
  }, [promptPrefill]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast("");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  async function ensureCreditsOrExplain(payload: {
    pricingCode?: string;
    provider?: string;
    taskType?: string;
    modelCode?: string;
  }) {
    const precheck = await precheckBilling(payload);

    if (precheck.sufficient) {
      return true;
    }

    await onCreditsChanged();
    setMessage(
      `当前可用 ${precheck.account.availableBalance} 积分，本次需要 ${precheck.requiredCredits} 积分，还差 ${precheck.missingCredits} 积分。请联系管理员补充分配点数。`,
    );
    return false;
  }

  function handleGenerationError(error: unknown) {
    const apiError = error as ApiRequestError;

    if (apiError.statusCode === 402 && isCreditPrecheckDetail(apiError.detail)) {
      setMessage(
        `积分不足：可用 ${apiError.detail.account.availableBalance}，需要 ${apiError.detail.requiredCredits}。请联系管理员补充分配点数。`,
      );
      return;
    }

    setMessage(apiError.message || "请求失败。");
  }

  async function handleMusicGenerate(event: FormEvent) {
    event.preventDefault();
    setBusyAction("music");
    setMessage("");

    try {
      if (provider === "suno") {
        const canProceed = await ensureCreditsOrExplain({
          provider: "suno",
          taskType: "music",
          modelCode: sunoVersion,
        });

        if (!canProceed) {
          return;
        }

        const payload = await createMusicTask({
          provider: "suno",
          mode,
          mv: sunoVersion,
          title: form.title || "未命名歌曲",
          tags: form.tags,
          prompt: mode === "inspiration" ? form.inspiration : form.lyrics,
          instrumental: form.instrumental,
          negativeTags: form.negativeTags,
          continuation: {
            taskId: form.continuationTaskId,
            clipId: form.continuationClipId,
            continueAt: form.continuationTime,
          },
        });

        await Promise.all([onCreditsChanged(), loadActivity({ silent: true })]);
        setMessage(`Suno 任务已提交，任务号：${payload.taskId || "已创建"}。`);
      } else {
        const canProceed = await ensureCreditsOrExplain({
          provider: "minimax",
          taskType: "music",
          modelCode: minimaxModel,
        });

        if (!canProceed) {
          return;
        }

        const payload = await createMusicTask({
          provider: "minimax",
          title: form.title || "未命名歌曲",
          model: minimaxModel,
          prompt: form.minimaxPrompt,
          lyrics: form.lyrics,
          audio: {
            sampleRate: 44100,
            bitrate: 256000,
            format: "mp3",
          },
        });

        await Promise.all([onCreditsChanged(), loadActivity({ silent: true })]);
        setMessage(
          payload.audioUrl
            ? "海螺音乐已返回可播放结果。"
            : "海螺音乐任务已提交，结果会出现在右侧任务流。",
        );
      }
    } catch (error) {
      handleGenerationError(error);
    } finally {
      setBusyAction("");
    }
  }

  async function handleRefreshTask(taskId: string) {
    setBusyAction("refresh");
    setMessage("");

    try {
      await refreshMyMusicTask(taskId);
      await Promise.all([onCreditsChanged(), loadActivity({ silent: true })]);
      setToast("任务状态已刷新");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="workspace-grid create-workspace-grid">
      {toast ? <div className="workspace-toast">{toast}</div> : null}

      <aside className="workspace-column workspace-rail">
        <section className="studio-card rail-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Creative Tools</p>
              <h3>创作功能</h3>
            </div>
          </div>

          <div className="workspace-menu">
            <button
              className={provider === "suno" ? "workspace-menu-item active" : "workspace-menu-item"}
              onClick={() => setProvider("suno")}
              type="button"
            >
              <strong>Suno 创作</strong>
              <span>主路径，支持灵感模式和固定歌词。</span>
            </button>
            <button
              className={
                provider === "minimax" ? "workspace-menu-item active" : "workspace-menu-item"
              }
              onClick={() => setProvider("minimax")}
              type="button"
            >
              <strong>海螺音乐</strong>
              <span>适合中文描述直出音乐与试听结果。</span>
            </button>
            <button
              className={
                sidePanel === "assistant" ? "workspace-menu-item active" : "workspace-menu-item"
              }
              onClick={() =>
                setSidePanel((current) => (current === "assistant" ? "activity" : "assistant"))
              }
              type="button"
            >
              <strong>AI灵感音乐助手</strong>
              <span>
                {sidePanel === "assistant"
                  ? "当前已切到助手面板，再点一次即可回到任务与作品。"
                  : "切到右侧助手面板，流式生成音乐关键词、结构和负向词。"}
              </span>
            </button>
          </div>
        </section>
      </aside>

      <section className="workspace-column workspace-main">
        <section className="studio-card studio-card-large create-panel">
          <div className="create-toolbar">
            <div className="create-toolbar-copy">
              <p className="eyebrow">Create Workspace</p>
              <h2>创作参数</h2>
              <p className="create-toolbar-note">一屏完成模型选择、参数填写和提交。</p>
            </div>

            <div className="create-toolbar-actions">
              <div className="create-toolbar-badges">
                <span className="selection-badge">{selectedModelLabel}</span>
                <span className="selection-badge">{activeWorkflowLabel}</span>
                <span className="selection-badge">{pricingLabel}</span>
              </div>
            </div>
          </div>

          <form className="composer-grid create-compact-form" onSubmit={handleMusicGenerate}>
            <section className="composer-panel create-compact-section create-section-core create-section-tight">
              <div className="create-section-heading">
                <h3>核心参数</h3>
              </div>

              <div className="field-stack compact-field-stack">
                <div className="create-field-grid create-field-grid-controls">
                  {provider === "suno" ? (
                    <>
                      <div className="field-group">
                        <label htmlFor="suno-version">Suno 版本</label>
                        <select
                          id="suno-version"
                          value={sunoVersion}
                          onChange={(event) => setSunoVersion(event.target.value)}
                        >
                          {(bootstrap?.sunoVersions || []).map((version: SunoVersion) => (
                            <option key={version.code} value={version.code}>
                              {version.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field-group">
                        <label>创作模式</label>
                        <div className="choice-row compact-choice-row">
                          <button
                            className={mode === "inspiration" ? "choice-pill active" : "choice-pill"}
                            onClick={() => setMode("inspiration")}
                            type="button"
                          >
                            灵感模式
                          </button>
                          <button
                            className={mode === "custom" ? "choice-pill active" : "choice-pill"}
                            onClick={() => setMode("custom")}
                            type="button"
                          >
                            固定歌词
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="field-group">
                      <label>海螺模型</label>
                      <div className="choice-row compact-choice-row">
                        <button
                          className={minimaxModel === "music-1.5" ? "choice-pill active" : "choice-pill"}
                          onClick={() => setMinimaxModel("music-1.5")}
                          type="button"
                        >
                          music-1.5
                        </button>
                        <button
                          className={minimaxModel === "music-2.0" ? "choice-pill active" : "choice-pill"}
                          onClick={() => setMinimaxModel("music-2.0")}
                          type="button"
                        >
                          music-2.0
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="field-group">
                  <div className="field-heading">
                    <label htmlFor="song-title">歌曲标题</label>
                    <span>会显示在任务与作品列表。</span>
                  </div>
                  <input
                    id="song-title"
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="例如：Midnight Afterglow"
                  />
                </div>

                {provider === "suno" ? (
                  <>
                    <div className="create-field-grid create-field-grid-balanced">
                      <div className="field-group">
                        <div className="field-heading">
                          <label htmlFor="song-tags">风格标签</label>
                          <span>用半角逗号分隔风格和乐器。</span>
                        </div>
                        <input
                          id="song-tags"
                          value={form.tags}
                          onChange={(event) => setForm({ ...form, tags: event.target.value })}
                          placeholder="例如：cinematic pop, female vocal, emotional chorus"
                        />
                      </div>

                      <div className="field-group">
                        <div className="field-heading">
                          <label htmlFor="song-negative-tags">负向风格</label>
                          <span>不想出现的音色和编曲倾向。</span>
                        </div>
                        <input
                          id="song-negative-tags"
                          value={form.negativeTags}
                          onChange={(event) => setForm({ ...form, negativeTags: event.target.value })}
                          placeholder="例如：no trap, no distortion"
                        />
                      </div>
                    </div>

                    <label className="toggle-row compact-toggle-row">
                      <input
                        checked={form.instrumental}
                        onChange={(event) =>
                          setForm({ ...form, instrumental: event.target.checked })
                        }
                        type="checkbox"
                      />
                      纯音乐
                    </label>
                  </>
                ) : (
                  <p className="compact-note">海螺音乐建议把风格重点写进下方“音乐描述”，歌词保留在右侧主编辑区。</p>
                )}
              </div>
            </section>

            {provider === "suno" ? (
              <section className="composer-panel create-compact-section create-section-writing">
                <div className="create-section-heading">
                  <h3>{mode === "inspiration" ? "灵感主编辑区" : "歌词主编辑区"}</h3>
                  <p>
                    {mode === "inspiration"
                      ? "主题、情绪、画面和乐器集中写在这里，右侧优先保留更大编辑面积。"
                      : "完整歌词放到主编辑区，提交前不用来回滚动。"}
                  </p>
                </div>

                {mode === "inspiration" ? (
                  <div className="field-group create-text-field">
                    <textarea
                      id="song-inspiration"
                      rows={12}
                      value={form.inspiration}
                      onChange={(event) => setForm({ ...form, inspiration: event.target.value })}
                      placeholder="描述主题、情绪、场景、节奏、乐器和画面。"
                    />
                    <p className="field-note">需要细化标签、负向词或结构时，可直接打开左侧 AI 灵感音乐助手。</p>
                  </div>
                ) : (
                  <div className="field-group create-text-field">
                    <textarea
                      id="song-lyrics"
                      rows={12}
                      value={form.lyrics}
                      onChange={(event) => setForm({ ...form, lyrics: event.target.value })}
                      placeholder="固定歌词模式下直接输入完整歌词。"
                    />
                  </div>
                )}
              </section>
            ) : (
              <section className="composer-panel create-compact-section create-section-writing">
                <div className="create-section-heading">
                  <h3>歌词主编辑区</h3>
                  <p>歌词放到右侧大编辑区，方便完整预览段落结构和押韵。</p>
                </div>

                <div className="field-group create-text-field">
                  <textarea
                    id="minimax-lyrics"
                    rows={12}
                    value={form.lyrics}
                    onChange={(event) => setForm({ ...form, lyrics: event.target.value })}
                    placeholder="海螺音乐需要歌词内容。"
                  />
                </div>
              </section>
            )}

            {provider === "suno" ? (
              <section className="composer-panel create-compact-section create-section-support">
                <div className="create-section-heading">
                  <h3>续写设置</h3>
                  <p>默认收起，只有续写已有任务时才展开。</p>
                </div>

                <details className="create-disclosure">
                  <summary>需要续写时展开填写</summary>

                  <div className="continuation-grid continuation-grid-inline">
                    <div className="field-group">
                      <div className="field-heading">
                        <label htmlFor="continuation-task-id">续写任务 ID</label>
                        <span>已有任务时填写。</span>
                      </div>
                      <input
                        id="continuation-task-id"
                        value={form.continuationTaskId}
                        onChange={(event) =>
                          setForm({ ...form, continuationTaskId: event.target.value })
                        }
                        placeholder="可为空"
                      />
                    </div>

                    <div className="field-group">
                      <div className="field-heading">
                        <label htmlFor="continuation-clip-id">续写 clip ID</label>
                        <span>指定衔接片段。</span>
                      </div>
                      <input
                        id="continuation-clip-id"
                        value={form.continuationClipId}
                        onChange={(event) =>
                          setForm({ ...form, continuationClipId: event.target.value })
                        }
                        placeholder="可为空"
                      />
                    </div>

                    <div className="field-group">
                      <div className="field-heading">
                        <label htmlFor="continuation-time">继续时间点（秒）</label>
                        <span>从哪个秒数继续。</span>
                      </div>
                      <input
                        id="continuation-time"
                        value={form.continuationTime}
                        onChange={(event) =>
                          setForm({ ...form, continuationTime: event.target.value })
                        }
                        placeholder="例如：61.59"
                      />
                    </div>
                  </div>
                </details>
              </section>
            ) : (
              <section className="composer-panel create-compact-section create-section-support">
                <div className="create-section-heading">
                  <h3>音乐描述</h3>
                  <p>风格、情绪、场景和乐器放在这里，配合右侧歌词一起写。</p>
                </div>

                <div className="field-group create-text-field create-text-field-secondary">
                  <textarea
                    id="minimax-prompt"
                    rows={7}
                    value={form.minimaxPrompt}
                    onChange={(event) => setForm({ ...form, minimaxPrompt: event.target.value })}
                    placeholder="描述风格、情绪、场景和乐器。"
                  />
                </div>
              </section>
            )}

            <div className="composer-submit-strip compact-submit-strip create-section-submit">
              <div className="composer-submit-copy">
                <h3>开始生成</h3>
                <p>
                  {provider === "suno" ? "Suno" : "海螺"} · {selectedModelLabel} · {pricingLabel}
                </p>
              </div>

              <div className="composer-submit-actions">
                <p className="hint-text">右侧实时查看任务与作品；需要提示词辅助时可切到 AI 助手。</p>
                <button className="primary-button" disabled={busyAction === "music"} type="submit">
                  {busyAction === "music" ? "提交中..." : "开始生成"}
                </button>
              </div>
            </div>
          </form>

          {message ? <div className="status-banner">{message}</div> : null}
        </section>
      </section>

      <aside className="workspace-column workspace-side">
        <section className="studio-card studio-card-large workspace-side-shell">
          <div className={sidePanel === "assistant" ? "workspace-side-view is-hidden" : "workspace-side-view"}>
            <div className="section-heading activity-section-heading">
              <div>
                <h3>任务与作品</h3>
              </div>
              <div className="activity-header-actions">
                <button
                  className="ghost-button"
                  onClick={() => loadActivity({ silent: false })}
                  type="button"
                >
                  刷新
                </button>
                <Link className="ghost-link" to="/works">
                  展开全部
                </Link>
              </div>
            </div>

            {activityLoading ? (
              <div className="empty-state activity-loading-state">
                <h3>正在加载任务流</h3>
                <p>读取最近任务和生成作品。</p>
              </div>
            ) : (
              <div className="workspace-activity">
                <div className="activity-summary-strip">
                  <article className="activity-summary-card">
                    <span>进行中</span>
                    <strong>{pendingTaskCount}</strong>
                  </article>
                  <article className="activity-summary-card">
                    <span>已完成</span>
                    <strong>{successfulTaskCount}</strong>
                  </article>
                  <article className="activity-summary-card">
                    <span>可播放</span>
                    <strong>{playableWorkCount}</strong>
                  </article>
                </div>

                <section className="activity-section">
                  <div className="activity-section-header">
                    <h4>任务队列</h4>
                    <span className="selection-badge">{tasks.length} 条</span>
                  </div>

                  <div className="activity-list-shell">
                    {tasks.length === 0 ? (
                      <div className="empty-state compact-empty">
                        <h3>还没有任务</h3>
                        <p>提交后会在这里看到任务状态、音频和刷新入口。</p>
                      </div>
                    ) : (
                      <div className="task-stream task-stream-compact">
                        {tasks.slice(0, 4).map((task) => (
                          <article className="task-stream-item task-stream-item-compact" key={task.id}>
                            <div className="task-card-head">
                              <div>
                                <p className="eyebrow">{task.modelLabel}</p>
                                <h3>{task.title}</h3>
                              </div>
                              <span className={`status-chip ${getStatusTone(task.status)}`}>
                                {task.status}
                              </span>
                            </div>

                            <div className="task-meta activity-meta-pills">
                              <span className="activity-meta-pill">类型 {task.type}</span>
                              <span className="activity-meta-pill">{formatDateTime(task.createdAt)}</span>
                            </div>

                            {task.note ? <p className="task-note">{task.note}</p> : null}
                            {task.failReason ? <p className="task-note">{task.failReason}</p> : null}

                            <div className="task-actions">
                              <button
                                className="secondary-button"
                                disabled={busyAction === "refresh"}
                                onClick={() => handleRefreshTask(task.id)}
                                type="button"
                              >
                                {busyAction === "refresh" ? "刷新中..." : "刷新状态"}
                              </button>
                              {task.remoteTaskId ? <code>{task.remoteTaskId}</code> : null}
                            </div>

                            {Array.isArray(task.clips) && task.clips.length > 0 ? (
                              <div className="clip-inline">
                                {task.clips.slice(0, 1).map((clip) => (
                                  <div key={clip.id}>
                                    <strong>{clip.title || "未命名片段"}</strong>
                                    <p>{clip.prompt || clip.tags || "生成结果已写入任务详情。"}</p>
                                    {clip.audioUrl ? (
                                      <audio className="audio-player" controls src={clip.audioUrl}>
                                        您的浏览器不支持音频播放。
                                      </audio>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="activity-section">
                  <div className="activity-section-header">
                    <h4>作品列表</h4>
                    <span className="selection-badge">{works.length} 首</span>
                  </div>

                  <div className="activity-list-shell">
                    {works.length === 0 ? (
                      <div className="empty-state compact-empty">
                        <h3>还没有可播放作品</h3>
                        <p>成功结果会自动同步到这里。</p>
                      </div>
                    ) : (
                      <div className="content-list task-stream-compact">
                        {works.slice(0, 3).map((work) => (
                          <article className="task-stream-item task-stream-item-compact" key={work.id}>
                            <div className="task-card-head">
                              <div>
                                <p className="eyebrow">{work.provider === "suno" ? "Suno" : "海螺音乐"}</p>
                                <h3>{work.title}</h3>
                              </div>
                              <span className={`status-chip ${getStatusTone(work.status)}`}>
                                {work.status}
                              </span>
                            </div>

                            <div className="task-meta activity-meta-pills">
                              <span className="activity-meta-pill">{work.taskTitle}</span>
                              {work.duration ? <span className="activity-meta-pill">{work.duration}s</span> : null}
                              <span className="activity-meta-pill">{formatDateTime(work.updatedAt)}</span>
                            </div>

                            {work.audioUrl ? (
                              <audio className="audio-player" controls src={work.audioUrl}>
                                您的浏览器不支持音频播放。
                              </audio>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>

          <div className={sidePanel === "assistant" ? "workspace-side-view" : "workspace-side-view is-hidden"}>
            <MusicIdeationAssistant
              context={assistantContext}
              onClose={() => setSidePanel("activity")}
              open={sidePanel === "assistant"}
              runtime={{
                configured: assistantRuntimeConfigured,
                model: assistantRuntimeModel,
              }}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}

export function PricingSignal({ pricing }: { pricing: PricingItem | null }) {
  if (!pricing) {
    return null;
  }

  return (
    <div className="pricing-block">
      <span className="price-tag">
        {pricing.title} · {pricing.price}/{pricing.unit}
      </span>
      <p>{pricing.notes}</p>
      <small>可用分组：{pricing.groups.join(" / ")}</small>
    </div>
  );
}
