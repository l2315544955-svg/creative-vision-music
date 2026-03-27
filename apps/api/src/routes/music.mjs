import {
  fetchSunoTask,
  submitMinimaxMusic,
  submitSunoLyrics,
  submitSunoMusic,
} from "../providers/aiznt.mjs";
import { requireAuth } from "../lib/auth.mjs";
import {
  consumeFrozenCreditsForTask,
  freezeCreditsForTask,
  releaseFrozenCreditsForTask,
  resolvePricingCodeForTask,
} from "../lib/creditsStore.mjs";
import {
  createMusicTaskRecord,
  findMusicTaskByIdOrRemoteKey,
  getMusicTaskById,
  listMusicTasksByUser,
  listMusicWorksByUser,
  replaceMusicWorks,
  updateMusicTaskRecord,
} from "../lib/musicStore.mjs";

function toIsoFromSeconds(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return new Date(parsed * 1000).toISOString();
}

function normalizeSunoClip(item) {
  return {
    id: String(item?.id || item?.clip_id || ""),
    clipId: String(item?.clip_id || item?.id || ""),
    title: String(item?.title || "未命名片段"),
    status: String(item?.status || item?.state || "UNKNOWN"),
    audioUrl: typeof item?.audio_url === "string" ? item.audio_url : undefined,
    imageUrl: typeof item?.image_url === "string" ? item.image_url : undefined,
    imageLargeUrl: typeof item?.image_large_url === "string" ? item.image_large_url : undefined,
    videoUrl: typeof item?.video_url === "string" ? item.video_url : undefined,
    prompt:
      typeof item?.prompt === "string"
        ? item.prompt
        : typeof item?.metadata?.prompt === "string"
          ? item.metadata.prompt
          : typeof item?.metadata?.gpt_description_prompt === "string"
            ? item.metadata.gpt_description_prompt
            : undefined,
    tags:
      typeof item?.tags === "string"
        ? item.tags
        : typeof item?.metadata?.tags === "string"
          ? item.metadata.tags
          : undefined,
    duration: Number.isFinite(Number(item?.duration)) ? Number(item.duration) : undefined,
    modelName: typeof item?.model_name === "string" ? item.model_name : undefined,
    majorModelVersion:
      typeof item?.major_model_version === "string" ? item.major_model_version : undefined,
    createdAt: typeof item?.created_at === "string" ? item.created_at : undefined,
  };
}

function normalizeSunoTask(payload) {
  const task = payload?.data || {};
  const clips = Array.isArray(task?.data) ? task.data.map(normalizeSunoClip) : [];

  return {
    provider: "suno",
    taskId: String(task?.task_id || ""),
    action: typeof task?.action === "string" ? task.action : undefined,
    status: String(task?.status || "UNKNOWN"),
    progress: typeof task?.progress === "string" ? task.progress : undefined,
    failReason: typeof task?.fail_reason === "string" ? task.fail_reason : undefined,
    submittedAt: toIsoFromSeconds(task?.submit_time),
    startedAt: toIsoFromSeconds(task?.start_time),
    finishedAt: toIsoFromSeconds(task?.finish_time),
    clips,
  };
}

function normalizeMinimaxResponse(payload, model) {
  const audioUrl = typeof payload?.data?.audio === "string" ? payload.data.audio : undefined;
  const duration = Number(payload?.extra_info?.music_duration);
  const inferredStatus =
    audioUrl
      ? "SUCCESS"
      : typeof payload?.data?.status === "string" || typeof payload?.data?.status === "number"
        ? String(payload.data.status)
        : "SUBMITTED";

  return {
    provider: "minimax",
    status: inferredStatus,
    audioUrl,
    clips: audioUrl
      ? [
          {
            id: String(payload?.trace_id || `${model}-${Date.now()}`),
            title: model,
            status: inferredStatus,
            audioUrl,
            duration: Number.isFinite(duration) ? duration : undefined,
            modelName: model,
          },
        ]
      : [],
  };
}

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

