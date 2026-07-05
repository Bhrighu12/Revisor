import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

type Params = { params: Promise<{ testId: string }> };

interface IncomingQuestion {
  text?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
}

function parseQuestion(q: IncomingQuestion) {
  const text = typeof q.text === "string" ? q.text.trim() : "";
  const options = Array.isArray(q.options)
    ? q.options.filter((o): o is string => typeof o === "string").map((o) => o.trim())
    : [];
  const correctIndex = Number(q.correctIndex);
  if (
    !text ||
    options.length < 2 ||
    options.some((o) => !o) ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= options.length
  ) {
    return null;
  }
  const explanation =
    typeof q.explanation === "string" && q.explanation.trim() ? q.explanation.trim() : null;
  return { text, options, correctIndex, explanation };
}

/**
 * Adds questions to a test. Accepts either a single question object or
 * { questions: [...] } for bulk inserts (used by AI generation / import).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: { id: true },
  });
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const incoming: IncomingQuestion[] = Array.isArray(body?.questions)
    ? body.questions
    : body
      ? [body]
      : [];

  const parsed = incoming.map(parseQuestion);
  if (parsed.length === 0 || parsed.some((p) => p === null)) {
    return NextResponse.json(
      {
        error:
          "Each question needs text, 2+ non-empty options, and a valid correctIndex",
      },
      { status: 400 }
    );
  }

  const maxOrder = await prisma.question.aggregate({
    where: { testId },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? 0) + 1;

  // A single createMany instead of one create per question — per-row inserts
  // in a transaction exceed Prisma's 5s transaction timeout on large imports.
  const created = await prisma.question.createMany({
    data: (parsed as NonNullable<(typeof parsed)[number]>[]).map((p, i) => ({
      ...p,
      testId,
      order: startOrder + i,
    })),
  });

  return NextResponse.json({ count: created.count }, { status: 201 });
}
