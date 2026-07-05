import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { generateQuestionsFromTopic } from "@/lib/gemini";
import { SUBJECT_LABELS } from "@/lib/utils";

export const maxDuration = 60;

type Params = { params: Promise<{ testId: string }> };

/**
 * Generates draft questions with the LLM. Drafts are returned for admin
 * review — nothing is saved until the admin confirms via the questions
 * endpoint.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { testId } = await params;
  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const count = Math.min(Math.max(Number(body?.count) || 5, 1), 25);

  try {
    const drafts = await generateQuestionsFromTopic(
      SUBJECT_LABELS[test.subject],
      topic,
      count
    );
    return NextResponse.json({ drafts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
