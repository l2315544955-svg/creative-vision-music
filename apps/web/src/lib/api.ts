import type {
  AuthSessionPayload,
  AuthUserProfile,
  BillingOrder,
  BillingPreview,
  BootstrapResponse,
  ConsoleAccountCreateResponse,
  ConsoleBootstrapData,
  ConsoleCreditAdjustResponse,
  ConsoleOrganizationCreateResponse,
  CreditAccountSummary,
  CreditLedgerEntry,
  CreditPrecheck,
  MusicGenerationResponse,
  MusicTaskSnapshot,
  PaymentCheckoutSession,
  PaymentOrderSnapshot,
  StoredTask,
  WorkItem,
} from "../types";
import { getAuthToken } from "./auth";

const EXPLICIT_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
let activeApiBaseUrl = EXPLICIT_API_BASE_URL;

export type ApiRequestError = Error & {
  statusCode?: number;
  detail?: unknown;
};

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MusicIdeationAssistantPayload = {
  messages: AssistantChatMessage[];
  context?: {
    provider?: string;
    mode?: string;
    model?: string;
    title?: string;
    tags?: string;
    negativeTags?: string;
    instrumental?: boolean;
    inspiration?: string;
    lyrics?: string;
    minimaxPrompt?: string;
  };
};

function pushApiBaseCandidate(candidates: string[], value: string) {
  const normalized = String(value || "").trim().replace(/\/$/, "");

  if (!normalized || candidates.includes(normalized)) {
    return;
  }

  candidates.push(normalized);
}

function getApiBaseCandidates() {
  const candidates: string[] = [];

  pushApiBaseCandidate(candidates, activeApiBaseUrl);
  pushApiBaseCandidate(candidates, EXPLICIT_API_BASE_URL);

  if (typeof window !== "undefined") {
    const runtimeHost = String(window.location.hostname || "").trim();
    const hostCandidates =
      runtimeHost === "localhost"
        ? [runtimeHost, "127.0.0.1"]
        : runtimeHost === "127.0.0.1"
          ? [runtimeHost, "localhost"]
          : runtimeHost
            ? [runtimeHost, "localhost", "127.0.0.1"]
            : ["localhost", "127.0.0.1"];

    for (const host of hostCandidates) {
      pushApiBaseCandidate(candidates, `http://${host}:8788`);
      pushApiBaseCandidate(candidates, `http://${host}:8787`);
    }
  } else {
    pushApiBaseCandidate(candidates, "http://127.0.0.1:8788");
    pushApiBaseCandidate(candidates, "http://127.0.0.1:8787");
  }

  return candidates;
}

async function fetchWithApiFallback(path: string, init?: RequestInit) {
  const candidates = getApiBaseCandidates();
  let networkError: Error | null = null;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      activeApiBaseUrl = baseUrl;
      return response;
    } catch (error) {
      networkError = error as Error;
    }
  }

  throw new Error(
    networkError?.message || "无法连接接口服务，请确认前端页面和 API 服务使用的是同一台主机。",
  );
}

