import Link from "next/link";
import ThemeToggle from "../ThemeToggle";

export const metadata = {
  title: "Privacy Policy | Howly.ai",
  description: "Privacy Policy for Howly.ai by HowlingHeaven Studio.",
};

export default function PrivacyPage() {
  return (
    <main className="page max-w-3xl mx-auto space-y-6">
      <ThemeToggle className="theme-toggle-corner" />
      <div>
        <Link href="/" className="btn-text muted text-xs">
          ← Back to Howly.ai
        </Link>
        <h1 className="page-title mt-2">Privacy Policy</h1>
        <p className="page-subtitle">Effective Date: August 5, 2026</p>
      </div>

      <div className="panel p-6 sm:p-8 space-y-6 text-sm leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">1. Information We Collect</h2>
          <p className="muted">
            At <strong>Howly.ai</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), operated by <strong>HowlingHeaven Studio</strong>, we collect minimal personal information necessary to provide our roleplay platform:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 muted">
            <li><strong>Account Information:</strong> Email address and profile name provided via Google OAuth authentication.</li>
            <li><strong>User Content:</strong> Chat messages, character configurations, personas, and memory preferences.</li>
            <li><strong>Usage & Technical Data:</strong> Operational logs, IP addresses for edge rate limiting, and technical metrics required to operate Cloudflare Workers securely.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">2. Data Security & Encryption</h2>
          <p className="muted">
            We prioritize the security of your data. All sensitive user content, including chat histories, custom character definitions, and long-term memory summaries, are encrypted at rest using industry-standard AES encryption keys.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1.5 muted">
            <li>To authenticate your session and maintain your character preferences.</li>
            <li>To generate dynamic AI character responses via secure LLM providers (e.g., OpenRouter).</li>
            <li>To enforce rate limits and prevent platform abuse.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">4. Account Erasure & GDPR Compliance</h2>
          <p className="muted">
            In compliance with global privacy standards including the GDPR &quot;Right to Erasure,&quot; you can permanently delete your account at any time from your Account Settings page. Calling account deletion immediately and permanently purges your account from authentication records, database tables, and cloud storage.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">5. Third-Party Services</h2>
          <p className="muted">
            We utilize trusted infrastructure providers including Supabase (authentication and database), Cloudflare (hosting, Workers, and R2 storage), and OpenRouter (LLM inference). We do not sell or rent your personal data to third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">6. Contact Us</h2>
          <p className="muted">
            If you have questions or privacy requests, please reach out to us at <strong>HowlingHeaven Studio</strong>.
          </p>
        </section>
      </div>

      <div className="text-center pt-2">
        <Link href="/" className="btn-outline btn-sm text-xs">
          Return to Homepage
        </Link>
      </div>
    </main>
  );
}
