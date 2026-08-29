import {
  callOpenAIChat,
  type OpenAIContentPart,
  type OpenAIChatMessage,
} from "@/lib/openai.service.ts";
import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {buildExtractionPrompt} from "@/lib/data-import/extract/prompt.ts";
import {
  parseExtractionResponse,
  parseGraphExtractionResponse,
} from "@/lib/data-import/extract/parse-response.ts";
import {rasterizePdfPages, MAX_PDF_PAGES_DEFAULT} from "@/lib/data-import/extract/pdf.ts";
import type {
  ImportConfiguration,
  RawExtractedRecords,
  SourceKind,
} from "@/lib/data-import/types.ts";

const MAX_IMAGE_EDGE = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Downscale an image File to a JPEG data URL (max edge MAX_IMAGE_EDGE).
 */
export async function fileToResizedDataUrl(
  file: File,
  options?: {signal?: AbortSignal; maxEdge?: number}
): Promise<string> {
  throwIfAborted(options?.signal);
  const maxEdge = options?.maxEdge ?? MAX_IMAGE_EDGE;
  const bitmap = await createImageBitmap(file);
  try {
    throwIfAborted(options?.signal);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas for image resize.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

async function extractFromImageUrls(
  config: ImportConfiguration,
  imageUrls: string[],
  options?: {signal?: AbortSignal}
): Promise<RawExtractedRecords> {
  throwIfAborted(options?.signal);
  let promptConfig = config;
  if (config.enrichExtractionContext && config.db) {
    try {
      const extra = await config.enrichExtractionContext(config.db);
      if (extra?.trim()) {
        promptConfig = {
          ...config,
          extractionInstructions: `${config.extractionInstructions.trim()}\n\n${extra.trim()}`,
        };
      }
    } catch {
      // Catalog enrichment is best-effort; extraction still runs.
    }
  }
  const prompt = buildExtractionPrompt(promptConfig);
  const content: OpenAIContentPart[] = [
    {type: "text", text: prompt},
    ...imageUrls.map(
      (url): OpenAIContentPart => ({
        type: "image_url",
        image_url: {url, detail: "high"},
      })
    ),
  ];

  const messages: OpenAIChatMessage[] = [
    {role: "system", content: "You extract structured JSON from documents. Reply with JSON only."},
    {role: "user", content},
  ];

  let response;
  try {
    response = await callOpenAIChat({
      messages,
      task: "ocr",
      responseFormat: {type: "json_object"},
      signal: options?.signal,
    });
  } catch (err: any) {
    // Some OpenAI-compatible providers reject response_format; retry without it.
    const msg = String(err?.message || err || "");
    if (/response_format|json_object|unsupported/i.test(msg)) {
      response = await callOpenAIChat({
        messages,
        task: "ocr",
        signal: options?.signal,
      });
    } else {
      throw err;
    }
  }

  const rawContent = response.choices[0]?.message?.content;
  const text = typeof rawContent === "string" ? rawContent : "";
  if (config.extractionResponseMode === "graph") {
    if (!config.onExpandExtracted) {
      throw new Error("Graph extraction requires onExpandExtracted.");
    }
    return parseGraphExtractionResponse(text, config.onExpandExtracted);
  }
  return parseExtractionResponse(
    text,
    config.fields.map((f) => f.name)
  );
}

function mergeRawResults(parts: RawExtractedRecords[]): RawExtractedRecords {
  const records: Array<Record<string, any>> = [];
  const confidence: number[] = [];
  const fieldConfidence: Array<Record<string, number> | undefined> = [];
  let hasConf = false;
  let hasFieldConf = false;

  for (const part of parts) {
    for (let i = 0; i < part.records.length; i++) {
      records.push(part.records[i]);
      if (part.confidence) {
        hasConf = true;
        confidence.push(part.confidence[i] ?? NaN);
      } else {
        confidence.push(NaN);
      }
      if (part.fieldConfidence) {
        hasFieldConf = true;
        fieldConfidence.push(part.fieldConfidence[i]);
      } else {
        fieldConfidence.push(undefined);
      }
    }
  }

  return {
    records,
    confidence: hasConf ? confidence : undefined,
    fieldConfidence: hasFieldConf ? fieldConfidence : undefined,
  };
}

/**
 * Extract structured records from an image or PDF via the OCR AI task.
 */
export async function extractFromDocument(
  config: ImportConfiguration,
  file: File,
  kind: Extract<SourceKind, "image" | "pdf">,
  options?: {
    signal?: AbortSignal;
    maxPdfPages?: number;
    onProgress?: (current: number, total: number, message?: string) => void;
  }
): Promise<RawExtractedRecords> {
  throwIfAborted(options?.signal);

  if (kind === "image") {
    options?.onProgress?.(1, 1, "Preparing image…");
    const dataUrl = await fileToResizedDataUrl(file, {signal: options?.signal});
    options?.onProgress?.(1, 1, "Extracting with AI…");
    return extractFromImageUrls(config, [dataUrl], {signal: options?.signal});
  }

  const maxPages = options?.maxPdfPages ?? MAX_PDF_PAGES_DEFAULT;
  options?.onProgress?.(0, 1, "Rendering PDF…");
  const pages = await rasterizePdfPages(file, {
    signal: options?.signal,
    maxPages,
    onProgress: (current, total) =>
      options?.onProgress?.(current, total, `Rendering page ${current} of ${total}…`),
  });

  const parts: RawExtractedRecords[] = [];
  for (let i = 0; i < pages.length; i++) {
    throwIfAborted(options?.signal);
    options?.onProgress?.(
      i + 1,
      pages.length,
      `Extracting page ${i + 1} of ${pages.length}…`
    );
    const part = await extractFromImageUrls(config, [pages[i].dataUrl], {
      signal: options?.signal,
    });
    parts.push(part);
  }

  return mergeRawResults(parts);
}
