import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

type Params = { params: Promise<{ codeId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { codeId } = await params;
  const body = await req.json().catch(() => null);

  const data: { isActive?: boolean; maxUses?: number; label?: string | null } = {};
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
  if (body?.maxUses !== undefined) {
    const m = Number(body.maxUses);
    if (!Number.isInteger(m) || m < 1 || m > 1000) {
      return NextResponse.json({ error: "maxUses must be 1-1000" }, { status: 400 });
    }
    data.maxUses = m;
  }
  if (body?.label !== undefined) {
    data.label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  }

  try {
    const code = await prisma.accessCode.update({ where: { id: codeId }, data });
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { codeId } = await params;
  try {
    await prisma.accessCode.delete({ where: { id: codeId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }
}
