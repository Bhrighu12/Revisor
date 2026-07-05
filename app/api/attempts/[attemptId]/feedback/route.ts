import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildReport } from "@/lib/report";
import { generateFeedback } from "@/lib/gemini";

export const maxDuration = 60;

type Params = { params: Promise<{ attemptId: string }> };

/** Generates (and caches) AI feedback for a submitted attempt. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { attemptId } = await params;

  const report = await buildReport(attemptId);
  if (!report) {
    return NextResponse.json(
      { error: "Submit the test before requesting feedback" },
      { status: 404 }
    );
  }
  if (report.aiFeedback) {
    return NextResponse.json({ feedback: report.aiFeedback });
  }

  const slowestQuestions = [...report.questions]
    .sort((a, b) => b.timeTakenSeconds - a.timeTakenSeconds)
    .slice(0, 3)
    .filter((q) => q.timeTakenSeconds > 0)
    .map((q) => ({
      text: q.text.slice(0, 160),
      timeSeconds: q.timeTakenSeconds,
      wasCorrect: q.isCorrect,
    }));

  const incorrectQuestions = report.questions
    .filter((q) => q.attempted && !q.isCorrect)
    .slice(0, 10)
    .map((q) => ({
      text: q.text.slice(0, 160),
      chosen: q.selectedIndex !== null ? q.options[q.selectedIndex] : "",
      correctAnswer: q.options[q.correctIndex],
    }));

  try {
    const feedback = await generateFeedback({
      candidateName: report.candidateName,
      testTitle: report.testTitle,
      subject: report.subjectLabel,
      totalQuestions: report.totalQuestions,
      correct: report.correct,
      incorrect: report.incorrect,
      unattempted: report.unattempted,
      scorePercent: report.scorePercent,
      totalTimeSeconds: report.totalTimeSeconds,
      durationMinutes: report.durationMinutes,
      avgTimePerQuestionSeconds: report.avgTimePerQuestionSeconds,
      slowestQuestions,
      incorrectQuestions,
    });

    await prisma.attempt.update({
      where: { id: attemptId },
      data: { aiFeedback: feedback },
    });
    return NextResponse.json({ feedback });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feedback generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
