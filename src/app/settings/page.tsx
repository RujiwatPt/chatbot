import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";
import DeleteAccountButton from "./DeleteAccountButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: profile },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      .select("display_name, pronouns, invite_code, created_at")
      .maybeSingle(),
  ]);

  if (!user) {
    redirect("/login");
  }

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  return (
    <main className="page max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/characters" prefetch={false} className="btn-text muted text-xs">
          ← Back to Characters
        </Link>
        <h1 className="page-title mt-2">Account Settings</h1>
        <p className="page-subtitle">Manage your default persona identity and account preferences.</p>
      </div>

      {/* Account Info */}
      <section className="panel p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-bold">Account Overview</h2>
        <div className="grid gap-3 text-xs sm:text-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[var(--line)] pb-2.5">
            <span className="muted">Email</span>
            <span className="font-mono font-medium">{user.email ?? "No email linked"}</span>
          </div>
          {profile?.invite_code && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[var(--line)] pb-2.5">
              <span className="muted">Invite Code</span>
              <span className="font-mono font-medium text-blue-500">{profile.invite_code}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="muted">Member Since</span>
            <span className="font-medium">{joinedDate}</span>
          </div>
        </div>
      </section>

      {/* Profile Preferences */}
      <section className="panel p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold">Profile Identity</h2>
        <SettingsForm
          initialDisplayName={profile?.display_name ?? ""}
          initialPronouns={profile?.pronouns ?? ""}
        />
      </section>

      {/* Danger Zone */}
      <section className="panel p-5 sm:p-6 space-y-4 border-red-500/30 bg-red-500/5">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-red-500 dark:text-red-400">Danger Zone</h2>
          <p className="muted text-xs sm:text-sm">
            Permanently remove your account and all associated characters, chat logs, and profile data.
          </p>
        </div>
        <DeleteAccountButton userEmail={user.email ?? ""} />
      </section>
    </main>
  );
}
