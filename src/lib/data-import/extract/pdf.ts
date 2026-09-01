import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {throwIfAborted} from "@/lib/data-import/abort.ts";

/**
 * Client-side PDF page rasterization via pdfjs-dist.
 * Pages are rendered to canvas and returned as JPEG data URLs for vision OCR.
 */

const MAX_PDF_PAGES_DEFAULT = 20;
const RENDER_SCALE = 1.5;
const JPEG_QUALITY = 0.82;

let workerConfigured = false;

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    workerConfigured = true;
  }
  return pdfjs;
}

export type PdfPageImage = {
  pageNumber: number;
  dataUrl: string;
};

export async function rasterizePdfPages(
  file: File,
  options?: {
    signal?: AbortSignal;
    maxPages?: number;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<PdfPageImage[]> {
  const maxPages = options?.maxPages ?? MAX_PDF_PAGES_DEFAULT;
  throwIfAborted(options?.signal);

  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(options?.signal);

  const doc = await pdfjs.getDocument({data}).promise;
  const totalPages = doc.numPages;

  if (totalPages > maxPages) {
    throw new Error(
      `PDF has ${totalPages} pages. Maximum supported is ${maxPages}. Split the file or use fewer pages.`
    );
  }

  const pages: PdfPageImage[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    throwIfAborted(options?.signal);
    options?.onProgress?.(pageNumber, totalPages);

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({scale: RENDER_SCALE});
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create canvas for PDF rendering.");
    }

    await page.render({canvasContext: ctx, viewport} as any).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    pages.push({pageNumber, dataUrl});

    // Help GC
    canvas.width = 0;
    canvas.height = 0;
  }

  return pages;
}

export {MAX_PDF_PAGES_DEFAULT};
