import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfPage = {
  /** Selectable text of the page (may be empty for scanned PDFs). */
  text: string;
  /** JPEG data-URL screenshot of the full page. */
  image: string;
};

const MAX_PAGES = 20;
const TARGET_WIDTH = 1100;

/**
 * Extract each page's text AND render it to an image, so problems can be
 * shown exactly as they appear in the worksheet.
 */
export async function extractPdfPages(file: File): Promise<PdfPage[]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: PdfPage[] = [];
  const count = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);

    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, TARGET_WIDTH / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const image = canvas.toDataURL("image/jpeg", 0.85);

    pages.push({ text, image });
  }
  return pages;
}

export async function extractPdfText(file: File): Promise<string> {
  const pages = await extractPdfPages(file);
  return pages.map((p) => p.text).join("\n\n");
}
