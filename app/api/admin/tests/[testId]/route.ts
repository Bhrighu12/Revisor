import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

type Params = { params: Promise<{ testId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      questions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      _count: { select: { attempts: true } },
    },
  });
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }
  return NextResponse.json({ test });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  const body = await req.json().catch(() => null);

  const data: {
    title?: string;
    durationMinutes?: number;
    isActive?: boolean;
    marksCorrect?: number;
    marksWrong?: number;
  } = {};
  if (typeof body?.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (body?.durationMinutes !== undefined) {
    const d = Number(body.durationMinutes);
    if (!Number.isInteger(d) || d < 1 || d > 300) {
      return NextResponse.json(
        { error: "Duration must be between 1 and 300 minutes" },
        { status: 400 }
      );
    }
    data.durationMinutes = d;
  }
  if (typeof body?.isActive === "boolean") {
    data.isActive = body.isActive;
  }
  if (body?.marksCorrect !== undefined) {
    const m = Number(body.marksCorrect);
    if (!Number.isInteger(m) || m < 1 || m > 100) {
      return NextResponse.json(
        { error: "Marks per correct answer must be between 1 and 100" },
        { status: 400 }
      );
    }
    data.marksCorrect = m;
  }
  if (body?.marksWrong !== undefined) {
    const m = Number(body.marksWrong);
    if (!Number.isInteger(m) || m < 0 || m > 100) {
      return NextResponse.json(
        { error: "Negative marks per wrong answer must be between 0 and 100" },
        { status: 400 }
      );
    }
    data.marksWrong = m;
  }

  try {
    const test = await prisma.test.update({ where: { id: testId }, data });
    return NextResponse.json({ test });
  } catch {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  try {
    await prisma.test.delete({ where: { id: testId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }
}
