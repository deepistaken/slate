import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfLine = {
  /** Baseline y of the line in rendered-image pixels. */
  y: number;
  str: string;
};

export type PdfPage = {
  /** Selectable text of the page (may be empty for scanned PDFs). */
  text: string;
  /** Text split into visual lines, top to bottom, with pixel positions. */
  lines: PdfLine[];
  /** JPEG data-URL screenshot of the full page. */
  image: string;
  width: number;
  height: number;
};

const MAX_PAGES = 20;
const TARGET_WIDTH = 1100;

/**
 * Extract each page's text (as positioned lines) AND render it to an image,
 * so individual problems can be cropped out and shown as they appear in print.
 */
export async function extractPdfPages(file: File): Promise<PdfPage[]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: PdfPage[] = [];
  const count = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, TARGET_WIDTH / base.width);
    const viewport = page.getViewport({ scale });

    // Group text items into visual lines by their rendered y position.
    const content = await page.getTextContent();
    const items = content.items
      .filter((it): it is import("pdfjs-dist/types/src/display/api").TextItem => "str" in it)
      .map((it) => {
        const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
        return { x, y, str: it.str };
      })
      .filter((it) => it.str.trim().length > 0)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const lines: PdfLine[] = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(it.y - last.y) < 5) {
        last.str += ` ${it.str}`;
      } else {
        lines.push({ y: it.y, str: it.str });
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "print" renders in one pass without requestAnimationFrame, so extraction
    // still finishes when the tab is backgrounded mid-upload.
    await page.render({ canvas, canvasContext: ctx, viewport, intent: "print" }).promise;
    const image = canvas.toDataURL("image/jpeg", 0.85);

    pages.push({
      text: lines.map((l) => l.str).join("\n"),
      lines,
      image,
      width: canvas.width,
      height: canvas.height,
    });
  }
  return pages;
}

/**
 * Crop a horizontal band [top, bottom] (pixels) out of a data-URL image.
 * Returns the original image if the band is invalid or covers everything.
 */
export async function cropImageBand(dataUrl: string, top: number, bottom: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("crop: image failed to load"));
    img.src = dataUrl;
  });
  const t = Math.max(0, Math.floor(top));
  const b = Math.min(img.height, Math.ceil(bottom));
  const h = b - t;
  if (h <= 20 || h >= img.height - 10) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, t, img.width, h, 0, 0, img.width, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Cut the screenshot of one problem out of its page: from just above
 * `startLine`'s baseline to just below `endLine`'s (1-based line numbers).
 */
export async function cropProblemImage(
  page: PdfPage,
  startLine: number,
  endLine: number,
): Promise<string> {
  const first = page.lines[startLine - 1];
  const last = page.lines[Math.min(endLine, page.lines.length) - 1];
  if (!first || !last || last.y < first.y) return page.image;
  // Baselines sit at the bottom of the text: pad one line height above the
  // first baseline and a bit of descent below the last.
  const lineHeight = 26;
  return cropImageBand(page.image, first.y - lineHeight, last.y + 14);
}

export async function extractPdfText(file: File): Promise<string> {
  const pages = await extractPdfPages(file);
  return pages.map((p) => p.text).join("\n\n");
}

export type DetectedProblem = {
  /** 0-based index into the pages array. */
  pageIndex: number;
  /** 1-based line range of the question on that page. */
  startLine: number;
  endLine: number;
  text: string;
};

// A question starts on a line beginning with a number like "3", "3.1", "3.1.2"
// (optionally prefixed Question/Aufgabe/Exercice/Q…) followed by real content.
const QUESTION_START =
  /^\s*(?:(?:question|aufgabe|exercice|exercise|problem|q)\s*[.:]?\s*)?\d{1,2}(?:\.\d{1,2})*\s*[.)\]:]?\s+\S{2,}/i;
// …but "10 marks", "3 points", bare page numbers etc. are not questions.
const NOT_A_QUESTION = /^\s*\d+\s*(?:marks?|points?|punkte?|pts)\b|^\s*\d+\s*$/i;

/**
 * Purely local question detection — no AI. Splits each page at numbered
 * question starts; each segment runs to the line before the next question
 * (or the end of the page).
 */
export function detectProblems(pages: PdfPage[]): DetectedProblem[] {
  const out: DetectedProblem[] = [];
  pages.forEach((page, pageIndex) => {
    const starts: number[] = [];
    page.lines.forEach((l, i) => {
      if (QUESTION_START.test(l.str) && !NOT_A_QUESTION.test(l.str)) starts.push(i);
    });
    starts.forEach((start, s) => {
      let end = s + 1 < starts.length ? starts[s + 1] - 1 : page.lines.length - 1;
      // The last question on a page would otherwise swallow the footer: cut
      // the segment at a large vertical gap (>180px) and drop trailing bare
      // page numbers / mark tallies.
      for (let i = start + 1; i <= end; i++) {
        if (page.lines[i].y - page.lines[i - 1].y > 180) {
          end = i - 1;
          break;
        }
      }
      while (end > start && NOT_A_QUESTION.test(page.lines[end].str)) end--;
      const text = page.lines
        .slice(start, end + 1)
        .map((l) => l.str)
        .join("\n")
        .trim();
      if (text.length < 8) return;
      out.push({ pageIndex, startLine: start + 1, endLine: end + 1, text });
    });
  });
  return out;
}
