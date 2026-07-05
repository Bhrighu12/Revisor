import TestEditor from "@/components/admin/TestEditor";

export const dynamic = "force-dynamic";

export default async function TestEditorPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  return <TestEditor testId={testId} />;
}
