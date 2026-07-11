import Link from "next/link";
import { prisma } from "@/lib/db";
import { finalizeExpiredAttempts } from "@/lib/report";
import { SUBJECTS, SUBJECT_LABELS, formatDateTimeIST, formatSeconds } from "@/lib/utils";
import type { Subject } from "@/app/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  const subjectFilter = SUBJECTS.includes(subject as Subject)
    ? (subject as Subject)
    : undefined;

  // Auto-submit abandoned attempts whose time has run out.
  await finalizeExpiredAttempts();

  const attempts = await prisma.attempt.findMany({
    where: subjectFilter ? { test: { subject: subjectFilter } } : undefined,
    orderBy: { startedAt: "desc" },
    take: 200,
    include: {
      test: {
        select: {
          title: true,
          subject: true,
          marksCorrect: true,
          _count: { select: { questions: true } },
        },
      },
      answers: { select: { timeTakenSeconds: true, selectedIndex: true, isCorrect: true } },
    },
  });

  return (
    <main>
      <h1 className="text-2xl font-bold text-slate-900">Results</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Latest attempts across all tests. Open a report for full per-question detail.
      </p>

      {/* Subject filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/results"
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            !subjectFilter
              ? "bg-indigo-600 text-white"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          All subjects
        </Link>
        {SUBJECTS.map((s) => (
          <Link
            key={s}
            href={`/admin/results?subject=${s}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              subjectFilter === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {SUBJECT_LABELS[s]}
          </Link>
        ))}
      </div>

      {attempts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {subjectFilter
            ? `No ${SUBJECT_LABELS[subjectFilter]} attempts yet.`
            : "No attempts yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium text-emerald-700">Correct</th>
                <th className="px-4 py-3 font-medium text-red-700">Wrong</th>
                <th className="px-4 py-3 font-medium">Unattempted</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const totalTime = a.answers.reduce((s, x) => s + x.timeTakenSeconds, 0);
                const correct = a.answers.filter((x) => x.isCorrect).length;
                const wrong = a.answers.filter(
                  (x) => x.selectedIndex !== null && !x.isCorrect
                ).length;
                const unattempted = Math.max(0, a.test._count.questions - correct - wrong);
                return (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{a.candidateName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {a.test.title}
                      <span className="block text-xs text-slate-400">
                        {SUBJECT_LABELS[a.test.subject]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {a.status === "SUBMITTED"
                        ? `${a.score ?? 0} / ${a.test._count.questions * a.test.marksCorrect}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-emerald-700">
                      {a.status === "SUBMITTED" ? correct : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-red-700">
                      {a.status === "SUBMITTED" ? wrong : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {a.status === "SUBMITTED" ? unattempted : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {a.status === "SUBMITTED" ? formatSeconds(totalTime) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          a.status === "SUBMITTED"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {a.status === "SUBMITTED" ? "Submitted" : "In progress"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTimeIST(a.startedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {a.status === "SUBMITTED" && (
                        <span className="flex gap-3">
                          <Link
                            href={`/result/${a.id}`}
                            className="font-medium text-indigo-600 hover:underline"
                          >
                            Report
                          </Link>
                          <a
                            href={`/api/admin/attempts/${a.id}/pdf`}
                            className="font-medium text-indigo-600 hover:underline"
                            title="Download report card as PDF"
                          >
                            PDF
                          </a>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
