import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getBoard } from "@/lib/data";

// Старая ссылка вида /boards/:id (без пространства в пути) — определяем
// пространство доски и уводим на канонический /w/[workspaceId]/boards/:id.
export default async function LegacyBoardRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const board = await getBoard(id);
  if (!board) notFound();

  redirect(`/w/${board.workspaceId}/boards/${id}`);
}
