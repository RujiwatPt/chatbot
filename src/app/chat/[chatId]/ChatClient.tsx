"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export default function ChatClient({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  function stop() {
    abortRef.current?.abort();
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
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
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500 text-center pt-10">
            Say something to begin.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "rounded-md bg-neutral-100 dark:bg-neutral-900 p-3 ml-12"
                : "rounded-md border border-neutral-200 dark:border-neutral-800 p-3 mr-12"
            }
          >
            <div className="text-xs uppercase text-neutral-500 mb-1">
              {m.role}
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {m.content || (
                <span className="text-neutral-400">…</span>
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
        className="border-t border-neutral-200 dark:border-neutral-800 p-3 flex gap-2"
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
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
