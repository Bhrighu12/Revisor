import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

type Params = { params: Promise<{ testId: string }> };

/** Randomly reorders all questions of a test (Fisher–Yates on the order column). */
export async function POST(_req: NextRequest, { params }: Params) {
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

  const questions = await prisma.question.findMany({
    where: { testId },
    select: { id: true },
  });
  if (questions.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 questions to shuffle" },
      { status: 400 }
    );
  }

  const ids = questions.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.question.update({ where: { id }, data: { order: i + 1 } })
    )
  );

  return NextResponse.json({ ok: true, count: ids.length });
}
