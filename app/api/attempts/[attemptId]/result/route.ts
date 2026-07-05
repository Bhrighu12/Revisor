import { NextRequest, NextResponse } from "next/server";
import { buildReport } from "@/lib/report";

type Params = { params: Promise<{ attemptId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { attemptId } = await params;
  const report = await buildReport(attemptId);
  if (!report) {
    return NextResponse.json(
      { error: "Result not available (attempt missing or not submitted)" },
      { status: 404 }
    );
  }
  return NextResponse.json({ report });
}
