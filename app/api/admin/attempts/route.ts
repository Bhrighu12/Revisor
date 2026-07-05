import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const attempts = await prisma.attempt.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
    include: {
      test: { select: { id: true, title: true, subject: true, _count: { select: { questions: true } } } },
      accessCode: { select: { code: true, label: true } },
    },
  });
  return NextResponse.json({ attempts });
}
