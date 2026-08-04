import Image from "next/image";
import Link from "next/link";
import { getCharacterAvatar } from "@/lib/avatar";
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

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M12 2.75c.55 4.83 3.42 7.7 8.25 8.25-4.83.55-7.7 3.42-8.25 8.25C11.45 14.42 8.58 11.55 3.75 11 8.58 10.45 11.45 7.58 12 2.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: publicCharacters } = await supabase
    .from("characters")
    .select("id, name, alias, persona_display, avatar_url, tags")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(4);

  const isUsingFallbacks = !publicCharacters || publicCharacters.length === 0;
  const displayFeatured = isUsingFallbacks ? fallbackFeatured : publicCharacters;
  const primaryHref = user ? "/characters" : "/login";

  return (
    <main className="landing-page">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />

      {!user && (
        <header className="landing-header landing-container reveal-up">
          <Link href="/" className="landing-wordmark" aria-label="Howly.ai home">
            <span className="landing-wordmark-mark"><SparkIcon /></span>
            <span>Howly<span>.ai</span></span>
          </Link>
          <nav className="landing-nav" aria-label="Primary navigation">
            <Link href="#characters">Characters</Link>
            <Link href="#experience">Experience</Link>
            <Link href="/terms">Terms</Link>
          </nav>
          <div className="landing-header-actions">
            <ThemeToggle />
            <Link href="/login" className="landing-header-cta">
              Sign in <ArrowIcon />
            </Link>
          </div>
        </header>
      )}

      {user && (
        <div className="landing-session landing-container reveal-up">
          <span><i /> Welcome back. Your stories are waiting.</span>
          <Link href="/characters">Continue where you left off <ArrowIcon /></Link>
        </div>
      )}

      <section className="landing-hero landing-container">
        <div className="landing-hero-copy reveal-up">
          <div className="landing-eyebrow">
            <span>Persistent-memory roleplay</span>
            <span className="landing-eyebrow-line" />
          </div>
          <h1>
            Characters that remember <em>the whole story.</em>
          </h1>
          <p className="landing-lede">
            Build a companion with a voice, a history, and a point of view—then
            step into conversations that deepen over time instead of starting over.
          </p>
          <div className="landing-actions">
            <Link href={primaryHref} className="landing-primary-button">
              {user ? "Explore characters" : "Begin your story"} <ArrowIcon />
            </Link>
            <Link href="/characters" className="landing-secondary-button">
              Meet the cast
            </Link>
          </div>
          <div className="landing-proof" aria-label="Product highlights">
            <div><strong>131K</strong><span>context window</span></div>
            <div><strong>∞</strong><span>story possibilities</span></div>
            <div><strong>Live</strong><span>streaming replies</span></div>
          </div>
        </div>

        <div className="landing-hero-visual reveal-up" style={{ animationDelay: "120ms" }}>
          <div className="landing-visual-frame">
            <Image
              src="/images/hero_roleplay.jpg"
              alt="A roleplay creator exploring a cast of AI characters"
              fill
              priority
              sizes="(max-width: 900px) 92vw, 46vw"
              className="landing-hero-image"
            />
            <div className="landing-image-wash" />
            <div className="landing-chapter-label">
              <span>Chapter 07</span>
              <span>The blue hour</span>
            </div>
            <div className="landing-memory-card">
              <div className="landing-memory-heading">
                <span><SparkIcon /> Memory recalled</span>
                <i />
              </div>
              <p>“You remembered the promise we made at the train station.”</p>
              <small>From your conversation · 18 days ago</small>
            </div>
          </div>
          <div className="landing-orbit-note">
            <span>01</span>
            Long-form memory<br />keeps every chapter connected.
          </div>
        </div>
      </section>

      <section className="landing-marquee" aria-label="Howly capabilities">
        <div>
          <span>Distinct voices</span><i />
          <span>Persistent memory</span><i />
          <span>Your characters</span><i />
          <span>Living worlds</span><i />
          <span>Distinct voices</span><i />
          <span>Persistent memory</span>
        </div>
      </section>

      <section id="characters" className="landing-section landing-container">
        <div className="landing-section-heading">
          <div>
            <span className="landing-kicker">Featured characters</span>
            <h2>Someone is waiting<br />to meet you.</h2>
          </div>
          <div className="landing-section-aside">
            <p>Start with a community favorite, or shape every detail of someone entirely your own.</p>
            <Link href="/characters">Browse every character <ArrowIcon /></Link>
          </div>
        </div>

        <div className="landing-character-grid">
          {displayFeatured.map((character, index) => {
            const avatarSrc = getCharacterAvatar(character.name, character.alias, character.avatar_url);
            const tags = Array.isArray(character.tags) ? character.tags.slice(0, 2) : [];
            const href = isUsingFallbacks ? "/characters" : `/characters/${character.id}`;

            return (
              <Link
                key={character.id}
                href={href}
                prefetch={false}
                className="landing-character-card stagger-item"
                style={{ animationDelay: `${80 + index * 70}ms` }}
              >
                <div className="landing-character-image-wrap">
                  <Image
                    src={avatarSrc}
                    alt={`Portrait of ${character.name}`}
                    fill
                    sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 23vw"
                    className="landing-character-image"
                  />
                  <span className="landing-card-number">0{index + 1}</span>
                  <span className="landing-card-arrow"><ArrowIcon /></span>
                </div>
                <div className="landing-character-meta">
                  <div>
                    <h3>{character.name}</h3>
                    <p>{character.alias || character.persona_display || "An unforgettable roleplay companion"}</p>
                  </div>
                  <div className="landing-tag-row">
                    {tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="experience" className="landing-experience">
        <div className="landing-container">
          <div className="landing-experience-intro">
            <span className="landing-kicker">Made for immersion</span>
            <h2>The conversation ends.<br /><em>The connection doesn’t.</em></h2>
            <p>
              Howly keeps the details that make a story feel real—your shared history,
              the mood of the scene, and the small things a character would never forget.
            </p>
          </div>

          <div className="landing-feature-grid">
            <article className="landing-feature landing-feature-large">
              <span className="landing-feature-index">01 / Memory</span>
              <div className="landing-memory-stack" aria-hidden="true">
                <div><small>Scene</small><p>The last train north</p><span>Active now</span></div>
                <div><small>Relationship</small><p>Trust earned slowly</p><span>Updated</span></div>
                <div><small>Promise</small><p>Meet beneath the old clock</p><span>Remembered</span></div>
              </div>
              <div className="landing-feature-copy">
                <h3>Continuity that feels natural</h3>
                <p>Durable facts and rolling summaries keep long stories coherent without making the conversation feel mechanical.</p>
              </div>
            </article>

            <article className="landing-feature">
              <span className="landing-feature-index">02 / Creation</span>
              <div className="landing-voice-lines" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i /><i />
              </div>
              <div className="landing-feature-copy">
                <h3>A voice, not a template</h3>
                <p>Define mannerisms, boundaries, history, and appearance to create someone unmistakably their own.</p>
              </div>
            </article>

            <article className="landing-feature landing-feature-accent">
              <span className="landing-feature-index">03 / Flow</span>
              <div className="landing-stream-mark" aria-hidden="true"><SparkIcon /></div>
              <div className="landing-feature-copy">
                <h3>Replies at the speed of thought</h3>
                <p>Responsive edge streaming keeps the rhythm of a real exchange—focused, immediate, and alive.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-final-cta landing-container">
        <div>
          <span className="landing-kicker">Your next chapter</span>
          <h2>Meet a character<br />worth remembering.</h2>
        </div>
        <div>
          <p>No blank slates. No disposable conversations. Just richer stories every time you return.</p>
          <Link href={primaryHref} className="landing-primary-button">
            {user ? "Return to your stories" : "Start for free"} <ArrowIcon />
          </Link>
        </div>
      </section>

      <footer className="landing-footer landing-container">
        <Link href="/" className="landing-wordmark">
          <span className="landing-wordmark-mark"><SparkIcon /></span>
          <span>Howly<span>.ai</span></span>
        </Link>
        <p>Persistent-memory roleplay, crafted for deeper stories.</p>
        <div>
          <Link href="/characters">Characters</Link>
          <Link href="/terms">Terms</Link>
          <span>© 2026 HowlingHeaven Studio</span>
        </div>
      </footer>
    </main>
  );
}
