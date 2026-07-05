import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finalizeAttempt, isExpired } from "@/lib/report";
import { SUBJECT_LABELS } from "@/lib/utils";

type Params = { params: Promise<{ attemptId: string }> };

/**
 * Returns everything the quiz screen needs. Never exposes correct answers.
 * Force-submits the attempt server-side if the time limit has passed.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { attemptId } = await params;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      test: {
        include: { questions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
      },
      answers: true,
    },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (
    attempt.status === "IN_PROGRESS" &&
    isExpired(attempt.startedAt, attempt.test.durationMinutes)
  ) {
    await finalizeAttempt(attempt.id);
    return NextResponse.json({ status: "SUBMITTED" });
  }
  if (attempt.status === "SUBMITTED") {
    return NextResponse.json({ status: "SUBMITTED" });
  }

  return NextResponse.json({
    status: "IN_PROGRESS",
    candidateName: attempt.candidateName,
    test: {
      title: attempt.test.title,
      subject: attempt.test.subject,
      subjectLabel: SUBJECT_LABELS[attempt.test.subject],
      durationMinutes: attempt.test.durationMinutes,
    },
    startedAt: attempt.startedAt.toISOString(),
    serverNow: new Date().toISOString(),
    questions: attempt.test.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options,
    })),
    savedAnswers: attempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedIndex: a.selectedIndex,
      timeTakenSeconds: a.timeTakenSeconds,
    })),
  });
}
