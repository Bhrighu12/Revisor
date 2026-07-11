import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { SUBJECTS } from "@/lib/utils";
import type { Subject } from "@/app/generated/prisma/enums";

/**
 * Creates a new test containing copies of all questions from the given
 * tests (in the order the tests were selected). Copies are independent —
 * editing the new test never affects the source tests.
 */
export async function POST(req: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const subject = body?.subject as Subject;
  const durationMinutes = Number(body?.durationMinutes);
  const testIds: string[] = Array.isArray(body?.testIds)
    ? body.testIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!SUBJECTS.includes(subject)) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
    return NextResponse.json(
      { error: "Duration must be between 1 and 300 minutes" },
      { status: 400 }
    );
  }
  if (testIds.length === 0) {
    return NextResponse.json({ error: "Select at least one source test" }, { status: 400 });
  }

  const sources = await prisma.test.findMany({
    where: { id: { in: testIds } },
    include: {
      questions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (sources.length !== testIds.length) {
    return NextResponse.json({ error: "One of the selected tests no longer exists" }, { status: 404 });
  }

  // Preserve the admin's selection order, then each test's question order.
  const bySelection = new Map(sources.map((t) => [t.id, t]));
  const combined = testIds.flatMap((id) => bySelection.get(id)!.questions);
  if (combined.length === 0) {
    return NextResponse.json({ error: "The selected tests have no questions" }, { status: 400 });
  }

  const test = await prisma.test.create({ data: { title, subject, durationMinutes } });
  await prisma.question.createMany({
    data: combined.map((q, i) => ({
      testId: test.id,
      text: q.text,
      imageUrl: q.imageUrl,
      options: q.options,
      optionImages: q.optionImages,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      order: i + 1,
    })),
  });

  return NextResponse.json({ test, questionCount: combined.length }, { status: 201 });
}
