import jsPDF from "jspdf";

export type ExportInput = {
  problemText: string;
  problemLatex: string;
  canvasImageDataUrl?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  steps?: string[];
  stepStatuses?: string[];
};

export function exportSessionPdf(input: ExportInput, filename = "slate-session.pdf") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const writeLine = (text: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    for (const line of lines) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size * 1.3;
    }
  };

  writeLine("Slate — Session", 18, true);
  y += 6;
  writeLine("Problem", 13, true);
  writeLine(input.problemText);
  if (input.problemLatex) writeLine(`LaTeX: ${input.problemLatex}`, 9);
  y += 6;

  if (input.steps?.length) {
    writeLine("Checkpoints", 13, true);
    input.steps.forEach((s, i) => {
      const st = input.stepStatuses?.[i] ?? "pending";
      writeLine(`${i + 1}. [${st}] ${s}`);
    });
    y += 6;
  }

  if (input.canvasImageDataUrl) {
    writeLine("Work", 13, true);
    const imgW = pageW - margin * 2;
    const imgH = imgW * 0.6;
    if (y + imgH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    try {
      doc.addImage(input.canvasImageDataUrl, "JPEG", margin, y, imgW, imgH);
      y += imgH + 12;
    } catch {
      // ignore image errors
    }
  }

  if (input.messages.length) {
    writeLine("Tutor chat", 13, true);
    for (const m of input.messages) {
      writeLine(m.role === "user" ? "You" : "Tutor", 10, true);
      writeLine(m.content);
      y += 4;
    }
  }

  doc.save(filename);
}