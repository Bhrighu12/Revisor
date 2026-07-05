import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

type Params = { params: Promise<{ testId: string }> };

/** Randomly reorders all questions of a test. */
export async function POST(_req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: { id: true, _count: { select: { questions: true } } },
  });
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }
  if (test._count.questions < 2) {
    return NextResponse.json(
      { error: "Need at least 2 questions to shuffle" },
      { status: 400 }
    );
  }

  // Single statement instead of one update per question — per-row updates in
  // a transaction exceed Prisma's 5s transaction timeout on large tests.
  const count = await prisma.$executeRaw`
    UPDATE "Question" AS q
    SET "order" = s.rn::int
    FROM (
      SELECT id, row_number() OVER (ORDER BY random()) AS rn
      FROM "Question"
      WHERE "testId" = ${testId}
    ) AS s
    WHERE q.id = s.id
  `;

  return NextResponse.json({ ok: true, count });
}
