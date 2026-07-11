import Link from "next/link";
import { prisma } from "@/lib/db";
import { SUBJECTS, SUBJECT_LABELS } from "@/lib/utils";
import type { Subject } from "@/app/generated/prisma/enums";
import CreateTestForm from "@/components/admin/CreateTestForm";
import CombineTestsForm from "@/components/admin/CombineTestsForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  const subjectFilter = SUBJECTS.includes(subject as Subject)
    ? (subject as Subject)
    : undefined;

  const tests = await prisma.test.findMany({
    where: subjectFilter ? { subject: subjectFilter } : undefined,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, attempts: true } } },
  });

  const chipCls = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-indigo-600 text-white"
        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create tests for the four AFCAT sections and manage their questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <CreateTestForm />
          <CombineTestsForm />
        </div>
      </div>

      {/* Subject filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/dashboard" className={chipCls(!subjectFilter)}>
          All subjects
        </Link>
        {SUBJECTS.map((s) => (
          <Link
            key={s}
            href={`/admin/dashboard?subject=${s}`}
            className={chipCls(subjectFilter === s)}
          >
            {SUBJECT_LABELS[s]}
          </Link>
        ))}
      </div>

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {subjectFilter
            ? `No ${SUBJECT_LABELS[subjectFilter]} tests yet.`
            : "No tests yet — create your first test above."}
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
