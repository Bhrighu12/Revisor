import PDFDocument from "pdfkit";
import type { Report } from "./report";
import { formatDateTimeIST, formatSeconds } from "./utils";

const SLATE = "#334155";
const MUTED = "#64748b";
const GREEN = "#047857";
const RED = "#b91c1c";
const AMBER = "#b45309";
const LINE = "#e2e8f0";

// pdfkit's built-in Helvetica only encodes WinAnsi (CP1252). Map common
// exam symbols to ASCII and drop anything else so encoding never throws.
const CHAR_MAP: Record<string, string> = {
  "√": "sqrt", // √
  "π": "pi", // π
  "Δ": "delta", // Δ
  "θ": "theta", // θ
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "→": "->",
  "←": "<-",
  "✓": "Y",
  "✗": "N",
};

function sanitize(text: string): string {
  return text.replace(/[^\x00-\xff–—‘’“”…€]/g, (c) =>
    CHAR_MAP[c] !== undefined ? CHAR_MAP[c] : "?"
  );
}

/** Renders a submitted attempt's report card as a PDF. */
export function buildReportPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - 96;

    // Header
    doc.font("Helvetica-Bold").fontSize(18).fillColor(SLATE).text(sanitize(report.testTitle));
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text(`${report.subjectLabel} · Result report`, { paragraphGap: 2 });
    doc.text(
      `Candidate: ${sanitize(report.candidateName)}` +
        (report.submittedAt
          ? ` · Submitted: ${formatDateTimeIST(report.submittedAt)}`
          : "")
    );
    doc.moveDown(0.8);

    // Summary box
    const boxTop = doc.y;
    doc.roundedRect(48, boxTop, width, 74, 8).fillAndStroke("#f8fafc", LINE);
    doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(22);
    doc.text(`${report.marks} / ${report.maxMarks}`, 64, boxTop + 14, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text("MARKS", 64, boxTop + 42);
    doc.text(
      `+${report.marksCorrect} per correct · -${report.marksWrong} per wrong · 0 unattempted`,
      64,
      boxTop + 54
    );

    const stats: Array<[string, string, string]> = [
      ["Correct", String(report.correct), GREEN],
      ["Wrong", String(report.incorrect), RED],
      ["Skipped", String(report.unattempted), MUTED],
      ["Accuracy", `${report.scorePercent}%`, SLATE],
      ["Time", formatSeconds(report.totalTimeSeconds), SLATE],
    ];
    const statLeft = 250;
    const statW = (width - (statLeft - 48)) / stats.length;
    stats.forEach(([label, value, color], i) => {
      const x = statLeft + i * statW;
      doc.font("Helvetica-Bold").fontSize(14).fillColor(color).text(value, x, boxTop + 20, {
        width: statW,
        align: "center",
      });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, boxTop + 42, {
        width: statW,
        align: "center",
      });
    });

    doc.y = boxTop + 90;
    doc.x = 48;

    // Per-question review
    for (const q of report.questions) {
      const blockStart = doc.y;
      if (blockStart > doc.page.height - 160) doc.addPage();

      const status = !q.attempted ? "Skipped" : q.isCorrect ? "Correct" : "Wrong";
      const statusColor = !q.attempted ? AMBER : q.isCorrect ? GREEN : RED;

      doc.font("Helvetica-Bold").fontSize(10).fillColor(statusColor);
      doc.text(`Q${q.index} — ${status}`, 48, doc.y, { continued: true });
      doc
        .font("Helvetica")
        .fillColor(MUTED)
        .text(`   (${formatSeconds(q.timeTakenSeconds)})`);
      doc.moveDown(0.2);

      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE);
      doc.text(sanitize(q.text), { width });
      doc.moveDown(0.3);

      q.options.forEach((opt, i) => {
        const isCorrect = i === q.correctIndex;
        const isChosen = i === q.selectedIndex;
        let suffix = "";
        if (isCorrect) suffix = "  [correct answer]";
        if (isChosen && !isCorrect) suffix = "  [candidate's answer]";
        if (isChosen && isCorrect) suffix = "  [candidate's answer - correct]";
        doc
          .font(isCorrect || isChosen ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9.5)
          .fillColor(isCorrect ? GREEN : isChosen ? RED : SLATE);
        doc.text(`${String.fromCharCode(65 + i)}. ${sanitize(opt)}${suffix}`, 60, doc.y, {
          width: width - 12,
        });
      });

      if (q.explanation) {
        doc.moveDown(0.2);
        doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED);
        doc.text(`Explanation: ${sanitize(q.explanation)}`, 60, doc.y, { width: width - 12 });
      }

      doc.moveDown(0.5);
      doc
        .moveTo(48, doc.y)
        .lineTo(48 + width, doc.y)
        .strokeColor(LINE)
        .stroke();
      doc.moveDown(0.5);
      doc.x = 48;
    }

    // Footer with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Revisor · ${sanitize(report.testTitle)} · Page ${i + 1} of ${range.count}`,
          48,
          doc.page.height - 36,
          { width, align: "center", lineBreak: false }
        );
    }

    doc.end();
  });
}
