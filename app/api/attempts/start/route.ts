import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!code || !name) {
    return NextResponse.json(
      { error: "Enter both your access code and your name" },
      { status: 400 }
    );
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  const accessCode = await prisma.accessCode.findUnique({
    where: { code },
    include: {
      test: { include: { _count: { select: { questions: true } } } },
    },
  });

  if (!accessCode || !accessCode.isActive) {
    return NextResponse.json({ error: "Invalid or inactive access code" }, { status: 404 });
  }
  if (accessCode.usedCount >= accessCode.maxUses) {
    return NextResponse.json(
      { error: "This access code has already been used the maximum number of times" },
      { status: 403 }
    );
  }
  if (!accessCode.test.isActive) {
    return NextResponse.json({ error: "This test is currently disabled" }, { status: 403 });
  }
  if (accessCode.test._count.questions === 0) {
    return NextResponse.json(
      { error: "This test has no questions yet — contact the administrator" },
      { status: 403 }
    );
  }

  const [attempt] = await prisma.$transaction([
    prisma.attempt.create({
      data: {
        testId: accessCode.testId,
        accessCodeId: accessCode.id,
        candidateName: name,
      },
    }),
    prisma.accessCode.update({
      where: { id: accessCode.id },
      data: { usedCount: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ attemptId: attempt.id }, { status: 201 });
}
