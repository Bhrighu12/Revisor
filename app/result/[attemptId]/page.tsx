import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildReport, finalizeAttempt, isExpired } from "@/lib/report";
import { formatDateTimeIST, formatSeconds } from "@/lib/utils";
import FeedbackPanel from "@/components/FeedbackPanel";

export const dynamic = "force-dynamic";

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "good" | "bad" | "muted";
}) {
  const valueColor =
    accent === "good"
      ? "text-emerald-700"
      : accent === "bad"
        ? "text-red-700"
        : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;

  let report = await buildReport(attemptId);
  if (!report) {
    // If the attempt exists but ran out of time, finalize it now.
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { test: { select: { durationMinutes: true } } },
    });
    if (attempt?.status === "IN_PROGRESS") {
      if (isExpired(attempt, attempt.test.durationMinutes)) {
        await finalizeAttempt(attemptId);
        report = await buildReport(attemptId);
      } else {
        return (
          <main className="flex flex-1 items-center justify-center px-4">
            <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <h1 className="text-lg font-semibold text-slate-900">Test in progress</h1>
              <p className="mt-2 text-sm text-slate-600">
                This attempt has not been submitted yet.
              </p>
              <Link
                href={`/test/${attemptId}`}
                className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
              >
                Resume test
              </Link>
            </div>
          </main>
        );
      }
    }
  }

  if (!report) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Result not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            This attempt does not exist or was removed.
          </p>
          <Link href="/" className="mt-4 inline-block text-indigo-600 underline underline-offset-2">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  const allowedSeconds = report.durationMinutes * 60;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-slate-500">{report.subjectLabel} · Result report</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{report.testTitle}</h1>
        <p className="mt-1 text-slate-600">
          {report.candidateName}
          {report.submittedAt &&
            ` · submitted ${formatDateTimeIST(report.submittedAt)}`}
        </p>
      </div>

      {/* Hero score */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Marks</p>
        <p
          className={`mt-1 text-5xl font-bold tabular-nums ${
            report.marks < 0 ? "text-red-700" : "text-slate-900"
          }`}
        >
          {report.marks}
          <span className="text-2xl font-semibold text-slate-400"> / {report.maxMarks}</span>
        </p>
        <p className="mt-1 text-slate-600">
          {report.correct} of {report.totalQuestions} correct ({report.scorePercent}%)
        </p>
        <p className="mt-1 text-xs text-slate-400">
          +{report.marksCorrect} per correct · −{report.marksWrong} per wrong · 0 for unattempted
        </p>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Correct" value={`✓ ${report.correct}`} accent="good" />
        <StatTile label="Incorrect" value={`✗ ${report.incorrect}`} accent="bad" />
        <StatTile label="Unattempted" value={String(report.unattempted)} accent="muted" />
        <StatTile
          label="Time taken"
          value={formatSeconds(report.totalTimeSeconds)}
          sub={`of ${formatSeconds(allowedSeconds)} · avg ${formatSeconds(report.avgTimePerQuestionSeconds)}/question`}
        />
      </div>

      {/* AI feedback */}
      <div className="mb-6">
        <FeedbackPanel attemptId={report.attemptId} initialFeedback={report.aiFeedback} />
      </div>

      {/* Per-question review */}
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Question review</h2>
      <div className="flex flex-col gap-4">
        {report.questions.map((q) => {
          const status = !q.attempted ? "Unattempted" : q.isCorrect ? "Correct" : "Incorrect";
          const statusStyle = !q.attempted
            ? "bg-slate-100 text-slate-600"
            : q.isCorrect
              ? "bg-emerald-100 text-emerald-800"
              : "bg-red-100 text-red-700";
          return (
            <div key={q.questionId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Q{q.index}</span>
                <span className={`rounded-full px-2.5 py-1 font-semibold ${statusStyle}`}>
                  {!q.attempted ? "" : q.isCorrect ? "✓ " : "✗ "}
                  {status}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                  ⏱ {formatSeconds(q.timeTakenSeconds)}
                </span>
                {q.doubtful && (
                  <span
                    className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800"
                    title="The candidate flagged this question as possibly wrong"
                  >
                    ⚑ Flagged doubtful
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap font-medium text-slate-900">{q.text}</p>
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.imageUrl}
                  alt="Question illustration"
                  className="mt-3 max-h-80 max-w-full rounded-lg border border-slate-200 object-contain"
                />
              )}
              <div className="mt-3 flex flex-col gap-2">
                {q.options.map((opt, i) => {
                  const isCorrect = i === q.correctIndex;
                  const isChosen = i === q.selectedIndex;
                  const style = isCorrect
                    ? "border-emerald-300 bg-emerald-50"
                    : isChosen
                      ? "border-red-300 bg-red-50"
                      : "border-slate-200 bg-white";
                  return (
                    <div key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${style}`}>
                      <span className="mt-0.5 font-bold text-slate-500">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1 text-slate-800">
                        {opt}
                        {q.optionImages?.[i] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={q.optionImages[i]}
                            alt={`Option ${String.fromCharCode(65 + i)}`}
                            className="mt-2 max-h-40 max-w-full rounded-md border border-slate-200 object-contain"
                          />
                        )}
                      </span>
                      {isCorrect && (
                        <span className="shrink-0 text-xs font-semibold text-emerald-700">
                          ✓ Correct answer
                        </span>
                      )}
                      {isChosen && !isCorrect && (
                        <span className="shrink-0 text-xs font-semibold text-red-700">
                          ✗ Your answer
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Explanation: </span>
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center">
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700">
          Back to home
        </Link>
      </p>
    </main>
  );
}
