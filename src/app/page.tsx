import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import AvatarImage from "@/components/AvatarImage";
import { getCharacterAvatar, getDefaultCharacterAvatar } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "./ThemeToggle";

export const dynamic = "force-dynamic";

const fallbackFeatured = [
  {
    id: "1",
    name: "Aiko",
    alias: "The classmate who never says what she means",
    persona_display: "Aiko is your energetic tsundere classmate.",
    avatar_url: "/images/avatar_aiko.jpg",
    tags: ["Anime", "Slow burn"],
  },
  {
    id: "2",
    name: "Sam",
    alias: "Your oldest friend, and safest place",
    persona_display: "Sam is your childhood best friend.",
    avatar_url: "/images/avatar_sam.jpg",
    tags: ["Cozy", "Everyday"],
  },
  {
    id: "3",
    name: "Kael",
    alias: "A loyal companion from a wilder world",
    persona_display: "Kael is your wolf beastman companion.",
    avatar_url: "/images/avatar_kael.jpg",
    tags: ["Fantasy", "Adventure"],
  },
  {
    id: "4",
    name: "Dr. Mira Vance",
    alias: "A calm voice when the world gets loud",
    persona_display: "Dr. Mira Vance is a compassionate therapist.",
    avatar_url: "/images/avatar_mira.jpg",
    tags: ["Support", "Thoughtful"],
  },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const benefits = [
  {
    number: "01",
    title: "Persistent memory",
    description: "Characters remember story arcs, scene states, promises, and durable facts across sessions.",
  },
  {
    number: "02",
    title: "Your own characters",
    description: "Shape a distinct voice, appearance, mannerisms, history, and boundaries for every companion.",
  },
  {
    number: "03",
    title: "Responsive storytelling",
    description: "Streaming replies keep long-form roleplay immediate without sacrificing narrative continuity.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/characters");

  const { data: publicCharacters } = await supabase
    .from("characters")
    .select("id, name, alias, persona_display, avatar_url, tags")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(4);

  const isUsingFallbacks = !publicCharacters || publicCharacters.length === 0;
  const featured = isUsingFallbacks ? fallbackFeatured : publicCharacters;

  return (
    <main className="px-3 pb-[calc(var(--safe-bottom)+1.5rem)] pt-4 sm:px-6 sm:pb-10 sm:pt-6">
      <header className="shell mb-4 flex items-center justify-between gap-4 sm:mb-6">
        <Link href="/" className="page-title text-xl" aria-label="Howly.ai home">
          Howly<span className="text-blue-600 dark:text-blue-400">.ai</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/terms" className="muted btn-text hidden sm:inline-flex">Terms</Link>
          <ThemeToggle />
          <Link href="/login" className="btn-outline min-h-10 px-4">Sign in</Link>
        </div>
      </header>

      <section className="panel shell reveal-up overflow-hidden p-5 sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              AI roleplay with continuity
            </div>
            <h1 className="page-title text-3xl font-extrabold sm:text-5xl">
              Characters that remember <span className="gradient-text">your story.</span>
            </h1>
            <p className="page-subtitle max-w-xl text-base leading-relaxed">
              Create a companion with a distinct voice, then build conversations that carry shared history forward instead of starting over.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary min-h-11 px-6">
                Start chatting <ArrowIcon />
              </Link>
              <Link href="#characters" className="btn-outline min-h-11 px-6">
                Explore characters
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted)]">
              <span>Long-form memory</span>
              <span>Custom personas</span>
              <span>Streaming replies</span>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-slate-950 shadow-xl">
            <Image
              src="/images/hero_roleplay.jpg"
              alt="A roleplay creator exploring a cast of AI characters"
              width={512}
              height={512}
              priority
              sizes="(max-width: 1024px) 92vw, 430px"
              className="h-auto w-full"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent p-4 pt-16">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Memory carried forward</p>
              <p className="mt-1 text-sm font-medium text-white/90">Every chapter becomes context for the next.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="characters" className="shell mt-8 scroll-mt-4">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">Community characters</p>
            <h2 className="mt-1 text-xl font-bold">Choose someone to meet</h2>
          </div>
          <Link href="/login" className="btn-text muted text-sm">Sign in to view all</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((character, index) => {
            const avatarSrc = getCharacterAvatar(character.name, character.alias, character.avatar_url);
            const fallbackSrc = getDefaultCharacterAvatar(character.name, character.alias);
            const href = isUsingFallbacks ? "/characters" : `/characters/${character.id}`;
            const tag = Array.isArray(character.tags) ? character.tags[0] : undefined;

            return (
              <Link
                key={character.id}
                href={href}
                className="panel panel-hover stagger-item overflow-hidden p-3"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-[var(--surface-solid)]">
                  <AvatarImage
                    src={avatarSrc}
                    fallbackSrc={fallbackSrc}
                    alt={`Portrait of ${character.name}`}
                    sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 220px"
                    className="object-cover transition-transform duration-300 hover:scale-105"
                  />
                  {tag && <span className="badge absolute right-2 top-2 border-none bg-slate-950/80 text-white shadow-md backdrop-blur-md">{tag}</span>}
                </div>
                <h3 className="text-sm font-bold">{character.name}</h3>
                <p className="muted mt-0.5 line-clamp-1 text-xs">
                  {character.alias || character.persona_display || "An unforgettable roleplay companion"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="shell mt-8 grid gap-4 sm:grid-cols-3">
        {benefits.map((benefit, index) => (
          <article key={benefit.number} className="panel stagger-item p-5" style={{ animationDelay: `${80 + index * 60}ms` }}>
            <span className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-blue-500/20 bg-blue-500/10 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
              {benefit.number}
            </span>
            <h2 className="text-base font-semibold">{benefit.title}</h2>
            <p className="muted mt-1.5 text-sm leading-relaxed">{benefit.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
