import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { buildReport } from "@/lib/report";
import { buildReportPdf } from "@/lib/pdf";

type Params = { params: Promise<{ attemptId: string }> };

/** Downloads a submitted attempt's report card as a PDF (admin only). */
export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { attemptId } = await params;
  const report = await buildReport(attemptId);
  if (!report) {
    return NextResponse.json(
      { error: "Attempt not found or not submitted yet" },
      { status: 404 }
    );
  }

  const pdf = await buildReportPdf(report);
  const safeName = `${report.candidateName}-${report.testTitle}`
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${safeName || attemptId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
