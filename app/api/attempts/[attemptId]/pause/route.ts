import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { finalizeAttempt, isExpired, remainingSeconds, MAX_PAUSE_MS } from "@/lib/report";

type Params = { params: Promise<{ attemptId: string }> };

/** Pauses or resumes the attempt's clock. Body: { action: "pause" | "resume" } */
export async function POST(req: NextRequest, { params }: Params) {
  const { attemptId } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 });
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { test: { select: { durationMinutes: true } } },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (attempt.status === "SUBMITTED") {
    return NextResponse.json({ error: "Attempt already submitted" }, { status: 409 });
  }
  if (isExpired(attempt, attempt.test.durationMinutes)) {
    await finalizeAttempt(attemptId);
    return NextResponse.json({ error: "Time is up" }, { status: 409 });
  }

  let updated = attempt;
  if (action === "pause" && attempt.pausedAt === null) {
    updated = await prisma.attempt.update({
      where: { id: attemptId },
      data: { pausedAt: new Date() },
      include: { test: { select: { durationMinutes: true } } },
    });
  } else if (action === "resume" && attempt.pausedAt !== null) {
    const pauseMs = Math.min(Date.now() - attempt.pausedAt.getTime(), MAX_PAUSE_MS);
    updated = await prisma.attempt.update({
      where: { id: attemptId },
      data: {
        pausedAt: null,
        pausedSeconds: attempt.pausedSeconds + Math.round(pauseMs / 1000),
      },
      include: { test: { select: { durationMinutes: true } } },
    });
  }

  return NextResponse.json({
    paused: updated.pausedAt !== null,
    remainingSeconds: Math.max(0, remainingSeconds(updated, updated.test.durationMinutes)),
  });
}
