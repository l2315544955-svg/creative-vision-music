import { requireAuth } from "../lib/auth.mjs";
import {
  createAizntChatCompletionStream,
  readAizntError,
} from "../providers/aiznt.mjs";

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

function toTrimmedString(value, maxLength = 400) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      const role =
        item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
      const content = toTrimmedString(item?.content, 4000);

      if (!role || !content) {
        return null;
      }

      return {
        role,
        content,
      };
    })
    .filter(Boolean)
    .slice(-16);
}

function normalizeContext(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    provider: toTrimmedString(source.provider, 32),
    mode: toTrimmedString(source.mode, 32),
    model: toTrimmedString(source.model, 64),
    title: toTrimmedString(source.title, 120),
    tags: toTrimmedString(source.tags, 500),
    negativeTags: toTrimmedString(source.negativeTags, 500),
    instrumental: Boolean(source.instrumental),
    inspiration: toTrimmedString(source.inspiration, 1600),
    lyrics: toTrimmedString(source.lyrics, 2400),
    minimaxPrompt: toTrimmedString(source.minimaxPrompt, 1600),
  };
}

function buildSystemPrompt() {
  return [
    "你是 Creative Vision Music 的 AI 灵感音乐助手。",
    "你的工作是把用户模糊的音乐想法整理成可直接用于 AI 音乐生成的提示词和关键词。",
    "默认使用中文，语气专业、直接、简洁。",
    "回答范围严格限定为 AI 音乐创作：提示词、风格标签、负向词、结构、歌词方向、编曲建议、Suno 写法、海螺音乐写法。",
    "不回答编程、时事、百科、数学、账户、充值、后台配置、客服流程等无关问题。",
    "如果用户问题超出 AI 音乐创作范围，只用 1 到 2 句话说明范围限制，并把话题拉回歌曲风格、情绪、场景、人声、乐器或歌词需求。",
    "优先给用户可复制结果，不空谈。",
    "输出重点围绕：风格标签、场景与情绪、乐器与音色、人声或纯音乐建议、节奏速度、结构走向、负向关键词、歌词方向。",
    "如果适配 Suno，优先产出短标签、英文逗号分隔风格词、可直接粘贴的 tags 与 negative tags。",
    "如果适配海螺音乐，优先产出完整、自然、可直接粘贴的中文音乐描述。",
    "如果用户想法模糊，主动补齐缺口，并给出 2 到 3 组不同方向。",
    "除非用户明确要求，否则不要解释原理，不要展开泛泛教程。",
    "需要时用短标题和项目符号组织答案，避免长篇空泛说明。",
    "不要编造平台不存在的参数、功能、价格或能力。",
  ].join("\n");
}

function buildContextPrompt(context) {
  const lines = [];

  if (context.provider) {
    lines.push(`创作入口：${context.provider}`);
  }

  if (context.mode) {
    lines.push(`当前模式：${context.mode}`);
  }

  if (context.model) {
    lines.push(`当前模型：${context.model}`);
  }

  if (context.title) {
    lines.push(`歌曲标题：${context.title}`);
  }

  if (context.tags) {
    lines.push(`已有风格标签：${context.tags}`);
  }

  if (context.negativeTags) {
    lines.push(`已有负向关键词：${context.negativeTags}`);
  }

  lines.push(`纯音乐：${context.instrumental ? "是" : "否"}`);

  if (context.inspiration) {
    lines.push(`灵感描述：${context.inspiration}`);
  }

  if (context.lyrics) {
    lines.push(`当前歌词：${context.lyrics}`);
  }

  if (context.minimaxPrompt) {
    lines.push(`海螺音乐描述：${context.minimaxPrompt}`);
  }

  if (!lines.length) {
    return "";
  }

  return ["当前创作面板上下文，仅在相关时引用：", ...lines].join("\n");
}

function writeSseEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function readDataPayload(frame) {
  return frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim();
}

async function pipeAizntStream(upstream, res) {
  if (!upstream.body) {
    throw new Error("AIZNT 未返回可读数据流。");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;

  const sendDone = () => {
    if (doneSent || res.writableEnded) {
      return;
    }

    doneSent = true;
    writeSseEvent(res, { type: "done" });
  };

  const handleFrame = (frame) => {
    const payload = readDataPayload(frame);

    if (!payload) {
      return;
    }

    if (payload === "[DONE]") {
      sendDone();
      return;
    }

    let parsed = null;

    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    const delta = parsed?.choices?.[0]?.delta?.content;

    if (typeof delta === "string" && delta) {
      writeSseEvent(res, {
        type: "delta",
        content: delta,
      });
    }

    if (parsed?.choices?.[0]?.finish_reason) {
      sendDone();
    }
  };

  while (!doneSent) {
    const { value, done } = await reader.read();

    buffer += decoder.decode(value || new Uint8Array(), {
      stream: !done,
    });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      if (frame.trim()) {
        handleFrame(frame);
      }

      if (doneSent) {
        break;
      }

      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  if (!doneSent) {
    if (buffer.trim()) {
      handleFrame(buffer);
    }

    sendDone();
  }
}

export function registerAssistantRoutes(app) {
  app.post("/api/assistant/music-ideation/stream", async (req, res) => {
    const auth = requireAuth(req, res);

    if (!auth) {
      return;
    }

    const messages = normalizeMessages(req.body?.messages);

    if (!messages.length) {
      return badRequest(res, "对话内容不能为空。");
    }

    const context = normalizeContext(req.body?.context);
    const contextPrompt = buildContextPrompt(context);
    const abortController = new AbortController();
    const abortUpstream = () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };
    const handleRequestAborted = () => {
      abortUpstream();
    };
    const handleResponseClosed = () => {
      if (!res.writableEnded) {
        abortUpstream();
      }
    };
    const cleanup = () => {
      req.off("aborted", handleRequestAborted);
      res.off("close", handleResponseClosed);
    };

    req.on("aborted", handleRequestAborted);
    res.on("close", handleResponseClosed);

    try {
      const upstream = await createAizntChatCompletionStream({
        signal: abortController.signal,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          ...(contextPrompt
            ? [
                {
                  role: "system",
                  content: contextPrompt,
                },
              ]
            : []),
          ...messages,
        ],
      });

      if (!upstream.ok) {
        const error = await readAizntError(upstream);

        return res.status(error.statusCode || 502).json({
          success: false,
          message: error.message,
          detail: error.detail,
        });
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(": connected\n\n");

      await pipeAizntStream(upstream, res);
      res.end();
    } catch (error) {
      if (abortController.signal.aborted) {
        if (!res.writableEnded) {
          res.end();
        }

        return;
      }

      const message = error?.message || "AI 灵感音乐助手请求失败。";

      if (res.headersSent) {
        if (!res.writableEnded) {
          writeSseEvent(res, {
            type: "error",
            message,
          });
          res.end();
        }

        return;
      }

      return res.status(error?.statusCode || 500).json({
        success: false,
        message,
        detail: error?.detail || error?.payload,
      });
    } finally {
      cleanup();
    }
  });
}
