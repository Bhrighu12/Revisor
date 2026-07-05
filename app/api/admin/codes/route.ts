import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { generateAccessCode } from "@/lib/utils";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      test: { select: { id: true, title: true, subject: true } },
      _count: { select: { attempts: true } },
    },
  });
  return NextResponse.json({ codes });
}

export async function POST(req: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const testId = typeof body?.testId === "string" ? body.testId : "";
  const label = typeof body?.label === "string" ? body.label.trim() || null : null;
  const count = Math.min(Math.max(Number(body?.count) || 1, 1), 100);
  const maxUses = Math.min(Math.max(Number(body?.maxUses) || 1, 1), 1000);

  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) {
    return NextResponse.json({ error: "Select a valid test" }, { status: 400 });
  }

  const codes = [];
  for (let i = 0; i < count; i++) {
    // Retry on the (rare) collision with an existing code.
    for (let tries = 0; tries < 5; tries++) {
      try {
        const created = await prisma.accessCode.create({
          data: { code: generateAccessCode(), testId, label, maxUses },
          include: {
            test: { select: { id: true, title: true, subject: true } },
            _count: { select: { attempts: true } },
          },
        });
        codes.push(created);
        break;
      } catch {
        if (tries === 4) {
          return NextResponse.json(
            { error: "Failed to generate unique codes, try again" },
            { status: 500 }
          );
        }
      }
    }
  }

  return NextResponse.json({ codes }, { status: 201 });
}
