import Link from "next/link";
import { Suspense } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import { Workspace } from "@/components/create/Workspace";
import { CreateHeader } from "@/components/create/CreateHeader";

export const metadata = {
  title: "Create flashcards — Note2Card",
};

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;

  return (
    <ToastProvider>
      <CreateHeader />
      <main>
        <Suspense fallback={null}>
          <Workspace startInTextMode={mode === "text"} />
        </Suspense>
      </main>
      <footer className="mx-auto max-w-5xl border-t border-line px-6 py-8">
        <p className="text-sm text-ink-3">
          Your notes are sent to an AI model to make cards and are not stored on our servers.{" "}
          <Link href="/" className="underline-offset-4 hover:text-ink hover:underline">
            About Note2Card
          </Link>
        </p>
      </footer>
    </ToastProvider>
  );
}
