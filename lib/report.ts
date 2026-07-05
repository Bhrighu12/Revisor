import { prisma } from "./db";
import { SUBJECT_LABELS } from "./utils";

// Extra seconds allowed past the deadline before the server force-submits,
// to absorb network latency on the final client-side auto-submit.
const GRACE_SECONDS = 20;

export function deadlineOf(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function isExpired(startedAt: Date, durationMinutes: number): boolean {
  return Date.now() > deadlineOf(startedAt, durationMinutes).getTime() + GRACE_SECONDS * 1000;
}

/**
 * Grade and finalize an attempt. Idempotent — returns immediately if the
 * attempt is already submitted.
 */
export async function finalizeAttempt(attemptId: string): Promise<void> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: { include: { question: true } },
      test: { include: { questions: true } },
    },
  });
  if (!attempt || attempt.status === "SUBMITTED") return;

  let correct = 0;
  let wrong = 0;
  const updates = attempt.answers.map((answer) => {
    const attempted = answer.selectedIndex !== null;
    const isCorrect = attempted && answer.selectedIndex === answer.question.correctIndex;
    if (isCorrect) correct++;
    else if (attempted) wrong++;
    return prisma.answer.update({
      where: { id: answer.id },
      data: { isCorrect },
    });
  });

  // Negative marking: unattempted questions score 0.
  const score = correct * attempt.test.marksCorrect - wrong * attempt.test.marksWrong;

  await prisma.$transaction([
    ...updates,
    prisma.attempt.update({
      where: { id: attemptId },
      data: { status: "SUBMITTED", submittedAt: new Date(), score },
    }),
  ]);
}

export interface ReportQuestion {
  index: number;
  questionId: string;
  text: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean;
  attempted: boolean;
  timeTakenSeconds: number;
  explanation: string | null;
}

export interface Report {
  attemptId: string;
  candidateName: string;
  testTitle: string;
  subject: string;
  subjectLabel: string;
  durationMinutes: number;
  startedAt: string;
  submittedAt: string | null;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  scorePercent: number;
  marksCorrect: number;
  marksWrong: number;
  marks: number;
  maxMarks: number;
  totalTimeSeconds: number;
  avgTimePerQuestionSeconds: number;
  questions: ReportQuestion[];
  aiFeedback: string | null;
}

export async function buildReport(attemptId: string): Promise<Report | null> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      test: { include: { questions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } },
    },
  });
  if (!attempt || attempt.status !== "SUBMITTED") return null;

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const questions: ReportQuestion[] = attempt.test.questions.map((q, i) => {
    const answer = answersByQuestion.get(q.id);
    const selectedIndex = answer?.selectedIndex ?? null;
    return {
      index: i + 1,
      questionId: q.id,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      selectedIndex,
      isCorrect: answer?.isCorrect ?? false,
      attempted: selectedIndex !== null,
      timeTakenSeconds: answer?.timeTakenSeconds ?? 0,
      explanation: q.explanation,
    };
  });

  const totalQuestions = questions.length;
  const correct = questions.filter((q) => q.isCorrect).length;
  const attempted = questions.filter((q) => q.attempted).length;
  const incorrect = attempted - correct;
  const unattempted = totalQuestions - attempted;
  const totalTimeSeconds = questions.reduce((sum, q) => sum + q.timeTakenSeconds, 0);

  return {
    attemptId: attempt.id,
    candidateName: attempt.candidateName,
    testTitle: attempt.test.title,
    subject: attempt.test.subject,
    subjectLabel: SUBJECT_LABELS[attempt.test.subject],
    durationMinutes: attempt.test.durationMinutes,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    totalQuestions,
    correct,
    incorrect,
    unattempted,
    scorePercent: totalQuestions === 0 ? 0 : Math.round((correct / totalQuestions) * 1000) / 10,
    marksCorrect: attempt.test.marksCorrect,
    marksWrong: attempt.test.marksWrong,
    marks: correct * attempt.test.marksCorrect - incorrect * attempt.test.marksWrong,
    maxMarks: totalQuestions * attempt.test.marksCorrect,
    totalTimeSeconds,
    avgTimePerQuestionSeconds:
      totalQuestions === 0 ? 0 : Math.round(totalTimeSeconds / totalQuestions),
    questions,
    aiFeedback: attempt.aiFeedback,
  };
}
