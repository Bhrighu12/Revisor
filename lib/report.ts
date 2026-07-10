import { prisma } from "./db";
import { SUBJECT_LABELS } from "./utils";

// Extra seconds allowed past the deadline before the server force-submits,
// to absorb network latency on the final client-side auto-submit.
const GRACE_SECONDS = 20;

// A single pause freezes the clock for at most this long; past it the clock
// resumes so abandoned-while-paused attempts still expire and auto-submit.
export const MAX_PAUSE_MS = 2 * 60 * 60_000;

export interface AttemptTiming {
  startedAt: Date;
  pausedAt: Date | null;
  pausedSeconds: number;
}

/** Seconds left on the clock; negative once time has run out. */
export function remainingSeconds(a: AttemptTiming, durationMinutes: number): number {
  const now = Date.now();
  const currentPauseMs = a.pausedAt
    ? Math.min(now - a.pausedAt.getTime(), MAX_PAUSE_MS)
    : 0;
  const elapsedMs = now - a.startedAt.getTime() - a.pausedSeconds * 1000 - currentPauseMs;
  return durationMinutes * 60 - elapsedMs / 1000;
}

export function isExpired(a: AttemptTiming, durationMinutes: number): boolean {
  return remainingSeconds(a, durationMinutes) < -GRACE_SECONDS;
}

/**
 * Grade and finalize an attempt. Idempotent — returns immediately if the
 * attempt is already submitted.
 */
export async function finalizeAttempt(attemptId: string): Promise<void> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: { include: { question: { select: { correctIndex: true } } } },
      test: { select: { marksCorrect: true, marksWrong: true } },
    },
  });
  if (!attempt || attempt.status === "SUBMITTED") return;

  let correct = 0;
  let wrong = 0;
  for (const answer of attempt.answers) {
    const attempted = answer.selectedIndex !== null;
    if (attempted && answer.selectedIndex === answer.question.correctIndex) correct++;
    else if (attempted) wrong++;
  }

  // Negative marking: unattempted questions score 0.
  const score = correct * attempt.test.marksCorrect - wrong * attempt.test.marksWrong;

  await prisma.$transaction([
    // Grade all answers in one statement — per-row updates exceed Prisma's
    // 5s transaction timeout on longer tests.
    prisma.$executeRaw`
      UPDATE "Answer" AS a
      SET "isCorrect" = (a."selectedIndex" IS NOT NULL AND a."selectedIndex" = q."correctIndex")
      FROM "Question" AS q
      WHERE a."questionId" = q.id AND a."attemptId" = ${attemptId}
    `,
    prisma.attempt.update({
      where: { id: attemptId },
      data: { status: "SUBMITTED", submittedAt: new Date(), score },
    }),
  ]);
}

/**
 * Force-submits every attempt whose time limit has passed. Abandoned attempts
 * otherwise stay IN_PROGRESS until someone opens their quiz or result page.
 * Returns the number of attempts finalized.
 */
export async function finalizeExpiredAttempts(): Promise<number> {
  const open = await prisma.attempt.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      id: true,
      startedAt: true,
      pausedAt: true,
      pausedSeconds: true,
      test: { select: { durationMinutes: true } },
    },
  });
  const expired = open.filter((a) => isExpired(a, a.test.durationMinutes));
  for (const a of expired) {
    await finalizeAttempt(a.id);
  }
  return expired.length;
}

/**
 * Re-grades every answer of a test against the current answer keys and
 * recomputes the scores of already-submitted attempts. Called after a
 * question's correct answer changes (or a question is deleted) so declared
 * results update immediately.
 */
export async function regradeTest(testId: string): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "Answer" AS a
      SET "isCorrect" = (a."selectedIndex" IS NOT NULL AND a."selectedIndex" = q."correctIndex")
      FROM "Question" AS q, "Attempt" AS att
      WHERE q.id = a."questionId" AND att.id = a."attemptId" AND att."testId" = ${testId}
    `,
    prisma.$executeRaw`
      UPDATE "Attempt" AS att
      SET "score" = s.marks
      FROM (
        SELECT at2.id AS attempt_id,
               COALESCE(SUM(
                 CASE
                   WHEN a."selectedIndex" IS NOT NULL AND a."selectedIndex" = q."correctIndex"
                     THEN t."marksCorrect"
                   WHEN a."selectedIndex" IS NOT NULL THEN -t."marksWrong"
                   ELSE 0
                 END
               ), 0)::int AS marks
        FROM "Attempt" at2
        JOIN "Test" t ON t.id = at2."testId"
        LEFT JOIN "Answer" a ON a."attemptId" = at2.id
        LEFT JOIN "Question" q ON q.id = a."questionId"
        WHERE at2."testId" = ${testId} AND at2.status = 'SUBMITTED'
        GROUP BY at2.id
      ) AS s
      WHERE att.id = s.attempt_id
    `,
  ]);
}

export interface ReportQuestion {
  index: number;
  questionId: string;
  text: string;
  imageUrl: string | null;
  options: string[];
  optionImages: string[];
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean;
  attempted: boolean;
  doubtful: boolean;
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
      imageUrl: q.imageUrl,
      options: q.options,
      optionImages: q.optionImages,
      correctIndex: q.correctIndex,
      selectedIndex,
      isCorrect: answer?.isCorrect ?? false,
      attempted: selectedIndex !== null,
      doubtful: answer?.doubtful ?? false,
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
