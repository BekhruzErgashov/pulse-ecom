import { STAGES, type StageId } from "@/lib/schema";
import { Progress } from "@/components/ui/progress";

const STAGE_COLOR_VAR: Record<StageId, string> = {
  todo: "var(--color-stage-todo)",
  in_progress: "var(--color-stage-progress)",
  review: "var(--color-stage-review)",
  done: "var(--color-stage-done)",
};

export function StageRail({ counts, total }: { counts: Record<StageId, number>; total: number }) {
  const donePct = total === 0 ? 0 : Math.round((counts.done / total) * 100);

  return (
    <div className="panel mb-6 p-5">
      <div className="relative flex items-center justify-between">
        <div className="rail-dash absolute left-4 right-4 top-3.5 h-px" />
        {STAGES.map((stage) => (
          <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2 bg-[var(--color-paper-raised)] px-2">
            <div
              className="flex size-7 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold"
              style={{
                borderColor: STAGE_COLOR_VAR[stage.id],
                color: STAGE_COLOR_VAR[stage.id],
              }}
            >
              {counts[stage.id]}
            </div>
            <span className="text-xs text-[var(--color-ink-soft)]">{stage.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Progress value={donePct} colorVar="var(--color-stage-done)" />
        <span className="whitespace-nowrap font-mono text-xs text-[var(--color-ink-soft)]">
          {donePct}% готово
        </span>
      </div>
    </div>
  );
}