function toNumber(value) {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveTaskPricingCode(task) {
  if (!task) {
    return "";
  }

  return resolvePricingCodeForTask({
    provider: task.provider,
    taskType: task.type,
    modelCode: task.modelCode,
  });
}

function failTaskForUser({ userId, task, error, releaseFrozen, releaseNote }) {
  if (!task?.id) {
    return;
  }

  updateMusicTaskRecord(task.id, {
    status: "FAILED",
    failReason: error?.message || "任务执行失败。",
  });

  if (!releaseFrozen) {
    return;
  }

  const pricingCode = resolveTaskPricingCode(task);

  if (!pricingCode) {
    return;
  }

  releaseFrozenCreditsForTask({
    userId,
    taskId: task.id,
    pricingCode,
    note: releaseNote,
  });
}

async function syncSunoTaskForUser({ userId, taskKey }) {
  const localTask = findMusicTaskByIdOrRemoteKey(userId, "suno", taskKey);

  if (!localTask?.remoteTaskId) {
    return null;
  }

  const payload = await fetchSunoTask(localTask.remoteTaskId);
  const snapshot = normalizeSunoTask(payload);

  updateMusicTaskRecord(localTask.id, {
    status: snapshot.status,
    resultPayload: payload,
    failReason: snapshot.failReason || null,
  });
  replaceMusicWorks(localTask.id, snapshot.clips);

  const normalizedStatus = String(snapshot.status || "").toUpperCase();

  if (normalizedStatus.includes("SUCCESS")) {
    consumeFrozenCreditsForTask({
      userId,
      taskId: localTask.id,
      pricingCode: resolveTaskPricingCode(localTask),
      note: "Suno 任务成功完成，冻结积分转正式扣减。",
    });
  } else if (normalizedStatus.includes("FAIL") || normalizedStatus.includes("ERROR")) {
    releaseFrozenCreditsForTask({
      userId,
      taskId: localTask.id,
      pricingCode: resolveTaskPricingCode(localTask),
      note: "Suno 任务失败，冻结积分已退回。",
    });
  }

  return {
    task: getMusicTaskById(localTask.id, userId),
    snapshot,
  };
}

export function registerMusicRoutes(app) {
  app.get("/api/music/tasks", (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    return res.json({
      success: true,
      data: listMusicTasksByUser(auth.user.id),
    });
  });

  app.get("/api/music/works", (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    return res.json({
      success: true,
      data: listMusicWorksByUser(auth.user.id),
    });
  });

  app.post("/api/music/lyrics", async (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    const prompt = String(req.body?.prompt || "").trim();
    const title = String(req.body?.title || "").trim();

    if (!prompt) {
      return badRequest(res, "歌词提示词不能为空。");
    }

    const requestPayload = {
      prompt,
      title,
    };
    const pricingCode = resolvePricingCodeForTask({
      provider: "suno",
      taskType: "lyrics",
      modelCode: "suno_lyrics",
    });
    let task = null;
    let creditsFrozen = false;
    let providerAccepted = false;
    let providerTaskId = "";
    let providerPayload = null;

    try {
      task = createMusicTaskRecord({
        userId: auth.user.id,
        provider: "suno",
        taskType: "lyrics",
        title: title || "未命名歌词任务",
        modelCode: "suno_lyrics",
        status: "SUBMITTING",
        requestPayload,
      });

      freezeCreditsForTask({
        userId: auth.user.id,
        taskId: task.id,
        pricingCode,
        note: "歌词任务提交前冻结积分。",
      });
      creditsFrozen = true;

      providerPayload = await submitSunoLyrics(prompt);
      providerTaskId = String(providerPayload?.data || "").trim();
      providerAccepted = true;

      updateMusicTaskRecord(task.id, {
        status: "SUBMITTED",
        remoteTaskId: providerTaskId || null,
        requestPayload,
        resultPayload: providerPayload,
        failReason: null,
      });
      consumeFrozenCreditsForTask({
        userId: auth.user.id,
        taskId: task.id,
        pricingCode,
        note: "歌词任务已提交成功，冻结积分转正式扣减。",
      });
      creditsFrozen = false;
      const nextTask = getMusicTaskById(task.id, auth.user.id);

      return res.json({
        success: true,
        data: {
          provider: "suno",
          taskId: providerTaskId,
          task: nextTask,
          raw: providerPayload,
        },
      });
    } catch (error) {
      if (task?.id) {
        try {
          if (providerAccepted) {
            updateMusicTaskRecord(task.id, {
              status: "SUBMITTED",
              remoteTaskId: providerTaskId || null,
              requestPayload,
              resultPayload: providerPayload,
              failReason: null,
            });
            if (creditsFrozen) {
              consumeFrozenCreditsForTask({
                userId: auth.user.id,
                taskId: task.id,
                pricingCode,
                note: "歌词任务已提交成功，冻结积分转正式扣减。",
              });
            }
          } else {
            failTaskForUser({
              userId: auth.user.id,
              task,
              error,
              releaseFrozen: creditsFrozen,
              releaseNote: "歌词任务提交失败，冻结积分已退回。",
            });
          }
        } catch {
          // Ignore cleanup failures and return the original error.
        }
      }

      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        detail: error.payload,
      });
    }
  });

  app.post("/api/music/generate", async (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    const provider = String(req.body?.provider || "").trim();

    if (!provider) {
      return badRequest(res, "必须指定 provider。");
    }

    if (provider === "suno") {
      const title = String(req.body?.title || "").trim();
      const tags = String(req.body?.tags || "").trim();
      const mv = String(req.body?.mv || "").trim();
      const mode = req.body?.mode === "inspiration" ? "inspiration" : "custom";
      const prompt = String(req.body?.prompt || "").trim();
      const requestPayload = {
        title,
        tags,
        mv,
        mode,
        prompt,
        negativeTags: String(req.body?.negativeTags || "").trim(),
        instrumental: Boolean(req.body?.instrumental),
        continuation: {
          taskId: String(req.body?.continuation?.taskId || "").trim(),
          clipId: String(req.body?.continuation?.clipId || "").trim(),
          continueAt: toNumber(req.body?.continuation?.continueAt),
        },
      };
      const pricingCode = resolvePricingCodeForTask({
        provider: "suno",
        taskType: "music",
        modelCode: mv,
      });
      let task = null;
      let creditsFrozen = false;
      let providerAccepted = false;
      let providerTaskId = "";
      let providerPayload = null;

      if (!title || !tags || !mv || !prompt) {
        return badRequest(res, "Suno 生成缺少 title、tags、mv 或 prompt。");
      }

      try {
        task = createMusicTaskRecord({
          userId: auth.user.id,
          provider: "suno",
          taskType: "music",
          title,
          modelCode: mv,
          status: "SUBMITTING",
          requestPayload,
        });

        freezeCreditsForTask({
          userId: auth.user.id,
          taskId: task.id,
          pricingCode,
          note: "Suno 音乐任务提交前冻结积分。",
        });
        creditsFrozen = true;

        providerPayload = await submitSunoMusic(requestPayload);
        providerTaskId = String(providerPayload?.data || "").trim();
        providerAccepted = true;

        updateMusicTaskRecord(task.id, {
          status: "SUBMITTED",
          remoteTaskId: providerTaskId || null,
          resultPayload: providerPayload,
          failReason: null,
        });
        const nextTask = getMusicTaskById(task.id, auth.user.id);

        return res.json({
          success: true,
          data: {
            provider: "suno",
            taskId: providerTaskId,
            status: "SUBMITTED",
            clips: [],
            task: nextTask,
            raw: providerPayload,
          },
        });
      } catch (error) {
        if (task?.id) {
          try {
            if (providerAccepted) {
              updateMusicTaskRecord(task.id, {
                status: "SUBMITTED",
                remoteTaskId: providerTaskId || null,
                requestPayload,
                resultPayload: providerPayload,
                failReason: null,
              });
            } else {
              failTaskForUser({
                userId: auth.user.id,
                task,
                error,
                releaseFrozen: creditsFrozen,
                releaseNote: "Suno 音乐任务提交失败，冻结积分已退回。",
              });
            }
          } catch {
            // Ignore cleanup failures and return the original error.
          }
        }

        return res.status(error.statusCode || 500).json({
          success: false,
          message: error.message,
          detail: error.payload,
        });
      }
    }

    if (provider === "minimax") {
      const model = String(req.body?.model || "").trim();
      const prompt = String(req.body?.prompt || "").trim();
      const lyrics = String(req.body?.lyrics || "").trim();
      const title = String(req.body?.title || "").trim() || model;
      const requestPayload = {
        model,
        prompt,
        lyrics,
        audio: req.body?.audio || {},
      };
      const pricingCode = resolvePricingCodeForTask({
        provider: "minimax",
        taskType: "music",
        modelCode: model,
      });
      let task = null;
      let creditsFrozen = false;
      let providerCompleted = false;
      let providerPayload = null;
      let normalized = null;

      if (!model || !prompt || !lyrics) {
        return badRequest(res, "海螺音乐生成缺少 model、prompt 或 lyrics。");
      }

      try {
        task = createMusicTaskRecord({
          userId: auth.user.id,
          provider: "minimax",
          taskType: "music",
          title,
          modelCode: model,
          status: "SUBMITTING",
          requestPayload,
        });

        freezeCreditsForTask({
          userId: auth.user.id,
          taskId: task.id,
          pricingCode,
          note: "海螺音乐任务提交前冻结积分。",
        });
        creditsFrozen = true;

        providerPayload = await submitMinimaxMusic(requestPayload);
        normalized = normalizeMinimaxResponse(providerPayload, model);
        providerCompleted = true;

        updateMusicTaskRecord(task.id, {
          status: normalized.status,
          resultPayload: providerPayload,
          failReason: null,
        });

        if (normalized.clips.length) {
          replaceMusicWorks(task.id, normalized.clips);
        }
        consumeFrozenCreditsForTask({
          userId: auth.user.id,
          taskId: task.id,
          pricingCode,
          note: "海螺音乐任务已生成成功，冻结积分转正式扣减。",
        });
        creditsFrozen = false;

        return res.json({
          success: true,
          data: {
            ...normalized,
            task: getMusicTaskById(task.id, auth.user.id),
            raw: providerPayload,
          },
        });
      } catch (error) {
        if (task?.id) {
          try {
            if (providerCompleted) {
              updateMusicTaskRecord(task.id, {
                status: normalized?.status || "SUCCESS",
                requestPayload,
                resultPayload: providerPayload,
                failReason: null,
              });

              if (normalized?.clips?.length) {
                replaceMusicWorks(task.id, normalized.clips);
              }

              if (creditsFrozen) {
                consumeFrozenCreditsForTask({
                  userId: auth.user.id,
                  taskId: task.id,
                  pricingCode,
                  note: "海螺音乐任务已生成成功，冻结积分转正式扣减。",
                });
              }
            } else {
              failTaskForUser({
                userId: auth.user.id,
                task,
                error,
                releaseFrozen: creditsFrozen,
                releaseNote: "海螺音乐任务提交失败，冻结积分已退回。",
              });
            }
          } catch {
            // Ignore cleanup failures and return the original error.
          }
        }

        return res.status(error.statusCode || 500).json({
          success: false,
          message: error.message,
          detail: error.payload,
        });
      }
    }

    return badRequest(res, `暂不支持的 provider: ${provider}`);
  });

  app.get("/api/music/tasks/:taskId", async (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    const provider = String(req.query?.provider || "suno");
    const taskId = String(req.params.taskId || "").trim();

    if (!taskId) {
      return badRequest(res, "taskId 不能为空。");
    }

    if (provider !== "suno") {
      return badRequest(res, "当前只支持查询 Suno 任务。");
    }

    const localTask = findMusicTaskByIdOrRemoteKey(auth.user.id, provider, taskId);

    if (!localTask) {
      return res.status(404).json({
        success: false,
        message: "任务不存在。",
      });
    }

    if (!localTask.remoteTaskId) {
      return res.json({
        success: true,
        data: {
          provider: "suno",
          taskId: localTask.id,
          status: localTask.status,
          failReason: localTask.failReason,
          clips: localTask.clips || [],
        },
      });
    }

    try {
      const synced = await syncSunoTaskForUser({
        userId: auth.user.id,
        taskKey: localTask.id,
      });

      return res.json({
        success: true,
        data: synced?.snapshot || normalizeSunoTask({}),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        detail: error.payload,
      });
    }
  });

  app.post("/api/music/tasks/:taskId/refresh", async (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    const taskId = String(req.params.taskId || "").trim();

    if (!taskId) {
      return badRequest(res, "taskId 不能为空。");
    }

    const localTask = getMusicTaskById(taskId, auth.user.id);

    if (!localTask) {
      return res.status(404).json({
        success: false,
        message: "任务不存在。",
      });
    }

    if (localTask.provider !== "suno" || !localTask.remoteTaskId) {
      return res.json({
        success: true,
        data: localTask,
      });
    }

    try {
      const synced = await syncSunoTaskForUser({
        userId: auth.user.id,
        taskKey: taskId,
      });

      return res.json({
        success: true,
        data: synced?.task || localTask,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        detail: error.payload,
      });
    }
  });
}
