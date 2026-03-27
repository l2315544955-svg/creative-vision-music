import { useEffect, useState } from "react";

import { fetchMyMusicTasks, fetchMyMusicWorks, refreshMyMusicTask } from "../lib/api";
import type { StoredTask, WorkItem } from "../types";

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

export function WorksPage({
  onCreditsChanged,
}: {
  onCreditsChanged: () => Promise<unknown>;
}) {
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [message, setMessage] = useState("");
  const [refreshingId, setRefreshingId] = useState("");

  async function loadData() {
    const [taskItems, workItems] = await Promise.all([fetchMyMusicTasks(), fetchMyMusicWorks()]);
    setTasks(taskItems);
    setWorks(workItems);
  }

  useEffect(() => {
    loadData().catch((error: Error) => {
      setMessage(error.message);
    });
  }, []);

  async function refreshTask(task: StoredTask) {
    setRefreshingId(task.id);
    setMessage("");

    try {
      const payload = await refreshMyMusicTask(task.id);
      setTasks((current) => current.map((item) => (item.id === task.id ? payload : item)));
      setWorks(await fetchMyMusicWorks());
      await onCreditsChanged();
      setMessage(`任务 ${task.title} 已刷新。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setRefreshingId("");
    }
  }

  return (
    <div className="works-shell works-shell-single">
      <section className="studio-card studio-card-large">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Queue + Result</p>
            <h2>任务与作品</h2>
          </div>
          <div className="task-meta">
            <span>任务数：{tasks.length}</span>
            <span>作品数：{works.length}</span>
          </div>
        </div>

        {message ? <div className="status-banner">{message}</div> : null}

        {tasks.length === 0 ? (
          <div className="empty-state">
            <h3>还没有任务记录</h3>
            <p>先去创作台提交 Suno 或海螺音乐任务，后端会把任务和作品写入 SQLite。</p>
          </div>
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className="task-card-head">
                  <div>
                    <p className="eyebrow">{task.modelLabel}</p>
                    <h3>{task.title}</h3>
                  </div>
                  <span className={`status-chip ${getStatusTone(task.status)}`}>{task.status}</span>
                </div>
                <div className="task-meta">
                  <span>类型：{task.type}</span>
                  <span>供应商：{task.provider}</span>
                  <span>时间：{new Date(task.createdAt).toLocaleString()}</span>
                </div>
                {task.note ? <p className="task-note">{task.note}</p> : null}
                {Array.isArray(task.clips) && task.clips.length > 0 ? (
                  <div className="clip-grid">
                    {task.clips.map((clip) => (
                      <section className="clip-card" key={clip.id}>
                        {clip.imageUrl ? (
                          <div className="clip-cover">
                            <img alt={clip.title} src={clip.imageUrl} />
                          </div>
                        ) : null}
                        <div className="clip-details">
                          <div className="clip-head">
                            <strong>{clip.title || "未命名片段"}</strong>
                            <span className={`status-chip ${getStatusTone(clip.status)}`}>
                              {clip.status}
                            </span>
                          </div>
                          <div className="task-meta">
                            {clip.majorModelVersion ? <span>版本：{clip.majorModelVersion}</span> : null}
                            {clip.duration ? <span>时长：{clip.duration}s</span> : null}
                            {clip.clipId ? <span>Clip：{clip.clipId}</span> : null}
                          </div>
                          {clip.prompt ? <p className="task-note">{clip.prompt}</p> : null}
                          {clip.audioUrl ? (
                            <audio className="audio-player" controls src={clip.audioUrl}>
                              您的浏览器不支持音频播放。
                            </audio>
                          ) : null}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
                {task.audioUrl && !(Array.isArray(task.clips) && task.clips.length > 0) ? (
                  <audio className="audio-player" controls src={task.audioUrl}>
                    您的浏览器不支持音频播放。
                  </audio>
                ) : null}
                <div className="task-actions">
                  <button
                    className="secondary-button"
                    disabled={refreshingId === task.id}
                    onClick={() => refreshTask(task)}
                    type="button"
                  >
                    {refreshingId === task.id ? "刷新中..." : "刷新任务"}
                  </button>
                  {task.remoteTaskId ? <code className="inline-code">{task.remoteTaskId}</code> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