async function createApiError(response: Response, fallbackMessage = "请求失败") {
  const contentType = response.headers.get("content-type") || "";
  let payload: unknown = null;

  try {
    payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
  } catch {
    payload = null;
  }

  const errorMessage =
    typeof payload === "object" &&
    payload &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message
      : typeof payload === "string" && payload
        ? payload
        : fallbackMessage;

  const error = new Error(errorMessage) as ApiRequestError;
  error.statusCode = response.status;
  error.detail =
    typeof payload === "object" && payload && "detail" in payload ? payload.detail : payload;
  return error;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  const token = getAuthToken();

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetchWithApiFallback(path, {
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (
    !response.ok ||
    (typeof payload === "object" && payload !== null && "success" in payload && payload.success === false)
  ) {
    const error = new Error(
      typeof payload === "object" && payload !== null && "message" in payload
        ? String(payload.message || "请求失败")
        : typeof payload === "string" && payload
          ? payload
          : "请求失败",
    ) as ApiRequestError;
    error.statusCode = response.status;
    error.detail =
      typeof payload === "object" && payload !== null && "detail" in payload ? payload.detail : payload;
    throw error;
  }

  return (typeof payload === "object" && payload !== null && "data" in payload
    ? payload.data
    : payload) as T;
}

export async function fetchBootstrap() {
  return request<BootstrapResponse>("/api/system/bootstrap");
}

export async function register(payload: {
  accountKey: string;
  displayName: string;
  password: string;
}) {
  return request<AuthSessionPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function login(payload: { accountKey: string; password: string }) {
  return request<AuthSessionPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout() {
  return request<{ loggedOut: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function fetchCurrentUser() {
  return request<AuthUserProfile>("/api/me");
}

export async function fetchMyCredits() {
  return request<CreditAccountSummary>("/api/me/credits");
}

export async function fetchMyCreditLedger() {
  return request<CreditLedgerEntry[]>("/api/me/ledger");
}

export async function fetchConsoleBootstrap() {
  return request<ConsoleBootstrapData>("/api/console/bootstrap");
}

export async function createConsoleOrganization(payload: {
  name: string;
  code?: string;
  ownerAccountKey: string;
  ownerDisplayName: string;
  ownerPassword: string;
  initialCredits?: number;
}) {
  return request<ConsoleOrganizationCreateResponse>("/api/console/organizations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createConsoleAccount(payload: {
  organizationId?: string;
  roleCode: "org_member";
  accountKey: string;
  displayName: string;
  password: string;
  initialCredits?: number;
}) {
  return request<ConsoleAccountCreateResponse>("/api/console/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adjustConsoleCredits(payload: {
  targetUserId: string;
  amount: number;
  note?: string;
}) {
  return request<ConsoleCreditAdjustResponse>("/api/console/credits/adjust", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function precheckBilling(payload: {
  pricingCode?: string;
  provider?: string;
  taskType?: string;
  modelCode?: string;
}) {
  return request<CreditPrecheck>("/api/billing/precheck", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createLyricsTask(payload: { prompt: string; title?: string }) {
  return request<{ provider: string; taskId: string; task?: StoredTask }>("/api/music/lyrics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createMusicTask(payload: Record<string, unknown>) {
  return request<MusicGenerationResponse>("/api/music/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchMusicTask(taskId: string, provider = "suno") {
  return request<MusicTaskSnapshot>(
    `/api/music/tasks/${encodeURIComponent(taskId)}?provider=${encodeURIComponent(provider)}`,
  );
}

export async function fetchMyMusicTasks() {
  return request<StoredTask[]>("/api/music/tasks");
}

export async function fetchMyMusicWorks() {
  return request<WorkItem[]>("/api/music/works");
}

export async function refreshMyMusicTask(taskId: string) {
  return request<StoredTask>(`/api/music/tasks/${encodeURIComponent(taskId)}/refresh`, {
    method: "POST",
  });
}

export async function streamMusicIdeationAssistant(
  payload: MusicIdeationAssistantPayload,
  options: {
    onDelta: (content: string) => void;
    onDone?: () => void;
    signal?: AbortSignal;
  },
) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  const token = getAuthToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetchWithApiFallback("/api/assistant/music-ideation/stream", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw await createApiError(response, "AI 灵感音乐助手请求失败。");
  }

  if (!response.body) {
    throw new Error("AI 灵感音乐助手未返回可读数据流。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;

  const handleFrame = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
      .trim();

    if (!data) {
      return;
    }

    const event = JSON.parse(data) as {
      type?: "delta" | "done" | "error";
      content?: string;
      message?: string;
    };

    if (event.type === "delta" && event.content) {
      options.onDelta(event.content);
    }

    if (event.type === "error") {
      throw new Error(event.message || "AI 灵感音乐助手请求失败。");
    }

    if (event.type === "done" && !doneReceived) {
      doneReceived = true;
      options.onDone?.();
    }
  };

  while (true) {
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

      boundary = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    handleFrame(buffer);
  }

  if (!doneReceived) {
    options.onDone?.();
  }
}

export async function previewBilling(packageCode: string) {
  return request<BillingPreview>("/api/billing/preview", {
    method: "POST",
    body: JSON.stringify({ packageCode }),
  });
}

export async function createBillingOrder(packageCode: string) {
  return request<BillingOrder>("/api/billing/orders", {
    method: "POST",
    body: JSON.stringify({ packageCode }),
  });
}

export async function createAlipayPageCheckout(packageCode: string) {
  return request<PaymentCheckoutSession>("/api/payments/alipay/page/create", {
    method: "POST",
    body: JSON.stringify({ packageCode }),
  });
}

export async function fetchPaymentOrder(orderNo: string) {
  return request<PaymentOrderSnapshot>(`/api/payments/orders/${encodeURIComponent(orderNo)}`);
}

export async function reconcilePaymentOrder(orderNo: string) {
  return request<PaymentOrderSnapshot>(
    `/api/payments/orders/${encodeURIComponent(orderNo)}/reconcile`,
    {
      method: "POST",
    },
  );
}
