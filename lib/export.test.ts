import { describe, expect, it } from "vitest";

import { toBrainscape, toCsv, toPlainText, toQuizlet } from "./export";
import type { Card } from "./ai/schemas";

function card(front: string, back: string): Card {
  return { id: front, front, back, confidence: "high", evidence: "" };
}

describe("toQuizlet", () => {
  it("separates the two sides with a tab, one card per line", () => {
    const output = toQuizlet([card("Diffusion", "High to low."), card("Osmosis", "Water only.")]);
    expect(output).toBe("Diffusion\tHigh to low.\nOsmosis\tWater only.");
  });

  it("flattens embedded tabs and newlines that would break the row", () => {
    const output = toQuizlet([card("A\tterm", "First line\nsecond line")]);
    // Exactly one tab must survive: the field separator.
    expect(output.split("\t")).toHaveLength(2);
    expect(output).not.toContain("\n");
    expect(output).toBe("A term\tFirst line second line");
  });

  it("round-trips into a two-column grid", () => {
    const cards = [card("Front one", "Back one"), card("Front two", "Back two")];
    const rows = toQuizlet(cards)
      .split("\n")
      .map((line) => line.split("\t"));

    expect(rows).toEqual([
      ["Front one", "Back one"],
      ["Front two", "Back two"],
    ]);
  });
});

describe("toCsv", () => {
  it("includes a header and CRLF line endings", () => {
    const output = toCsv([card("Term", "Definition")]);
    expect(output).toBe("Front,Back\r\nTerm,Definition");
  });

  it("quotes fields containing a comma", () => {
    const output = toCsv([card("Sodium-potassium pump", "3 Na+ out, 2 K+ in")]);
    expect(output).toBe('Front,Back\r\nSodium-potassium pump,"3 Na+ out, 2 K+ in"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const output = toCsv([card('The "light" reactions', "In the thylakoid.")]);
    expect(output).toBe('Front,Back\r\n"The ""light"" reactions",In the thylakoid.');
  });

  it("parses back to two columns with the quotes intact", () => {
    const original = card("A, comma", 'A "quote"');
    const body = toCsv([original], { header: false });
    expect(parseCsvRow(body)).toEqual(["A, comma", 'A "quote"']);
  });

  it("can omit the header", () => {
    expect(toCsv([card("A", "B")], { header: false })).toBe("A,B");
  });
});

describe("toBrainscape", () => {
  it("emits two comma-separated columns, question first", () => {
    expect(toBrainscape([card("What is ATP?", "The cell's energy currency.")])).toBe(
      "What is ATP?,The cell's energy currency.",
    );
  });

  it("quotes a field containing a comma", () => {
    expect(toBrainscape([card("Pump", "3 out, 2 in")])).toBe('Pump,"3 out, 2 in"');
  });
});

describe("toPlainText", () => {
  it("puts each side on its own line with a blank line between cards", () => {
    expect(toPlainText([card("A", "B"), card("C", "D")])).toBe("A\nB\n\nC\nD");
  });
});

/** A minimal RFC-4180 row parser, used to prove the escaping actually round-trips. */
function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (quoted) {
      if (char === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}
