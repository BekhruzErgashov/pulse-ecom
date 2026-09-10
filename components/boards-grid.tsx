"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid, ListChecks } from "lucide-react";
import { CreateBoardDialog } from "@/components/create-board-dialog";
import { MyTasksDialog } from "@/components/my-tasks-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BoardWithProgress } from "@/lib/models";

export function BoardsGrid({
  initialBoards,
  workspaceId,
}: {
  initialBoards: BoardWithProgress[];
  workspaceId: string;
}) {
  const [boards, setBoards] = React.useState(initialBoards);
  const [unseenIds, setUnseenIds] = React.useState<Set<string>>(new Set());
  const [myTasksOpen, setMyTasksOpen] = React.useState(false);

  React.useEffect(() => {
    const unseen = new Set<string>();
    for (const board of boards) {
      if (!board.latestTaskAt) continue;
      const lastSeen = localStorage.getItem(`ttt_last_seen_${board.id}`);
      if (!lastSeen || board.latestTaskAt > lastSeen) {
        unseen.add(board.id);
      }
    }
    setUnseenIds(unseen);
  }, [boards]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Команда</p>
          <h1 className="text-2xl font-semibold tracking-tight">Доски задач</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMyTasksOpen(true)}>
            <ListChecks className="size-4" /> Мои задачи
          </Button>
          <CreateBoardDialog
            workspaceId={workspaceId}
            onCreated={(b) => setBoards((prev) => [b, ...prev])}
          />
        </div>
      </div>

      <MyTasksDialog open={myTasksOpen} onOpenChange={setMyTasksOpen} workspaceId={workspaceId} />

      {boards.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center animate-in fade-in duration-300">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
            <LayoutGrid className="size-5" />
          </div>
          <p className="text-sm font-medium">Пока нет ни одной доски</p>
          <p className="max-w-sm text-sm text-[var(--color-ink-soft)]">
            Создайте первую доску, чтобы начать распределять задачи по этапам.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board, i) => {
            const pct = board.taskCount === 0 ? 0 : Math.round((board.doneCount / board.taskCount) * 100);
            const hasUnseen = unseenIds.has(board.id);
            return (
              <Link
                key={board.id}
                href={`/w/${workspaceId}/boards/${board.id}`}
                className="panel card-hover group flex flex-col gap-4 p-5 animate-in fade-in slide-in-from-bottom-2 duration-500"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold tracking-tight">{board.name}</h2>
                    {hasUnseen && (
                      <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-signal-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-signal-ink)]">
                        <span className="size-1.5 shrink-0 rounded-full bg-[var(--color-signal)]" />
                        Есть новые задачи
                      </span>
                    )}
                  </div>
                  {board.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                      {board.description}
                    </p>
                  )}
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="board-progress-meta flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
                    <span className="font-mono">
                      {board.doneCount}/{board.taskCount} готово
                    </span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
