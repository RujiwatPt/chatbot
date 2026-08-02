import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Howly.ai",
  description: "Terms of Service for Howly.ai by HowlingHeaven Studio.",
};

export default function TermsPage() {
  return (
    <main className="page max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/" className="btn-text muted text-xs">
          ← Back to Howly.ai
        </Link>
        <h1 className="page-title mt-2">Terms of Service</h1>
        <p className="page-subtitle">Effective Date: August 3, 2026</p>
      </div>

      <div className="panel p-6 sm:p-8 space-y-6 text-sm leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">1. Acceptance of Terms</h2>
          <p className="muted">
            Welcome to <strong>Howly.ai</strong>, operated by <strong>HowlingHeaven Studio</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            By accessing or using Howly.ai, you agree to be bound by these Terms of Service (&quot;Terms&quot;) and our Privacy Policy.
            If you do not agree to these Terms, please do not use the service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">2. Description of Service</h2>
          <p className="muted">
            Howly.ai provides an interactive artificial intelligence roleplay and companion platform allowing users to create, customize, and chat with AI characters using persistent memory and context engines.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">3. User Accounts & Responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1.5 muted">
            <li>You must be at least 18 years of age or the age of legal majority in your jurisdiction to create an account.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.</li>
            <li>You agree to provide accurate account information and update it as necessary.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">4. User Conduct & Content Guidelines</h2>
          <p className="muted">
            You agree not to use Howly.ai to generate, upload, or share content that:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 muted">
            <li>Is unlawful, harmful, threatening, abusive, harassing, or defamatory.</li>
            <li>Promotes real-world violence, illegal acts, or severe self-harm.</li>
            <li>Infringes upon intellectual property rights or privacy rights of any third party.</li>
            <li>Attempts to exploit, harm, or compromise the platform security, servers, or rate limit controls.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">5. Intellectual Property Rights</h2>
          <p className="muted">
            All rights, title, and interest in and to Howly.ai, including platform software, branding, design systems, and original character presets, are owned by HowlingHeaven Studio.
            You retain ownership of the original text inputs and custom character descriptions you create.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">6. Privacy & Data Retention</h2>
          <p className="muted">
            Your privacy is important to us. Chat histories, character configurations, and preferences are stored securely and encrypted at rest.
            You may request account deletion at any time via your Account Settings page, which permanently removes all user data.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">7. Disclaimers & Limitation of Liability</h2>
          <p className="muted">
            Howly.ai is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind. AI responses are generated algorithmically for entertainment and creative roleplay purposes only and do not constitute professional, medical, legal, or psychological advice.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">8. Termination</h2>
          <p className="muted">
            We reserve the right to suspend or terminate your access to Howly.ai at our sole discretion, without prior notice, if you violate these Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">9. Changes to Terms</h2>
          <p className="muted">
            We may update these Terms from time to time. Continued use of Howly.ai following any updates constitutes your acceptance of the revised Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">10. Contact Us</h2>
          <p className="muted">
            If you have any questions or concerns regarding these Terms, please contact us at <strong>HowlingHeaven Studio</strong>.
          </p>
        </section>
      </div>

      {/* Footer link back */}
      <div className="text-center pt-2">
        <Link href="/" className="btn-outline btn-sm text-xs">
          Return to Homepage
        </Link>
      </div>
    </main>
  );
}
