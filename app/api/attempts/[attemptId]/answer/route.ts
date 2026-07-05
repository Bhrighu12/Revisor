import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finalizeAttempt, isExpired } from "@/lib/report";

type Params = { params: Promise<{ attemptId: string }> };

/** Upserts one answer (or just the time spent) for a question. */
export async function POST(req: NextRequest, { params }: Params) {
  const { attemptId } = await params;
  const body = await req.json().catch(() => null);
  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  const selectedIndexRaw = body?.selectedIndex;
  const selectedIndex =
    selectedIndexRaw === null || selectedIndexRaw === undefined
      ? null
      : Number(selectedIndexRaw);
  const timeTakenSeconds = Math.max(0, Math.round(Number(body?.timeTakenSeconds) || 0));

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { test: { select: { durationMinutes: true } } },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (attempt.status === "SUBMITTED") {
    return NextResponse.json({ error: "Attempt already submitted" }, { status: 409 });
  }
  if (isExpired(attempt.startedAt, attempt.test.durationMinutes)) {
    await finalizeAttempt(attemptId);
    return NextResponse.json({ error: "Time is up" }, { status: 409 });
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, testId: attempt.testId },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  if (
    selectedIndex !== null &&
    (!Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= question.options.length)
  ) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  await prisma.answer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: { attemptId, questionId, selectedIndex, timeTakenSeconds },
    update: { selectedIndex, timeTakenSeconds },
  });

  return NextResponse.json({ ok: true });
}
