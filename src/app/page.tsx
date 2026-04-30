import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-3xl font-semibold">Roleplay Chatbot</h1>
        <p className="text-sm text-neutral-500">
          Persistent-memory roleplay with your own characters. Invite-only.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
