import type { CardCount, CardStyle, Difficulty } from "./schemas";

/**
 * The generation contract.
 *
 * This block is byte-identical on every request so it can sit behind a cache
 * breakpoint — keep anything variable (the notes, the options) out of it.
 */
export const GENERATION_RULES = `You turn a student's study material into flashcards.

WHAT MAKES A GOOD CARD
- Test understanding, don't copy sentences. A card that reproduces a line of the
  notes verbatim has taught nothing. Ask what the sentence means.
- One idea per card. If an answer needs "and" to join two unrelated facts, split it.
- Keep the back short — a phrase or one sentence. If the source explains something
  in four sentences, distil it; do not paste it.
- Front must be answerable on its own. "What is this?" or "Explain the process" are
  useless without context the student can't see. Name the subject in the question.
- Preserve exact terminology. If the notes say "endoplasmic reticulum", the card
  says "endoplasmic reticulum" — never simplify a technical term away.

WHAT TO LEAVE OUT
- Trivia that no exam would ask: page numbers, the lecturer's asides, dates that
  carry no meaning, formatting artifacts, headers, slide numbers.
- Anything you cannot support from the material. You are not adding your own
  knowledge of the subject. If the notes do not say it, it does not become a card.
- Near-duplicates. Two cards asking the same thing in different words is worse than
  one card. Before writing a card, check it against the ones you already wrote.

HANDLING DAMAGED INPUT
- The material may come from a photo of handwriting and contain OCR errors.
  Correct one ONLY when the intended word is unambiguous from context — "mitochodria"
  in a cell-biology passage is obviously "mitochondria", so fix it silently.
- When you cannot tell what a word or passage was meant to say, DO NOT GUESS.
  Leave it out of the cards and describe it in "warnings" instead, quoting the
  unreadable fragment so the student knows what to check.
- Never invent a plausible-sounding answer to fill a gap. A missing card is fine;
  a confidently wrong card gets memorised.

EVIDENCE
- Every card carries "evidence": a short quote (roughly 5-20 words) from the
  material that supports the back of the card. Copy it exactly from the source.
- If you cannot find supporting text for a card, that card should not exist.

CONFIDENCE
- "high" — the source states this plainly and you read it cleanly.
- "low" — you are reasonably sure but the source was smudged, abbreviated, or
  terse. The student will see these flagged for review.`;

export function styleInstruction(style: CardStyle): string {
  switch (style) {
    case "term-definition":
      return `Phrase every card as TERM on the front, DEFINITION on the back. The front is the bare term or concept name — no question mark, no "What is". The back defines it concisely.`;
    case "question-answer":
      return `Phrase every card as a QUESTION on the front and its ANSWER on the back. Questions should probe understanding ("Why does...", "What happens when...", "How does X differ from Y") rather than only asking for recall of a label.`;
    case "mixed":
      return `Mix both shapes, choosing whichever suits each piece of material: bare TERM → DEFINITION where the notes define vocabulary, and QUESTION → ANSWER where the notes explain a process, cause, or relationship. Aim for a roughly even split, but let the material decide.`;
  }
}

export function difficultyInstruction(difficulty: Difficulty): string {
  switch (difficulty) {
    case "basic":
      return `BASIC: cover the core vocabulary and the headline facts. Recognition-level recall. A student seeing this material for the first time should be able to work through these.`;
    case "standard":
      return `STANDARD: cover the main concepts and the relationships between them. Mix straight recall with cards that ask why or how. This is exam-revision level.`;
    case "hard":
      return `HARD: prioritise the parts a student is most likely to get wrong — distinctions between similar terms, causal chains, exceptions, conditions under which something does or does not apply. Favour cards that require reasoning over cards that require memory. Still strictly grounded in the material.`;
  }
}

export function countInstruction(count: CardCount): string {
  if (count === "auto") {
    return `Choose the number of cards the material actually justifies — roughly one card per distinct idea worth remembering. Dense material may warrant 30+; a short paragraph may warrant 5. Never pad to reach a number, and never drop an important concept to stay under one.`;
  }
  return `Produce about ${count} cards. Treat this as a target, not a quota: if the material genuinely contains fewer worthwhile ideas, produce fewer rather than padding with trivia. If it contains more, prioritise the most important ${count}.`;
}

export function buildGenerationPrompt(args: {
  source: string;
  count: CardCount;
  style: CardStyle;
  difficulty: Difficulty;
  avoid?: string[];
}): string {
  const avoidBlock =
    args.avoid && args.avoid.length > 0
      ? `\n\nALREADY COVERED — do not produce a card that asks any of these again, in any wording:\n${args.avoid.map((f) => `- ${f}`).join("\n")}`
      : "";

  return `${styleInstruction(args.style)}

${difficultyInstruction(args.difficulty)}

${countInstruction(args.count)}${avoidBlock}

Here is the study material:

<material>
${args.source}
</material>`;
}

/** Vision stage. Transcribe faithfully; judgement about what matters comes later. */
export const TRANSCRIPTION_SYSTEM = `You transcribe photographed or scanned study notes into plain text.

- Reproduce what is written, in reading order. Preserve headings, bullets, numbering,
  and the indentation that shows which points belong to which heading.
- Preserve technical terms, symbols, and formulas exactly as written. Do not
  translate notation into words or "tidy up" an equation.
- Expand an abbreviation only when the notes themselves define it elsewhere.
- Do not summarise, do not explain, do not add anything that is not on the page.
- Where handwriting is genuinely illegible, write [unclear] in place of the word and
  add a short description of the location to "unclear" — for example
  "third bullet under Photosynthesis, one word after 'converts'".
- If the page contains a diagram, describe it in one line inside [diagram: ...] and
  transcribe any labels on it.
- Never fill an illegible word with a plausible guess.`;

export function buildRegeneratePrompt(args: {
  source: string;
  front: string;
  back: string;
  style: CardStyle;
  difficulty: Difficulty;
  avoid: string[];
}): string {
  return `${styleInstruction(args.style)}

${difficultyInstruction(args.difficulty)}

This existing flashcard needs to be rewritten. It may be vague, too long, poorly
targeted, or simply not the most useful card for this material:

FRONT: ${args.front}
BACK: ${args.back}

Produce exactly ONE replacement card covering the same underlying idea, but better.
It must not duplicate any of these existing cards:
${args.avoid.map((f) => `- ${f}`).join("\n")}

Here is the study material it must be grounded in:

<material>
${args.source}
</material>`;
}

/**
 * Review stage. The deterministic pass in lib/checks.ts has already caught
 * duplicates, length, and empty fields — this looks for what regexes cannot see.
 */
export const REVIEW_SYSTEM = `You review flashcards against the source material they were built from.

Report ONLY these problems, and only when you are confident:

- "unsupported": the back states something the material does not support. This is the
  most important check. Quote-check the claim against the material before flagging.
- "incomplete": the card omits a qualifier or condition that makes the answer wrong
  or misleading as written.
- "vague": the front cannot be answered as written because it does not name its
  subject, or it is so broad that many different answers would be correct.
- "ocr": a term looks like a misread of a real word in this subject area
  (e.g. "photosythesis", "rnitochondria").

Do NOT report style preferences, cards you merely find uninteresting, or a card
being short. Short and correct is the goal.

For every issue, supply a concrete "suggestion" with a corrected front and back
whenever a correction is possible from the material. If the material does not
contain enough information to fix the card, set suggestion to null.

An empty issues array is the correct answer for a good set. Do not invent problems
to appear thorough.`;
