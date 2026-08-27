import Link from "next/link";

export function CreateHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
      <Link
        href="/"
        className="text-[15px] font-semibold tracking-tight text-ink transition-colors hover:text-ink-2"
      >
        Note2Card
      </Link>
      <Link
        href="/create#premium"
        id="premium"
        className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
      >
        Go Premium
      </Link>
    </header>
  );
}
