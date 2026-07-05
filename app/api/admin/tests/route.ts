import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { SUBJECTS } from "@/lib/utils";
import type { Subject } from "@/app/generated/prisma/enums";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const tests = await prisma.test.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, attempts: true } } },
  });
  return NextResponse.json({ tests });
}

export async function POST(req: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const subject = body?.subject as Subject;
  const durationMinutes = Number(body?.durationMinutes);

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!SUBJECTS.includes(subject)) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
    return NextResponse.json(
      { error: "Duration must be between 1 and 300 minutes" },
      { status: 400 }
    );
  }

  const test = await prisma.test.create({
    data: { title, subject, durationMinutes },
  });
  return NextResponse.json({ test }, { status: 201 });
}
