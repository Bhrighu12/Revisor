import Link from "next/link";
import { prisma } from "@/lib/db";
import { SUBJECT_LABELS } from "@/lib/utils";
import CreateTestForm from "@/components/admin/CreateTestForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const tests = await prisma.test.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, attempts: true } } },
  });

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create tests for the four AFCAT sections and manage their questions.
          </p>
        </div>
        <CreateTestForm />
      </div>

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No tests yet — create your first test above.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tests.map((test) => (
            <Link
              key={test.id}
              href={`/admin/tests/${test.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  {SUBJECT_LABELS[test.subject]}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    test.isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {test.isActive ? "Active" : "Disabled"}
                </span>
              </div>
              <h2 className="mt-3 font-semibold text-slate-900">{test.title}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {test._count.questions} questions · {test.durationMinutes} min timer ·{" "}
                {test._count.attempts} attempts
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
