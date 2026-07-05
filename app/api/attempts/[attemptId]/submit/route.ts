import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finalizeAttempt } from "@/lib/report";

type Params = { params: Promise<{ attemptId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { attemptId } = await params;

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  await finalizeAttempt(attemptId);
  return NextResponse.json({ ok: true });
}
