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
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  function stop() {
    abortRef.current?.abort();
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

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

  return (
    <div className="shell mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="panel flex-1 space-y-4 overflow-y-auto p-4">
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
                  ? "w-fit max-w-[85%] rounded-xl bg-white/75 p-3 dark:bg-slate-900/70"
                  : "w-fit max-w-[85%] rounded-xl border border-[var(--line)] bg-[color:var(--surface)] p-3"
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
            </div>
          </div>
        ))}
        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}
      </div>
      <form
        onSubmit={send}
        className="panel mt-3 flex items-end gap-2 p-3"
      >
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
          className="flex-1 resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
