import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { parseImage } from "@/lib/utils";

type Params = { params: Promise<{ testId: string }> };

interface IncomingQuestion {
  text?: unknown;
  imageUrl?: unknown;
  options?: unknown;
  optionImages?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
}

function parseQuestion(q: IncomingQuestion) {
  const text = typeof q.text === "string" ? q.text.trim() : "";
  const options = Array.isArray(q.options)
    ? q.options.filter((o): o is string => typeof o === "string").map((o) => o.trim())
    : [];
  const correctIndex = Number(q.correctIndex);
  if (
    !text ||
    options.length < 2 ||
    options.some((o) => !o) ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= options.length
  ) {
    return null;
  }
  const explanation =
    typeof q.explanation === "string" && q.explanation.trim() ? q.explanation.trim() : null;
  const imageUrl = parseImage(q.imageUrl);
  const rawOptionImages = Array.isArray(q.optionImages) ? q.optionImages : [];
  const optionImages = options.map((_, i) => parseImage(rawOptionImages[i]) ?? "");
  return {
    text,
    options,
    correctIndex,
    explanation,
    imageUrl,
    // Store the parallel array only when at least one option has an image.
    optionImages: optionImages.some((s) => s) ? optionImages : [],
  };
}

/**
 * Duplicate detection: same question text and same options (whitespace and
 * case insensitive; option order ignored) counts as the same question.
 */
function dupKey(text: string, options: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(text)}|${options.map(norm).sort().join("§")}`;
}

/**
 * Adds questions to a test. Accepts either a single question object or
 * { questions: [...] } for bulk inserts (used by AI generation / import).
 * Exact duplicates of existing questions are rejected (single add) or
 * skipped (bulk add).
 */
export async function POST(req: NextRequest, { params }: Params) {
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

  const body = await req.json().catch(() => null);
  const isBulk = Array.isArray(body?.questions);
  const incoming: IncomingQuestion[] = isBulk ? body.questions : body ? [body] : [];

  const parsed = incoming.map(parseQuestion);
  if (parsed.length === 0 || parsed.some((p) => p === null)) {
    return NextResponse.json(
      {
        error:
          "Each question needs text, 2+ non-empty options, and a valid correctIndex",
      },
      { status: 400 }
    );
  }
  const valid = parsed as NonNullable<(typeof parsed)[number]>[];

  // Flag exact duplicates of questions already in this test (and repeats
  // within the incoming batch itself).
  const existing = await prisma.question.findMany({
    where: { testId },
    select: { text: true, options: true },
  });
  const seen = new Set(existing.map((q) => dupKey(q.text, q.options)));
  const fresh: typeof valid = [];
  let skipped = 0;
  for (const p of valid) {
    const key = dupKey(p.text, p.options);
    if (seen.has(key)) {
      skipped++;
    } else {
      seen.add(key);
      fresh.push(p);
    }
  }

  if (fresh.length === 0) {
    return NextResponse.json(
      {
        error: isBulk
          ? `All ${skipped} question${skipped > 1 ? "s" : ""} already exist in this test — nothing added`
          : "Duplicate question — an identical question (same text and options) already exists in this test",
      },
      { status: 409 }
    );
  }

  const maxOrder = await prisma.question.aggregate({
    where: { testId },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? 0) + 1;

  // A single createMany instead of one create per question — per-row inserts
  // in a transaction exceed Prisma's 5s transaction timeout on large imports.
  const created = await prisma.question.createMany({
    data: fresh.map((p, i) => ({
      ...p,
      testId,
      order: startOrder + i,
    })),
  });

  return NextResponse.json({ count: created.count, skipped }, { status: 201 });
}
