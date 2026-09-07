const nodes = [
  { label: "К выполнению", count: 5, color: "var(--color-stage-todo)" },
  { label: "В работе", count: 3, color: "var(--color-stage-progress)" },
  { label: "На проверке", count: 2, color: "var(--color-stage-review)" },
  { label: "Готово", count: 8, color: "var(--color-stage-done)" },
];

export function StageRailPreview() {
  return (
    <div className="panel max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="eyebrow">Запуск мобильного приложения</div>
        <div className="eyebrow">18 задач · 44% готово</div>
      </div>
      <div className="relative flex items-center justify-between">
        <div className="rail-dash absolute left-4 right-4 top-3 h-px" />
        {nodes.map((n) => (
          <div key={n.label} className="relative z-10 flex flex-col items-center gap-2">
            <div
              className="flex size-6 items-center justify-center rounded-full border-2 bg-[var(--color-paper-raised)] font-mono text-[10px] font-semibold"
              style={{ borderColor: n.color, color: n.color }}
            >
              {n.count}
            </div>
            <span className="text-xs text-[var(--color-ink-soft)]">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
