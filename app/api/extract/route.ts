import { NextResponse } from "next/server";

import { getProvider } from "@/lib/ai";
import type { ImageInput } from "@/lib/ai/provider";
import { guard, userKeyFrom } from "@/lib/api/guard";
import { fail, handleError } from "@/lib/api/respond";
import { extractPdf } from "@/lib/pdf";
import { isAcceptedImage, isPdf, MAX_FILE_BYTES, MAX_FILES } from "@/lib/image";
import { ledger } from "@/lib/spend";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ExtractedSource {
  name: string;
  kind: "image" | "pdf-text" | "pdf-scan";
  text: string;
  /** Passages the model couldn't read. Surfaced, never guessed at. */
  unclear: string[];
  error?: string;
}

export interface ExtractResponse {
  sources: ExtractedSource[];
  /** True when any source needed the vision model — the expensive path. */
  usedVision: boolean;
}

/**
 * Turn uploads into text, once.
 *
 * Extraction is separated from generation so that regenerating cards never
 * re-reads (or re-pays for) the original photos, and so the quality checker has
 * a source document to ground claims against.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return fail("invalid_request", "No files were uploaded.", 400);
    }
    if (files.length > MAX_FILES) {
      return fail("too_large", `Please upload at most ${MAX_FILES} files at a time.`, 413);
    }
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return fail("too_large", `${file.name} is larger than 10 MB.`, 413);
      }
      if (!isAcceptedImage(file.type) && !isPdf(file.type)) {
        return fail("invalid_request", `${file.name} is not an image or PDF.`, 400);
      }
    }

    // Whether this run costs anything depends on what's in it: a digital PDF is
    // free to read, a photo is not. Decide before charging the guard.
    const hasImages = files.some((f) => isAcceptedImage(f.type));
    const usesOwnKey = Boolean(userKeyFrom(request));
    const blocked = guard(request, { usesOwnKey, spends: hasImages });
    if (blocked) return blocked;

    const sources: ExtractedSource[] = [];
    const visionQueue: { input: ImageInput; index: number }[] = [];

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());

      if (isPdf(file.type)) {
        try {
          const result = await extractPdf(bytes, file.name);
          if (result.kind === "text") {
            sources.push({ name: file.name, kind: "pdf-text", text: result.text, unclear: [] });
          } else if (result.kind === "images") {
            const index = sources.length;
            sources.push({ name: file.name, kind: "pdf-scan", text: "", unclear: [] });
            for (const img of result.images) {
              visionQueue.push({ input: img, index });
            }
          } else {
            sources.push({
              name: file.name,
              kind: "pdf-text",
              text: "",
              unclear: [],
              error: "No readable text or images found in this PDF.",
            });
          }
        } catch (error) {
          sources.push({
            name: file.name,
            kind: "pdf-text",
            text: "",
            unclear: [],
            error: error instanceof Error ? error.message : "Could not read this PDF.",
          });
        }
        continue;
      }

      const index = sources.length;
      sources.push({ name: file.name, kind: "image", text: "", unclear: [] });
      visionQueue.push({
        input: {
          data: Buffer.from(bytes).toString("base64"),
          mediaType: file.type as ImageInput["mediaType"],
          name: file.name,
        },
        index,
      });
    }

    if (visionQueue.length > 0) {
      const provider = getProvider("extract", userKeyFrom(request));
      // One call for all pages: the model reads them in order and we split the
      // result back out, which is far cheaper than a call per page.
      const result = await provider.transcribe(visionQueue.map((v) => v.input));

      if (!usesOwnKey) ledger.add(result.usage.costUsd);

      const chunks = result.text.split(/\n-{3,}\n/);
      visionQueue.forEach((entry, i) => {
        const target = sources[entry.index];
        if (!target) return;
        const chunk = (chunks[i] ?? "").trim() || (chunks.length === 1 ? result.text.trim() : "");
        target.text = target.text ? `${target.text}\n\n${chunk}` : chunk;
        target.unclear = result.unclear;
      });
    }

    return NextResponse.json<ExtractResponse>({ sources, usedVision: visionQueue.length > 0 });
  } catch (error) {
    return handleError(error);
  }
}
