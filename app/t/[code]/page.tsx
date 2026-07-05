import Link from "next/link";
import { prisma } from "@/lib/db";
import { SUBJECT_LABELS } from "@/lib/utils";
import StartForm from "@/components/StartForm";

export const dynamic = "force-dynamic";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <Link href="/" className="mt-4 inline-block text-indigo-600 underline underline-offset-2">
          Back to home
        </Link>
      </div>
    </main>
  );
}

/** Shareable test link: pre-fills the access code so candidates only enter their name. */
export default async function ShareLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).trim().toUpperCase();

  const accessCode = await prisma.accessCode.findUnique({
    where: { code },
    include: {
      test: { include: { _count: { select: { questions: true } } } },
    },
  });

  if (!accessCode || !accessCode.isActive) {
    return (
      <Message
        title="Invalid link"
        body="This test link is invalid or has been disabled. Ask the person who shared it for a new one."
      />
    );
  }
  if (accessCode.usedCount >= accessCode.maxUses) {
    return (
      <Message
        title="Link already used"
        body="This access code has already been used the maximum number of times."
      />
    );
  }
  if (!accessCode.test.isActive || accessCode.test._count.questions === 0) {
    return (
      <Message
        title="Test unavailable"
        body="This test is currently disabled or has no questions yet. Please try again later."
      />
    );
  }

  const test = accessCode.test;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-indigo-600">
            {SUBJECT_LABELS[test.subject]}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {test.title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {test._count.questions} questions · {test.durationMinutes} minute timer
          </p>
          <p className="mt-1 text-xs text-slate-500">
            +{test.marksCorrect} per correct answer
            {test.marksWrong > 0 && ` · −${test.marksWrong} per wrong answer`} · unattempted
            score 0
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">You&apos;re invited to take this test</h2>
          <p className="mb-5 text-sm text-slate-500">
            Your access code is filled in — enter your name to begin. The timer starts
            immediately.
          </p>
          <StartForm initialCode={accessCode.code} />
        </div>
      </div>
    </main>
  );
}
