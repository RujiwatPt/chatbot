import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/characters");
  }

  return (
    <main className="px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
      <section className="panel shell reveal-up overflow-hidden p-7 sm:p-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Roleplay Chatbot
            </p>
            <h1 className="page-title text-4xl sm:text-5xl">
              Build characters.
              <br />
              Run immersive chats.
            </h1>
            <p className="page-subtitle max-w-xl">
              A persistent-memory chatbot app where every character has their
              own voice, context, and long-running chat history.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary">
                Start chatting
              </Link>
              <Link href="/characters" className="btn-outline">
                Browse characters
              </Link>
            </div>
          </div>

          <div className="panel stagger-item p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                Live preview
              </div>
              <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[color:var(--muted)]">
                Streaming
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="ml-6 rounded-2xl rounded-br-md bg-white/80 px-3 py-2 text-slate-800 shadow-sm dark:bg-slate-100 dark:text-slate-900">
                Plan tomorrow&apos;s mission briefing.
              </div>
              <div className="mr-6 rounded-2xl rounded-bl-md border border-[var(--line)] bg-[color:var(--surface)] px-3 py-2">
                At dawn. We gather intel first, then move in with zero noise.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="shell mt-6 grid gap-3 sm:grid-cols-3">
        <article className="panel stagger-item p-4" style={{ animationDelay: "80ms" }}>
          <h2 className="text-sm font-semibold">Persistent Memory</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Conversations stay coherent across sessions with context-aware recall.
          </p>
        </article>
        <article className="panel stagger-item p-4" style={{ animationDelay: "140ms" }}>
          <h2 className="text-sm font-semibold">Custom Personas</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Create and tune each character&apos;s personality, tone, and scenario.
          </p>
        </article>
        <article className="panel stagger-item p-4" style={{ animationDelay: "200ms" }}>
          <h2 className="text-sm font-semibold">Fast Streaming</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Responsive message streaming with clear controls and anti-spam safety.
          </p>
        </article>
      </section>
    </main>
  );
}
