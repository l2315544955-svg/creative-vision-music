const AIZNT_BASE_URL = String(process.env.AIZNT_BASE_URL || "https://api.aiznt.com")
  .trim()
  .replace(/\/$/, "");

function getApiKey() {
  return process.env.AIZNT_API_KEY?.trim() || "";
}

function assertApiKey() {
  if (!getApiKey()) {
    const error = new Error("AIZNT_API_KEY 未配置，当前只能运行本地骨架，不能发起真实供应商请求。");
    error.statusCode = 501;
    throw error;
  }
}

async function request(path, options = {}) {
  assertApiKey();

  const response = await fetch(`${AIZNT_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `供应商请求失败，状态码 ${response.status}`,
    );
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function createAizntChatCompletionStream({ messages, signal, model = "deepseek-v3.2" }) {
  assertApiKey();

  return fetch(`${AIZNT_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 900,
      messages,
    }),
  });
}

export async function readAizntError(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  return {
    statusCode: response.status,
    message:
      typeof payload === "string"
        ? payload
        : payload?.error?.message ||
          payload?.message ||
          `AIZNT 请求失败，状态码 ${response.status}`,
    detail: payload,
  };
}

export async function submitSunoLyrics(prompt) {
  return request("/suno/submit/lyrics", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export async function submitSunoMusic(input) {
  const payload = {
    title: input.title,
    tags: input.tags,
    mv: input.mv,
    negative_tags: input.negativeTags || "",
    generation_type: "TEXT",
  };

  if (input.instrumental) {
    payload.make_instrumental = true;
  }

  if (input.mode === "inspiration") {
    payload.gpt_description_prompt = input.prompt;
  } else {
    payload.prompt = input.prompt;
  }

  if (input.continuation?.taskId) {
    payload.task_id = input.continuation.taskId;
  }

  if (input.continuation?.clipId) {
    payload.continue_clip_id = input.continuation.clipId;
  }

  if (typeof input.continuation?.continueAt === "number") {
    payload.continue_at = input.continuation.continueAt;
  }

  return request("/suno/submit/music", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSunoTask(taskId) {
  return request(`/suno/fetch/${taskId}`, {
    method: "GET",
  });
}

export async function submitMinimaxMusic(input) {
  const payload = {
    model: input.model,
    prompt: input.prompt,
    lyrics: input.lyrics,
    audio_setting: {
      sample_rate: Number(input.audio?.sampleRate || 44100),
      bitrate: Number(input.audio?.bitrate || 256000),
      format: input.audio?.format || "mp3",
    },
    output_format: "url",
    stream: false,
    aigc_watermark: false,
  };

  return request("/minimax/v1/music_generation", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAizntRuntimeStatus() {
  return {
    configured: Boolean(getApiKey()),
    baseUrl: AIZNT_BASE_URL,
    chatModel: "deepseek-v3.2",
  };
}
