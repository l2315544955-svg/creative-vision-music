import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import {
  type AssistantChatMessage,
  streamMusicIdeationAssistant,
} from "../lib/api";

type CreateContext = {
  provider: "suno" | "minimax";
  mode: "inspiration" | "custom";
  model: string;
  title: string;
  tags: string;
  negativeTags: string;
  instrumental: boolean;
  inspiration: string;
  lyrics: string;
  minimaxPrompt: string;
};

type AssistantMessage = AssistantChatMessage & {
  id: string;
};

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MusicIdeationAssistant({
  open,
  onClose,
  context,
  runtime,
}: {
  open: boolean;
  onClose: () => void;
  context: CreateContext;
  runtime: {
    configured: boolean;
    model: string;
  };
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const providerLabel = context.provider === "suno" ? "Suno" : "海螺音乐";
  const modeLabel =
    context.provider === "suno" ? (context.mode === "inspiration" ? "灵感模式" : "固定歌词") : "中文直出";
  const runtimeLabel = runtime.configured ? `模型 ${runtime.model}` : "模型未配置";

  useEffect(() => {
    const node = chatViewportRef.current;

    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [messages, busy, error]);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
    }
  }, [open]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  async function submitPrompt(rawValue: string) {
    const prompt = rawValue.trim();

    if (!prompt || busy) {
      return;
    }

    const controller = new AbortController();
    const userMessage: AssistantMessage = {
      id: createMessageId(),
      role: "user",
      content: prompt,
    };
    const assistantMessageId = createMessageId();
    const nextConversation = [...messages, userMessage];

    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages([
      ...nextConversation,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      },
    ]);

    try {
      await streamMusicIdeationAssistant(
        {
          messages: nextConversation.map(({ role, content }) => ({
            role,
            content,
          })),
          context: {
            provider: context.provider,
            mode: context.mode,
            model: context.model,
            title: context.title,
            tags: context.tags,
            negativeTags: context.negativeTags,
            instrumental: context.instrumental,
            inspiration: context.inspiration,
            lyrics: context.lyrics,
            minimaxPrompt: context.minimaxPrompt,
          },
        },
        {
          signal: controller.signal,
          onDelta: (content) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: message.content + content,
                    }
                  : message,
              ),
            );
          },
        },
      );
    } catch (streamError) {
      if ((streamError as Error).name === "AbortError") {
        setMessages((current) =>
          current.filter(
            (message) => message.id !== assistantMessageId || message.content.trim().length > 0,
          ),
        );
        return;
      }

      setError((streamError as Error).message || "AI 灵感音乐助手暂时不可用。");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: message.content || "这次没有成功返回建议，请稍后重试。",
              }
            : message,
        ),
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submitPrompt(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt(draft);
    }
  }

  return (
    <div className="music-assistant">
      <div className="music-assistant-header">
        <div>
          <p className="eyebrow">AI Music Copilot</p>
          <h3>AI灵感音乐助手</h3>
          <p>仅处理 AI 音乐提示词、歌词方向、结构、标签和负向词，无关问题会直接收口。</p>
        </div>

        <button className="ghost-button" onClick={onClose} type="button">
          关闭
        </button>
      </div>

      <div className="music-assistant-context">
        <span className="selection-badge">{providerLabel}</span>
        <span className="selection-badge">{modeLabel}</span>
        <span className="selection-badge">{context.model}</span>
        <span
          className={
            runtime.configured
              ? "selection-badge selection-badge-runtime"
              : "selection-badge selection-badge-runtime is-warning"
          }
        >
          {runtimeLabel}
        </span>
        {context.instrumental ? <span className="selection-badge">纯音乐</span> : null}
      </div>

      <div className="music-assistant-chat" ref={chatViewportRef}>
        {messages.length === 0 ? (
          <div className="music-assistant-empty">
            <div className="music-assistant-empty-copy">
              <h4>直接输入你的音乐需求。</h4>
              <p>它会参考当前模型、模式、标题、标签、歌词或描述生成结果，不主动给预设问题或固定回答。</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`music-assistant-message role-${message.role}`}
              key={message.id}
            >
              <span className="music-assistant-message-label">
                {message.role === "assistant" ? "助手" : "我"}
              </span>
              <div className="music-assistant-bubble">{message.content || "正在生成..."}</div>
            </article>
          ))
        )}

        {busy ? <div className="music-assistant-streaming">正在生成适配当前参数的建议...</div> : null}
      </div>

      {error ? <div className="status-banner music-assistant-error">{error}</div> : null}

      <form className="music-assistant-composer" onSubmit={handleSubmit}>
        <textarea
          className="music-assistant-input"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="例如：我要一首城市夜色、女声、电影感副歌的中文流行歌，帮我拆成 Suno 标签和负向词。"
          rows={4}
          value={draft}
        />

        <div className="music-assistant-composer-footer">
          <p className="hint-text">
            {busy ? `${runtime.model} 正在流式回复。` : "仅限音乐创作问题。Enter 发送，Shift + Enter 换行。"}
          </p>
          <button className="primary-button" disabled={busy || !draft.trim()} type="submit">
            {busy ? "生成中..." : "发送"}
          </button>
        </div>
      </form>
    </div>
  );
}
