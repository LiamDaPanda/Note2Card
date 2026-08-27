import { extractImages, extractText, getDocumentProxy } from "unpdf";

export interface PdfExtraction {
  kind: "text" | "images" | "empty";
  text: string;
  pages: number;
  /** Present when kind === "images": page scans that need the vision model. */
  images: { data: string; mediaType: "image/jpeg"; name: string }[];
}

/** Refuse anything with more pages than a student would reasonably upload. */
export const MAX_PDF_PAGES = 40;

/** Below this many characters a "text" PDF is really a scan with junk in it. */
const MIN_MEANINGFUL_CHARS = 120;

/** Rasterising many pages is slow and expensive; cap the scanned-PDF fallback. */
const MAX_SCANNED_PAGES = 8;

/**
 * Pull usable content out of a PDF.
 *
 * Digital PDFs have a text layer, which costs nothing to read — no model call at
 * all. A scanned PDF (a photo of a page saved as PDF) has no text layer, but its
 * pages are almost always a single embedded image, so we hand those to the same
 * vision path a photo upload takes.
 */
export async function extractPdf(bytes: Uint8Array, name: string): Promise<PdfExtraction> {
  const pdf = await getDocumentProxy(bytes);
  const pages = pdf.numPages;

  if (pages > MAX_PDF_PAGES) {
    throw new PdfTooLongError(name, pages);
  }

  // mergePages: true makes `text` a single string rather than one entry per page.
  const { text } = await extractText(pdf, { mergePages: true });
  const cleaned = text.trim();

  if (cleaned.replace(/\s/g, "").length >= MIN_MEANINGFUL_CHARS) {
    return { kind: "text", text: cleaned, pages, images: [] };
  }

  // No usable text layer — treat it as a scan.
  const images = await rasterisePages(pdf, Math.min(pages, MAX_SCANNED_PAGES), name);
  if (images.length === 0) {
    return { kind: "empty", text: cleaned, pages, images: [] };
  }
  return { kind: "images", text: "", pages, images };
}

/**
 * unpdf hands back raw pixel buffers; sharp encodes them to JPEG so they can go
 * into a message as base64. Imported lazily so the sharp binary is only loaded
 * when a scanned PDF actually shows up.
 */
async function rasterisePages(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageCount: number,
  name: string,
): Promise<{ data: string; mediaType: "image/jpeg"; name: string }[]> {
  const { default: sharp } = await import("sharp");
  const out: { data: string; mediaType: "image/jpeg"; name: string }[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    let extracted;
    try {
      extracted = await extractImages(pdf, page);
    } catch {
      continue; // A page we can't decode shouldn't kill the whole upload.
    }

    // A scanned page is one big image; ignore small decorations and logos.
    const largest = [...extracted].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!largest || largest.width * largest.height < 100_000) continue;

    const channels = largest.channels === 1 ? 1 : largest.channels === 3 ? 3 : 4;
    const jpeg = await sharp(Buffer.from(largest.data.buffer), {
      raw: { width: largest.width, height: largest.height, channels },
    })
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    out.push({
      data: jpeg.toString("base64"),
      mediaType: "image/jpeg",
      name: `${name} (page ${page})`,
    });
  }

  return out;
}

export class PdfTooLongError extends Error {
  constructor(
    public readonly filename: string,
    public readonly pages: number,
  ) {
    super(`${filename} has ${pages} pages; the limit is ${MAX_PDF_PAGES}.`);
    this.name = "PdfTooLongError";
  }
}
