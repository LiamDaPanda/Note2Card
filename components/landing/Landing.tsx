import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Landing() {
  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Note2Card
        </span>
        <Link
          href="/create"
          className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Open the app
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <Hero />
        <BeforeAfter />
        <Why />
        <MessyExample />
        <ClosingCta />
      </main>

      <footer className="mx-auto mt-24 max-w-5xl border-t border-line px-6 py-8">
        <p className="text-sm text-ink-3">
          Note2Card · Your notes are processed to make cards and are never stored.
        </p>
      </footer>
    </>
  );
}

function Hero() {
  return (
    <section className="pt-12 pb-20 sm:pt-20 sm:pb-28">
      <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
        Turn your notes into flashcards.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
        Upload a photo, PDF, or study guide. Note2Card extracts the important
        information and creates paste-ready flashcards.
      </p>

      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/create"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-medium text-accent-ink shadow-sm transition-colors hover:bg-accent-hover"
        >
          Upload Notes
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <Link
          href="/create?mode=text"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-line bg-surface px-6 text-base font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          Paste Text
        </Link>
      </div>

      <p className="mt-5 text-sm text-ink-3">
        No account needed. 10 free sets a day.
      </p>
    </section>
  );
}

function BeforeAfter() {
  return (
    <section className="pb-24">
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        <div className="rounded-2xl border border-line bg-surface-2 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Before
          </p>
          <p className="mt-4 leading-relaxed text-ink-2">
            Photosynthesis is the process by which plants convert light energy
            into chemical energy…
          </p>
        </div>

        <div className="rounded-2xl border border-accent/25 bg-accent-soft p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            After
          </p>
          <dl className="mt-4 space-y-2">
            <dt className="font-medium text-ink">What is photosynthesis?</dt>
            <dd className="flex gap-2 leading-relaxed text-ink-2">
              <span aria-hidden className="text-accent">
                →
              </span>
              The process by which plants convert light energy into chemical
              energy.
            </dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    emoji: "📸",
    title: "Snap",
    body: "Upload a picture of your notes.",
  },
  {
    emoji: "🤖",
    title: "Generate",
    body: "AI turns the important information into useful cards.",
  },
  {
    emoji: "📋",
    title: "Paste",
    body: "Copy them directly into your favorite flashcard app.",
  },
];

function Why() {
  return (
    <section className="border-t border-line py-24">
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Why Note2Card?
      </h2>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">
        Stop spending 20 minutes turning a study guide into flashcards.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className="rounded-2xl border border-line bg-surface p-6"
          >
            <span aria-hidden className="text-2xl">
              {feature.emoji}
            </span>
            <h3 className="mt-3 font-semibold text-ink">{feature.title}</h3>
            <p className="mt-1.5 leading-relaxed text-ink-2">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MESSY = `Bio unit 3 — cell transport!!
diffusion = molecules high → low conc. NO energy needed
osmosis: water only, across semi-permeable membrane
active transport NEEDS ATP (pumps against gradient)
** sodium-potassium pump: 3 Na+ out, 2 K+ in **
isotonic = no net movement`;

const CLEAN = [
  { front: "Diffusion", back: "Movement of molecules from high to low concentration, without energy." },
  { front: "What distinguishes osmosis from diffusion?", back: "Osmosis moves only water across a semi-permeable membrane." },
  { front: "Why does active transport require ATP?", back: "It moves substances against their concentration gradient." },
  { front: "Sodium-potassium pump ratio", back: "3 Na⁺ out for every 2 K⁺ in." },
];

function MessyExample() {
  return (
    <section className="border-t border-line py-24">
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        From a messy study guide to a clean set
      </h2>
      <p className="mt-4 max-w-xl leading-relaxed text-ink-2">
        Real notes have arrows, abbreviations, and stars in the margin. Note2Card
        reads them the way you would.
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="rounded-2xl border border-line bg-surface-2 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Your notes
          </p>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-relaxed text-ink-2">
            {MESSY}
          </pre>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Your cards
          </p>
          {CLEAN.map((card) => (
            <div
              key={card.front}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <p className="font-medium text-ink">{card.front}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{card.back}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="border-t border-line py-24 text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Turn your notes into flashcards in seconds.
      </h2>
      <Link
        href="/create"
        className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-medium text-accent-ink shadow-sm transition-colors hover:bg-accent-hover"
      >
        Get started
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
