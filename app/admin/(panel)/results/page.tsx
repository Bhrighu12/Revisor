import Link from "next/link";
import { prisma } from "@/lib/db";
import { finalizeExpiredAttempts } from "@/lib/report";
import { SUBJECT_LABELS, formatDateTimeIST, formatSeconds } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  // Auto-submit abandoned attempts whose time has run out.
  await finalizeExpiredAttempts();

  const attempts = await prisma.attempt.findMany({
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
      accessCode: { select: { code: true } },
      answers: { select: { timeTakenSeconds: true } },
    },
  });

  return (
    <main>
      <h1 className="text-2xl font-bold text-slate-900">Results</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Latest attempts across all tests. Open a report for full per-question detail.
      </p>

      {attempts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No attempts yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const totalTime = a.answers.reduce((s, x) => s + x.timeTakenSeconds, 0);
                return (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{a.candidateName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {a.test.title}
                      <span className="block text-xs text-slate-400">
                        {SUBJECT_LABELS[a.test.subject]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {a.accessCode.code}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {a.status === "SUBMITTED"
                        ? `${a.score ?? 0} / ${a.test._count.questions * a.test.marksCorrect}`
                        : "—"}
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
