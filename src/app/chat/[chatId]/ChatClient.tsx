"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AvatarImage from "@/components/AvatarImage";
import { getDefaultCharacterAvatar } from "@/lib/avatar";
import FontSizeControl from "./FontSizeControl";
import DeleteChatButton from "./DeleteChatButton";

type Msg = { id: string; role: "user" | "assistant"; content: string };

function renderRoleplayText(text: string, isUser = false) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <span
          key={idx}
          className={
            isUser
              ? "user-roleplay-italic italic font-serif leading-relaxed"
              : "italic text-neutral-600 dark:text-neutral-300 font-serif leading-relaxed"
          }
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function SpinnerIcon() {
  return (
    <svg aria-hidden="true" className="size-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M19.2 7.2V3.8m0 0h-3.4m3.4 0-3.1 3.1a7.2 7.2 0 1 0 1.4 8.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="m9 7-4 4 4 4M5.5 11H15a4.5 4.5 0 0 1 0 9h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="m4.3 4.8 16 6.4c.9.36.9 1.64 0 2l-16 6.4c-.78.31-1.55-.45-1.24-1.23L5.55 12 3.06 5.73c-.31-.78.46-1.54 1.24-1.23Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5.7 12h8.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

export default function ChatClient({
  chatId,
  initialMessages,
  chatbotName,
  chatTitle,
  avatarUrl,
  scenario,
  deleteAction,
}: {
  chatId: string;
  initialMessages: Msg[];
  chatbotName: string;
  chatTitle?: string;
  avatarUrl?: string;
  scenario?: string | null;
  deleteAction?: (formData?: FormData) => void;
}) {
  const COOLDOWN_MS = 1200;
  const avatarFallbackUrl = getDefaultCharacterAvatar(chatbotName);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionState, setActionState] = useState<"none" | "sending" | "retrying" | "undoing">("none");
  const [headerHidden, setHeaderHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("chat-header-hidden") === "true";
  });

  const toggleHeader = () => {
    setHeaderHidden((prev) => {
      const next = !prev;
      localStorage.setItem("chat-header-hidden", String(next));
      return next;
    });
  };
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  function stop() {
    abortRef.current?.abort();
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUpRef.current = !isAtBottom;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userScrolledUpRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: didInitialScrollRef.current ? "smooth" : "auto",
      });
      didInitialScrollRef.current = true;
    }
  }, [messages]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const updateInset = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height),
      );
      setKeyboardInset(inset);
    };

    updateInset();
    vv.addEventListener("resize", updateInset);
    vv.addEventListener("scroll", updateInset);
    window.addEventListener("orientationchange", updateInset);
    return () => {
      vv.removeEventListener("resize", updateInset);
      vv.removeEventListener("scroll", updateInset);
      window.removeEventListener("orientationchange", updateInset);
    };
  }, []);

  const handleInputFocus = () => {
    window.scrollTo(0, 0);
    const update = () => {
      if (window.visualViewport) {
        const inset = Math.max(
          0,
          Math.round(window.innerHeight - window.visualViewport.height),
        );
        setKeyboardInset(inset);
      }
      if (scrollRef.current && !userScrolledUpRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    update();
    setTimeout(update, 100);
    setTimeout(update, 300);
  };

  const cooldownMsLeft = Math.max(0, cooldownUntil - now);
  const onCooldown = cooldownMsLeft > 0;
  const canSend = Boolean(input.trim()) && !onCooldown && !busy;
  const hasAssistantMessage = messages.some((message) => message.role === "assistant" && message.content);
  const hasUserMessage = messages.some((message) => message.role === "user");

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || inFlightRef.current || Date.now() < cooldownUntil) return;
    inFlightRef.current = true;
    setInput("");
    setBusy(true);
    setActionState("sending");
    setError(null);

    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, message: text }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) =>
          m.map((x) => (x.id === assistantId ? { ...x, content: acc } : x)),
        );
      }
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      if (aborted) {
        setMessages((m) =>
          m.map((x) =>
            x.id === assistantId
              ? {
                  ...x,
                  content: acc
                    ? `${acc}\n\n[…stopped]`
                    : "[stopped before reply]",
                }
              : x,
          ),
        );
      } else {
        setError(err instanceof Error ? err.message : "Stream failed");
        setMessages((m) => m.filter((x) => x.id !== assistantId));
      }
    } finally {
      abortRef.current = null;
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setNow(Date.now());
      inFlightRef.current = false;
      setBusy(false);
      setActionState("none");
    }
  }

  async function sendFeedback(messageId: string, feedback: string) {
    if (feedbackSent[messageId] === feedback || feedbackLoading[messageId]) return;
    setFeedbackLoading((prev) => ({ ...prev, [messageId]: true }));
    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chatId,
          messageId: Number(messageId),
          feedback,
        }),
      });
      if (!res.ok) return;
      setFeedbackSent((prev) => ({ ...prev, [messageId]: feedback }));
    } finally {
      setFeedbackLoading((prev) => ({ ...prev, [messageId]: false }));
    }
  }

  async function retryLast() {
    if (busy) return;
    setBusy(true);
    setActionState("retrying");
    setError(null);
    try {
      const res = await fetch("/api/chat/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Error ${res.status}`);
      }
      const body = (await res.json()) as {
        ok: boolean;
        message: { id: string; role: "assistant"; content: string };
      };
      setMessages((prev) => {
        const lastAssistantIndex = [...prev]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find((x) => x.m.role === "assistant")?.i;
        if (lastAssistantIndex !== undefined) {
          return prev.map((m, i) => (i === lastAssistantIndex ? body.message : m));
        }
        return [...prev, body.message];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(false);
      setActionState("none");
    }
  }

  async function undoLastTurn() {
    if (busy) return;
    const ok = window.confirm(
      "Undo last turn? This will permanently delete your latest message and the latest bot response. This action cannot be undone.",
    );
    if (!ok) return;

    setBusy(true);
    setActionState("undoing");
    setError(null);
    try {
      const res = await fetch("/api/chat/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Error ${res.status}`);
      }
      setMessages((prev) => {
        const lastUserIndex = [...prev]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find((x) => x.m.role === "user")?.i;
        if (lastUserIndex === undefined) return prev;
        return prev.slice(0, lastUserIndex);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setBusy(false);
      setActionState("none");
    }
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${headerHidden ? "chat-focus-mode" : ""}`}>
      {!headerHidden ? (
        <header className="panel shell shrink-0 flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {avatarUrl && (
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--line)] shadow-sm">
                <AvatarImage
                  src={avatarUrl}
                  fallbackSrc={avatarFallbackUrl}
                  alt={chatbotName}
                  sizes="36px"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">
                {chatTitle || chatbotName}
              </div>
              <div className="muted text-xs truncate flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {chatbotName}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pl-1 text-xs">
            <FontSizeControl />
            <Link href="/chat" className="btn-text muted hidden sm:inline">
              All chats
            </Link>
            {deleteAction && (
              <form action={deleteAction}>
                <DeleteChatButton />
              </form>
            )}
            <button
              type="button"
              onClick={toggleHeader}
              className="btn-outline btn-sm gap-1 text-[11px] sm:text-xs py-1 px-2.5 rounded-lg border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
              title="Hide header and site navigation for distraction-free chat"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.04 10.04 0 013.122-.463c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
              </svg>
              <span>Hide Header</span>
            </button>
          </div>
        </header>
      ) : (
        <div className="shrink-0 flex justify-center py-1">
          <button
            type="button"
            onClick={toggleHeader}
            className="btn-outline btn-sm gap-1.5 text-xs py-1 px-3 rounded-full border border-[var(--line)] bg-[color:var(--surface)] text-slate-700 dark:text-slate-200 shadow-sm backdrop-blur-md hover:border-blue-500/40"
            title="Show header and controls"
          >
            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="font-semibold">{chatbotName}</span>
            <span className="muted text-[10px] uppercase font-semibold tracking-wide border-l border-[var(--line)] pl-1.5">Expand Header</span>
          </button>
        </div>
      )}

      <div
        className="shell mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden sm:mt-2"
        style={{
          paddingBottom: `calc(var(--safe-bottom) + ${keyboardInset}px + 0.25rem)`,
        }}
      >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll panel min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-4"
      >
        {scenario && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 sm:p-3.5 space-y-1 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              <span>🎬</span>
              <span>Scenario</span>
            </div>
            <p className="text-xs sm:text-sm italic text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {scenario}
            </p>
          </div>
        )}
        {messages.length === 0 && (
          <p className="muted pt-10 text-center text-sm">
            Say something to begin.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`${m.role === "user" ? "flex justify-end" : "flex justify-start gap-2.5 items-start"} message-in`}
          >
            {m.role === "assistant" && avatarUrl && (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--line)] shadow-sm mt-1">
                <AvatarImage
                  src={avatarUrl}
                  fallbackSrc={avatarFallbackUrl}
                  alt={chatbotName}
                  sizes="32px"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div
              className={
                m.role === "user"
                  ? "user-bubble chat-bubble w-fit max-w-[92%] px-3.5 py-2.5 sm:max-w-[85%]"
                  : "chat-bubble chat-assistant-bubble w-fit max-w-[92%] p-3.5 sm:max-w-[85%]"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "user-bubble-header mb-1 text-xs font-semibold uppercase tracking-wider flex items-center justify-between gap-2"
                    : "muted mb-1 text-xs font-semibold uppercase tracking-wider flex items-center justify-between gap-2"
                }
              >
                <span>{m.role === "assistant" ? chatbotName : "You"}</span>
              </div>
              <div className="chat-message-text whitespace-pre-wrap leading-relaxed">
                {renderRoleplayText(m.content, m.role === "user") || (
                  <span className="muted">…</span>
                )}
              </div>
              {m.role === "assistant" && /^\d+$/.test(m.id) && (
                <div className="muted mt-2.5 flex flex-wrap gap-2 text-[11px] pt-1 border-t border-[var(--line)]">
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => sendFeedback(m.id, "more_in_character")}
                  >
                    {feedbackSent[m.id] === "more_in_character" ? "✓ More in character" : "More in character"}
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => sendFeedback(m.id, "too_generic")}
                  >
                    {feedbackSent[m.id] === "too_generic" ? "✓ Too generic" : "Too generic"}
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => sendFeedback(m.id, "too_verbose")}
                  >
                    {feedbackSent[m.id] === "too_verbose" ? "✓ Too verbose" : "Too verbose"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {error && (
          <p className="btn-danger text-center text-sm">{error}</p>
        )}
      </div>
      <form
        onSubmit={send}
        className="chat-composer shrink-0 mt-2 flex items-end gap-1.5 p-1.5 sm:mt-3"
      >
        <div className="chat-composer-actions flex items-center gap-0.5">
          <button
            type="button"
            className="chat-icon-button"
            onClick={retryLast}
            disabled={busy || !hasAssistantMessage}
            aria-label={actionState === "retrying" ? "Retrying last response" : "Retry last response"}
            title="Retry last response"
            data-tooltip="Retry"
          >
            {actionState === "retrying" ? <SpinnerIcon /> : <RetryIcon />}
          </button>
          <button
            type="button"
            className="chat-icon-button chat-icon-button-danger"
            onClick={undoLastTurn}
            disabled={busy || !hasUserMessage}
            aria-label={actionState === "undoing" ? "Undoing last turn" : "Undo last turn"}
            title="Undo last turn"
            data-tooltip="Undo"
          >
            {actionState === "undoing" ? <SpinnerIcon /> : <UndoIcon />}
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          aria-label="Message"
          placeholder="Message"
          className="chat-composer-input min-h-11 flex-1 resize-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="chat-send-button chat-stop-button"
            aria-label="Stop generating response"
            title="Stop generating"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="chat-send-button"
            aria-label={onCooldown ? `Send available in ${Math.ceil(cooldownMsLeft / 1000)} seconds` : "Send message"}
            title={onCooldown ? `Wait ${Math.ceil(cooldownMsLeft / 1000)}s` : "Send message"}
          >
            <SendIcon />
          </button>
        )}
      </form>
    </div>
  </div>
);
}
