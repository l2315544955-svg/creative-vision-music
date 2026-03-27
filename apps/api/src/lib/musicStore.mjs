import crypto from "node:crypto";

import { getDatabase } from "./database.mjs";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function normalizeClipRow(row) {
  return {
    id: row.id,
    clipId: row.clip_id || undefined,
    title: row.title,
    status: row.status,
    audioUrl: row.audio_url || undefined,
    imageUrl: row.image_url || undefined,
    videoUrl: row.video_url || undefined,
    duration: row.duration === null || row.duration === undefined ? undefined : Number(row.duration),
    createdAt: row.created_at,
    ...(safeParseJson(row.raw_payload) || {}),
  };
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildModelLabel(task) {
  if (task.task_type === "lyrics") {
    return "Suno Lyrics";
  }

  if (task.provider === "suno") {
    return `Suno ${task.model_code || "Music"}`;
  }

  if (task.model_code) {
    return String(task.model_code);
  }

  return task.provider;
}

function buildTaskNote(task, clips) {
  if (task.fail_reason) {
    return `失败原因：${task.fail_reason}`;
  }

  if (task.provider === "minimax") {
    return clips.length ? "海螺音乐已返回可播放结果。" : "海螺音乐任务已提交，请关注返回结果。";
  }

  if (task.task_type === "lyrics") {
    return "歌词已提交，后续可在任务页刷新状态。";
  }

  if (clips.length) {
    return `已返回 ${clips.length} 条结果。`;
  }

  if (task.remote_task_id) {
    return "Suno 已受理任务，可在任务页轮询查询。";
  }

  return undefined;
}

function normalizeTaskRow(task, clipRows) {
  const clips = clipRows.map(normalizeClipRow);
  const firstClip = clips[0];

  return {
    id: task.id,
    provider: task.provider,
    title: task.title || "未命名任务",
    modelCode: task.model_code || undefined,
    modelLabel: buildModelLabel(task),
    status: task.status,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    type: task.task_type,
    remoteTaskId: task.remote_task_id || undefined,
    audioUrl: firstClip?.audioUrl,
    coverUrl: firstClip?.imageUrl,
    note: buildTaskNote(task, clips),
    failReason: task.fail_reason || undefined,
    clips,
  };
}

function normalizeWorkRow(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    clipId: row.clip_id || undefined,
    title: row.title,
    status: row.status,
    audioUrl: row.audio_url || undefined,
    imageUrl: row.image_url || undefined,
    videoUrl: row.video_url || undefined,
    duration: row.duration === null || row.duration === undefined ? undefined : Number(row.duration),
    provider: row.provider,
    taskTitle: row.task_title,
    modelCode: row.model_code || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadWorksForTask(taskId) {
  const database = getDatabase();

  return database
    .prepare(`
      SELECT *
      FROM music_works
      WHERE task_id = ?
      ORDER BY created_at DESC, id DESC
    `)
    .all(taskId);
}

export function createMusicTaskRecord(input) {
  const database = getDatabase();
  const taskId = createId("mtk");
  const createdAt = nowIso();

  database
    .prepare(`
      INSERT INTO music_tasks (
        id,
        user_id,
        organization_id,
        provider,
        task_type,
        title,
        model_code,
        status,
        remote_task_id,
        request_payload,
        result_payload,
        fail_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      taskId,
      input.userId || null,
      input.organizationId || null,
      input.provider,
      input.taskType,
      input.title || null,
      input.modelCode || null,
      input.status,
      input.remoteTaskId || null,
      input.requestPayload === undefined ? null : JSON.stringify(input.requestPayload),
      input.resultPayload === undefined ? null : JSON.stringify(input.resultPayload),
      input.failReason || null,
      createdAt,
      createdAt,
    );

  return getMusicTaskById(taskId, input.userId);
}

export function updateMusicTaskRecord(taskId, patch) {
  const database = getDatabase();
  const current = database
    .prepare("SELECT * FROM music_tasks WHERE id = ? LIMIT 1")
    .get(String(taskId || "").trim());

  if (!current) {
    return null;
  }

  const next = {
    userId: patch.userId === undefined ? current.user_id : patch.userId,
    organizationId:
      patch.organizationId === undefined ? current.organization_id : patch.organizationId,
    title: patch.title === undefined ? current.title : patch.title,
    modelCode: patch.modelCode === undefined ? current.model_code : patch.modelCode,
    status: patch.status === undefined ? current.status : patch.status,
    remoteTaskId:
      patch.remoteTaskId === undefined ? current.remote_task_id : patch.remoteTaskId,
    requestPayload:
      patch.requestPayload === undefined
        ? current.request_payload
        : JSON.stringify(patch.requestPayload),
    resultPayload:
      patch.resultPayload === undefined ? current.result_payload : JSON.stringify(patch.resultPayload),
    failReason: patch.failReason === undefined ? current.fail_reason : patch.failReason,
    updatedAt: nowIso(),
  };

  database
    .prepare(`
      UPDATE music_tasks
      SET user_id = ?,
          organization_id = ?,
          title = ?,
          model_code = ?,
          status = ?,
          remote_task_id = ?,
          request_payload = ?,
          result_payload = ?,
          fail_reason = ?,
          updated_at = ?
      WHERE id = ?
    `)
    .run(
      next.userId || null,
      next.organizationId || null,
      next.title || null,
      next.modelCode || null,
      next.status,
      next.remoteTaskId || null,
      next.requestPayload,
      next.resultPayload,
      next.failReason || null,
      next.updatedAt,
      current.id,
    );

  return getMusicTaskById(current.id, current.user_id);
}

export function replaceMusicWorks(taskId, clips) {
  const database = getDatabase();
  const normalizedTaskId = String(taskId || "").trim();

  database.exec("BEGIN");

  try {
    database.prepare("DELETE FROM music_works WHERE task_id = ?").run(normalizedTaskId);

    const insert = database.prepare(`
      INSERT INTO music_works (
        id,
        task_id,
        clip_id,
        title,
        status,
        audio_url,
        image_url,
        video_url,
        duration,
        raw_payload,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const clip of clips || []) {
      const createdAt = clip.createdAt || nowIso();
      const sourceId = String(clip.id || clip.clipId || createId("wrk"));
      const id = `${normalizedTaskId}_${sourceId}`;

      insert.run(
        id,
        normalizedTaskId,
        clip.clipId || null,
        clip.title || "未命名片段",
        clip.status || "UNKNOWN",
        clip.audioUrl || null,
        clip.imageUrl || null,
        clip.videoUrl || null,
        clip.duration === undefined ? null : Number(clip.duration),
        JSON.stringify(clip),
        createdAt,
        nowIso(),
      );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getMusicTaskById(taskId, userId) {
  const database = getDatabase();
  const normalizedTaskId = String(taskId || "").trim();
  const row = userId
    ? database
        .prepare("SELECT * FROM music_tasks WHERE id = ? AND user_id = ? LIMIT 1")
        .get(normalizedTaskId, String(userId || "").trim())
    : database.prepare("SELECT * FROM music_tasks WHERE id = ? LIMIT 1").get(normalizedTaskId);

  if (!row) {
    return null;
  }

  return normalizeTaskRow(row, loadWorksForTask(row.id));
}

export function findMusicTaskByRemoteTaskId(userId, provider, remoteTaskId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT *
      FROM music_tasks
      WHERE user_id = ?
        AND provider = ?
        AND remote_task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(String(userId || "").trim(), String(provider || "").trim(), String(remoteTaskId || "").trim());

  if (!row) {
    return null;
  }

  return normalizeTaskRow(row, loadWorksForTask(row.id));
}

export function findMusicTaskByIdOrRemoteKey(userId, provider, taskKey) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT *
      FROM music_tasks
      WHERE user_id = ?
        AND provider = ?
        AND (id = ? OR remote_task_id = ?)
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(
      String(userId || "").trim(),
      String(provider || "").trim(),
      String(taskKey || "").trim(),
      String(taskKey || "").trim(),
    );

  if (!row) {
    return null;
  }

  return normalizeTaskRow(row, loadWorksForTask(row.id));
}

export function listMusicTasksByUser(userId) {
  const database = getDatabase();
  const rows = database
    .prepare(`
      SELECT *
      FROM music_tasks
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `)
    .all(String(userId || "").trim());

  return rows.map((row) => normalizeTaskRow(row, loadWorksForTask(row.id)));
}

export function listMusicWorksByUser(userId) {
  const database = getDatabase();
  const rows = database
    .prepare(`
      SELECT
        music_works.*,
        music_tasks.provider,
        music_tasks.title AS task_title,
        music_tasks.model_code
      FROM music_works
      JOIN music_tasks ON music_tasks.id = music_works.task_id
      WHERE music_tasks.user_id = ?
      ORDER BY music_works.created_at DESC, music_works.id DESC
      LIMIT 200
    `)
    .all(String(userId || "").trim());

  return rows.map(normalizeWorkRow);
}
