import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getQuestion } from "@/lib/data";

export default async function LegacyQuestionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const question = await getQuestion(id);
  if (!question) notFound();

  redirect(`/w/${question.workspaceId}/questions/${id}`);
}
