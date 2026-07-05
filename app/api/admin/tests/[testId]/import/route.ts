import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { extractQuestionsFromDocument } from "@/lib/gemini";
import { SUBJECT_LABELS } from "@/lib/utils";

export const maxDuration = 60;

type Params = { params: Promise<{ testId: string }> };

const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text;
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (name.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, or TXT file.");
}

/**
 * Extracts text from an uploaded PDF/DOCX/TXT and asks the LLM to turn it
 * into draft questions for admin review.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 15 MB)" }, { status: 400 });
  }
  const maxCount = Math.min(Math.max(Number(form?.get("count")) || 20, 1), 50);

  let text: string;
  try {
    text = (await extractText(file)).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the file";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (text.length < 50) {
    return NextResponse.json(
      { error: "Could not extract readable text from this file (is it a scanned image?)" },
      { status: 400 }
    );
  }

  try {
    const drafts = await extractQuestionsFromDocument(
      SUBJECT_LABELS[test.subject],
      text,
      maxCount
    );
    return NextResponse.json({ drafts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
