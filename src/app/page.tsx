import Link from "next/link";
import Image from "next/image";
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

  const featured = [
    { name: "Aiko", title: "Tsundere classmate", avatar: "/images/avatar_aiko.jpg", badge: "Anime" },
    { name: "Sam", title: "Childhood bestfriend", avatar: "/images/avatar_sam.jpg", badge: "Cozy" },
    { name: "Kael", title: "Wolf beastman companion", avatar: "/images/avatar_kael.jpg", badge: "Fantasy" },
    { name: "Dr. Mira Vance", title: "Licensed therapist", avatar: "/images/avatar_mira.jpg", badge: "Support" },
  ];

  return (
    <main className="px-3 pb-[calc(var(--safe-bottom)+1.5rem)] pt-5 sm:px-6 sm:pb-10 sm:pt-10">
      <section className="panel shell reveal-up overflow-hidden p-5 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              Powered by Euryale 70B
            </div>
            <h1 className="page-title text-3xl font-extrabold sm:text-5xl">
              Build <span className="gradient-text">Characters</span>.
              <br />
              Run Immersive Roleplays.
            </h1>
            <p className="page-subtitle max-w-xl text-base">
              A high-context roleplay engine with persistent memory, structured scene tracking, and vibrant custom personas.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary min-h-11 px-6 shadow-lg shadow-blue-500/20">
                Start Chatting
              </Link>
              <Link href="/characters" className="btn-outline min-h-11 px-6">
                Explore Characters
              </Link>
            </div>
          </div>

          <div className="relative group overflow-hidden rounded-2xl border border-[var(--line)] shadow-2xl">
            <Image
              src="/images/hero_roleplay.jpg"
              alt="AI Roleplay Illustration"
              width={1280}
              height={720}
              priority
              className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent p-4 flex flex-col justify-end">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-widest">Interactive Storytelling</p>
              <p className="text-sm text-white/90 font-medium">Uncensored deep narrative memory engine</p>
            </div>
          </div>
        </div>
      </section>

      <section className="shell mt-8">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          Featured Companion Characters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((c, idx) => (
            <div
              key={c.name}
              className="panel panel-hover stagger-item overflow-hidden p-3"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <div className="relative aspect-square overflow-hidden rounded-xl mb-3">
                <Image
                  src={c.avatar}
                  alt={c.name}
                  width={400}
                  height={400}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute top-2 right-2 badge shadow-md bg-slate-900/80 text-white border-none backdrop-blur-md">
                  {c.badge}
                </span>
              </div>
              <h3 className="font-bold text-sm">{c.name}</h3>
              <p className="muted text-xs mt-0.5 line-clamp-1">{c.title}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell mt-8 grid gap-4 sm:grid-cols-3">
        <article className="panel stagger-item p-5" style={{ animationDelay: "80ms" }}>
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-3 font-bold text-lg">
            🧠
          </div>
          <h2 className="text-base font-semibold">131k Context Memory</h2>
          <p className="muted mt-1.5 text-sm">
            Remembers long story arcs, scene states, and durable character facts seamlessly.
          </p>
        </article>
        <article className="panel stagger-item p-5" style={{ animationDelay: "140ms" }}>
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 mb-3 font-bold text-lg">
            🎭
          </div>
          <h2 className="text-base font-semibold">Custom Personas</h2>
          <p className="muted mt-1.5 text-sm">
            Tune speech patterns, mannerisms, and scenarios with Chai-style prompt guidelines.
          </p>
        </article>
        <article className="panel stagger-item p-5" style={{ animationDelay: "200ms" }}>
          <div className="h-10 w-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-500 mb-3 font-bold text-lg">
            ⚡
          </div>
          <h2 className="text-base font-semibold">Instant Streaming</h2>
          <p className="muted mt-1.5 text-sm">
            Formatted roleplay action rendering with zero latency word streaming.
          </p>
        </article>
      </section>
    </main>
  );
}
