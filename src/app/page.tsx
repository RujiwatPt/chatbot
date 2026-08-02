import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Query up to 4 public featured characters from Supabase
  const { data: publicCharacters } = await supabase
    .from("characters")
    .select("id, name, alias, persona_display, avatar_url, tags")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(4);

  const fallbackFeatured = [
    { id: "1", name: "Aiko", alias: "Tsundere classmate", persona_display: "Aiko is your energetic tsundere classmate.", avatar_url: "/images/avatar_aiko.jpg", tags: ["Anime", "Teenager"] },
    { id: "2", name: "Sam", alias: "Childhood bestfriend", persona_display: "Sam is your childhood best friend.", avatar_url: "/images/avatar_sam.jpg", tags: ["Cozy", "Teenager"] },
    { id: "3", name: "Kael", alias: "Wolf beastman companion", persona_display: "Hatsuki a.k.a Hat-chan is your wolfman bestfriend.", avatar_url: "/images/avatar_kael.jpg", tags: ["Fantasy", "Furry"] },
    { id: "4", name: "Dr. Mira Vance", alias: "Licensed therapist", persona_display: "Dr. Mira Vance is a compassionate therapist.", avatar_url: "/images/avatar_mira.jpg", tags: ["Support", "Adult"] },
  ];

  const displayFeatured = publicCharacters && publicCharacters.length > 0 ? publicCharacters : fallbackFeatured;

  return (
    <main className="px-3 pb-[calc(var(--safe-bottom)+2rem)] pt-4 sm:px-6 sm:pb-16 sm:pt-6 space-y-12">
      {/* Logged in User Quick Banner */}
      {user && (
        <div className="shell panel p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-blue-500/5 border-blue-500/20">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>Welcome back! You are currently signed in.</span>
          </div>
          <Link href="/characters" className="btn-primary btn-sm px-4 py-1.5 shrink-0 text-xs">
            Go to Characters Dashboard →
          </Link>
        </div>
      )}

      {/* Hero Showcase Section */}
      <section className="panel shell reveal-up overflow-hidden p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              Next-Gen Roleplay AI Engine
            </div>
            <h1 className="page-title text-3xl font-extrabold sm:text-5xl tracking-tight leading-tight">
              Create <span className="gradient-text">AI Companions</span>.
              <br />
              Experience Immersive Roleplay.
            </h1>
            <p className="page-subtitle max-w-xl text-base sm:text-lg leading-relaxed">
              A high-context roleplay engine with persistent memory, structured scene tracking, custom persona builder, and dynamic tag filtering.
            </p>
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Link
                href={user ? "/characters" : "/login"}
                className="btn-primary min-h-12 px-7 text-sm font-semibold shadow-lg shadow-blue-500/20"
              >
                {user ? "Explore Characters →" : "Get Started Free"}
              </Link>
              <Link href="/characters" className="btn-outline min-h-12 px-6 text-sm font-semibold">
                Browse All Companions
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
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent p-5 flex flex-col justify-end">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Interactive Storytelling</p>
              <p className="text-sm sm:text-base text-white/95 font-medium">Uncensored deep narrative memory engine</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Characters Grid */}
      <section className="shell space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Featured Companions</h2>
            <p className="muted text-xs sm:text-sm">Explore popular characters or create your own custom companion.</p>
          </div>
          <Link href="/characters" className="btn-text text-xs font-semibold">
            View All →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {displayFeatured.map((c, idx) => {
            const avatarSrc = getCharacterAvatar(c.name, c.alias, c.avatar_url);
            const firstTag = Array.isArray(c.tags) && c.tags.length > 0 ? c.tags[0] : null;

            return (
              <Link
                key={c.id}
                href={`/characters/${c.id}`}
                className="panel panel-hover stagger-item overflow-hidden p-3.5 block group"
                style={{ animationDelay: `${idx * 70}ms` }}
              >
                <div className="relative aspect-square overflow-hidden rounded-xl mb-3 bg-slate-800">
                  <Image
                    src={avatarSrc}
                    alt={c.name}
                    width={400}
                    height={400}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {firstTag && (
                    <span className="absolute top-2 right-2 badge shadow-md bg-slate-900/85 text-white border-none backdrop-blur-md text-[10px]">
                      {firstTag}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-sm group-hover:text-blue-500 transition-colors">{c.name}</h3>
                <p className="muted text-xs mt-0.5 line-clamp-2">
                  {c.alias || c.persona_display || "Interactive roleplay companion"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="shell space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Engine Capabilities</h2>
          <p className="muted text-sm max-w-lg mx-auto">
            Built for immersive, high-quality roleplay conversations with zero compromises.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article className="panel stagger-item p-5 space-y-2" style={{ animationDelay: "60ms" }}>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-bold text-xl">
              🧠
            </div>
            <h3 className="text-base font-semibold">131k Context Memory</h3>
            <p className="muted text-xs sm:text-sm leading-relaxed">
              Remembers long story arcs, scene states, and durable character facts seamlessly over extended sessions.
            </p>
          </article>

          <article className="panel stagger-item p-5 space-y-2" style={{ animationDelay: "120ms" }}>
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 font-bold text-xl">
              🏷️
            </div>
            <h3 className="text-base font-semibold">Dynamic Tag Taxonomy</h3>
            <p className="muted text-xs sm:text-sm leading-relaxed">
              Filter companions by tags like <em>Anime, Cozy, Fantasy, Furry, Support, NSFW, Sci-Fi</em>, or add custom tags.
            </p>
          </article>

          <article className="panel stagger-item p-5 space-y-2" style={{ animationDelay: "180ms" }}>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-xl">
              🎭
            </div>
            <h3 className="text-base font-semibold">Custom Personas</h3>
            <p className="muted text-xs sm:text-sm leading-relaxed">
              Tune speech patterns, mannerisms, scenarios, and custom avatar crops with interactive preview controls.
            </p>
          </article>

          <article className="panel stagger-item p-5 space-y-2" style={{ animationDelay: "240ms" }}>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-xl">
              ⚡
            </div>
            <h3 className="text-base font-semibold">Realtime Edge Streaming</h3>
            <p className="muted text-xs sm:text-sm leading-relaxed">
              Ultra-fast streaming word responses powered by high-speed edge architecture and smart placement.
            </p>
          </article>

          <article className="panel stagger-item p-5 space-y-2" style={{ animationDelay: "300ms" }}>
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 font-bold text-xl">
              🛡️
            </div>
            <h3 className="text-base font-semibold">Edge Security & Limits</h3>
            <p className="muted text-xs sm:text-sm leading-relaxed">
              Protected by sliding-window rate limiting, HTTP security headers, and secure authentication rules.
            </p>
          </article>

          <article className="panel stagger-item p-5 space-y-2" style={{ animationDelay: "360ms" }}>
            <div className="h-10 w-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-500 font-bold text-xl">
              🎨
            </div>
            <h3 className="text-base font-semibold">Focus Mode & Font Scaling</h3>
            <p className="muted text-xs sm:text-sm leading-relaxed">
              Customize text font sizes, toggle focus mode to hide navigation, and enjoy a rich dark glassmorphism aesthetic.
            </p>
          </article>
        </div>
      </section>

      {/* CTA Conversion Banner */}
      <section className="shell panel p-6 sm:p-10 text-center space-y-4 bg-gradient-to-r from-blue-900/20 via-slate-900/40 to-blue-900/20 border-blue-500/20">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ready to Start Your Roleplay?</h2>
        <p className="muted text-sm sm:text-base max-w-xl mx-auto">
          Create custom companions or chat with pre-made characters instantly.
        </p>
        <div className="pt-2">
          <Link
            href={user ? "/characters" : "/login"}
            className="btn-primary min-h-11 px-8 text-sm font-semibold shadow-lg shadow-blue-500/25"
          >
            {user ? "Jump to Characters →" : "Get Started Now"}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="shell border-t border-[var(--line)] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs muted">
        <p>© HowlingHeaven Studio 2026. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/characters" className="hover:underline">
            Characters
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms of Service
          </Link>
          <Link href="/redeem" className="hover:underline">
            Redeem Code
          </Link>
        </div>
      </footer>
    </main>
  );
}
