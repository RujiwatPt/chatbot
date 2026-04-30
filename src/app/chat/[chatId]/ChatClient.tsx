"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export default function ChatClient({
  chatId,
  initialMessages,
  chatbotName,
}: {
  chatId: string;
  initialMessages: Msg[];
  chatbotName: string;
}) {
  const COOLDOWN_MS = 1200;
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  function stop() {
    abortRef.current?.abort();
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: didInitialScrollRef.current ? "smooth" : "auto",
    });
    didInitialScrollRef.current = true;
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
      // Works for iOS + Android virtual keyboard: when keyboard opens, visual
      // viewport shrinks and/or shifts. Convert that into bottom inset.
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop),
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

  const cooldownMsLeft = Math.max(0, cooldownUntil - now);
  const onCooldown = cooldownMsLeft > 0;
  const canSend = Boolean(input.trim()) && !onCooldown && !busy;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || inFlightRef.current || Date.now() < cooldownUntil) return;
    inFlightRef.current = true;
    setInput("");
    setBusy(true);
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
        // Keep whatever streamed so far; mark it interrupted in the UI.
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
    }
  }

  async function sendFeedback(messageId: string, feedback: string) {
    if (feedbackSent[messageId] === feedback) return;
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
  }

  async function retryLast() {
    if (busy) return;
    setBusy(true);
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
    }
  }

  async function undoLastTurn() {
    if (busy) return;
    const ok = window.confirm(
      "Undo last turn? This will permanently delete your latest message and the latest bot response. This action cannot be undone.",
    );
    if (!ok) return;

    setBusy(true);
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
    }
  }

  return (
    <div
      className="shell mt-2 flex min-h-0 flex-1 flex-col overflow-hidden sm:mt-3"
      style={{
        paddingBottom: `calc(var(--safe-bottom) + ${keyboardInset}px + 0.25rem)`,
      }}
    >
      <div ref={scrollRef} className="panel flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500 text-center pt-10">
            Say something to begin.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`${m.role === "user" ? "flex justify-end" : "flex justify-start"} message-in`}
          >
            <div
              className={
                m.role === "user"
                  ? "w-fit max-w-[92%] rounded-xl bg-white/75 p-3 dark:bg-slate-900/70 sm:max-w-[85%]"
                  : "w-fit max-w-[92%] rounded-xl border border-[var(--line)] bg-[color:var(--surface)] p-3 sm:max-w-[85%]"
              }
            >
            <div className="mb-1 text-xs uppercase text-neutral-500">
              {m.role === "assistant" ? chatbotName : "You"}
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {m.content || (
                <span className="text-neutral-400">…</span>
              )}
            </div>
            {m.role === "assistant" && /^\\d+$/.test(m.id) && (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => sendFeedback(m.id, "more_in_character")}
                >
                  More in character
                </button>
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => sendFeedback(m.id, "too_generic")}
                >
                  Too generic
                </button>
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => sendFeedback(m.id, "too_verbose")}
                >
                  Too verbose
                </button>
              </div>
            )}
            </div>
          </div>
        ))}
        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}
      </div>
      <form
        onSubmit={send}
        className="panel sticky bottom-0 mt-2 flex items-end gap-2 p-2.5 sm:mt-3 sm:p-3"
      >
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn-outline min-h-11 px-3 text-xs"
            onClick={retryLast}
            disabled={busy}
          >
            Retry
          </button>
          <button
            type="button"
            className="btn-outline min-h-11 px-3 text-xs text-red-700 dark:text-red-300"
            onClick={undoLastTurn}
            disabled={busy}
          >
            Undo
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          className="min-h-11 flex-1 resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="btn-outline min-w-20"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="btn-primary"
          >
            {onCooldown ? `Wait ${Math.ceil(cooldownMsLeft / 1000)}s` : "Send"}
          </button>
        )}
      </form>
    </div>
  );
}
