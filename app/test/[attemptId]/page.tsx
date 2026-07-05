import QuizRunner from "@/components/QuizRunner";

export const dynamic = "force-dynamic";

export default async function TestPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return <QuizRunner attemptId={attemptId} />;
}
