import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { regradeTest } from "@/lib/report";

type Params = { params: Promise<{ questionId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { questionId } = await params;
  const body = await req.json().catch(() => null);

  const data: {
    text?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string | null;
  } = {};

  if (typeof body?.text === "string" && body.text.trim()) data.text = body.text.trim();
  if (Array.isArray(body?.options)) {
    const options = body.options
      .filter((o: unknown): o is string => typeof o === "string")
      .map((o: string) => o.trim());
    if (options.length < 2 || options.some((o: string) => !o)) {
      return NextResponse.json({ error: "Need 2+ non-empty options" }, { status: 400 });
    }
    data.options = options;
  }
  if (body?.correctIndex !== undefined) {
    const idx = Number(body.correctIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return NextResponse.json({ error: "Invalid correctIndex" }, { status: 400 });
    }
    data.correctIndex = idx;
  }
  if (body?.explanation !== undefined) {
    data.explanation =
      typeof body.explanation === "string" && body.explanation.trim()
        ? body.explanation.trim()
        : null;
  }

  const existing = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  const options = data.options ?? existing.options;
  const correctIndex = data.correctIndex ?? existing.correctIndex;
  if (correctIndex >= options.length) {
    return NextResponse.json(
      { error: "correctIndex is out of range for the options" },
      { status: 400 }
    );
  }

  const question = await prisma.question.update({ where: { id: questionId }, data });

  // If the answer key changed, re-grade declared results right away.
  if (
    (data.correctIndex !== undefined && data.correctIndex !== existing.correctIndex) ||
    (data.options !== undefined && data.options.length !== existing.options.length)
  ) {
    await regradeTest(existing.testId);
  }

  return NextResponse.json({ question });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { questionId } = await params;
  try {
    const question = await prisma.question.delete({ where: { id: questionId } });
    // Answers to this question cascade-delete; rescore declared results.
    await regradeTest(question.testId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
}
