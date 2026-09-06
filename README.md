# Note2Card

**Turn your notes into flashcards.**

Upload a photo, PDF, or study guide. Note2Card extracts the important information
and creates paste-ready flashcards for Quizlet, Brainscape, and Anki.

## Getting started

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

No key handy? Every stage runs against an offline stub:

```bash
AI_PROVIDER=mock npm run dev
```

## How it works

```
Upload ──▶ Extract ──▶ Generate ──▶ Edit ──▶ Copy
```

Extraction and generation are deliberately separate stages. Photos are read once
into text; regenerating a card then costs one cheap text call instead of
re-reading every image, and the quality checker gets a source document to ground
"is this claim actually supported?" against.

| Input | Path | Cost |
|---|---|---|
| Photo | Vision model transcribes it | The expensive step |
| PDF with a text layer | `unpdf` reads it directly | Free — no model call |
| Scanned PDF | Page image extracted, then the vision path | The expensive step |
| Pasted text | Used as-is | Free |

## Configuration

Each pipeline stage picks its own provider and model, so the mix is a config
change rather than a code change. See `.env.example` for the full list.

```
AI_PROVIDER_EXTRACT=anthropic     ANTHROPIC_MODEL_EXTRACT=claude-opus-5
AI_PROVIDER_GENERATE=anthropic    ANTHROPIC_MODEL_GENERATE=claude-sonnet-5
AI_PROVIDER_CHECK=anthropic       ANTHROPIC_MODEL_CHECK=claude-haiku-4-5
```

Reading handwriting gets the strongest model, because a misread term becomes a
wrong flashcard a student then memorises. Writing cards from already-clean text
is a narrower task and runs on a cheaper model.

`MONTHLY_AI_BUDGET_USD` is a hard ceiling on free-tier spend. Costs are measured
from each response's real token usage, not estimated; when the month's total
crosses the ceiling, free generation pauses until it rolls over.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run eval` | Score card quality against fixtures |

### The eval harness

`npm run eval` runs the generation stage over a fixture set and scores coverage,
duplicate/vagueness findings, and — most importantly — **fabrications**: claims
that appear in the cards but not in the source. A single fabrication fails the
run, because a confidently wrong card is worse than no card.

This is the gate for moving generation onto a cheaper model. Establish a baseline
on the model you ship with, then:

```bash
AI_PROVIDER_GENERATE=openmodel npm run eval
```

Switch only if quality holds.

## Security

- `ANTHROPIC_API_KEY` is read server-side only. No credential is prefixed
  `NEXT_PUBLIC_`, so none reaches the browser.
- Every route validates its body with zod and enforces file type, size, count,
  and PDF page limits.
- Images are downscaled client-side before upload, which also strips EXIF.
- Notes are never logged, stored, or persisted server-side.
- An optional bring-your-own key lives only in the user's browser and is sent per
  request — never written to disk or logged.

## Architecture

```
app/
  page.tsx                landing
  create/page.tsx         the three-step workflow
  api/extract|generate|check/route.ts
lib/
  ai/         provider interface, Anthropic + open-model + mock, prompts, eval
  pdf.ts      text-layer extraction with a scanned-page fallback
  export.ts   Quizlet TSV, Brainscape CSV, Anki CSV, plain text
  checks.ts   deterministic quality checks (free, instant)
  quota.ts    free-tier limits    spend.ts  budget ceiling
components/
  landing/  create/  ui/
```

All card quality rules live in one place: `lib/ai/prompts.ts`.
