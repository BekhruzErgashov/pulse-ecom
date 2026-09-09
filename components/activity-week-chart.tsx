/**
 * «Активность недели» — по прямой правке пользователя («нормальный редизайн
 * с учётом скиллов») это первый по-настоящему СВОЙ, а не позаимствованный из
 * общего словаря glassmorphism-дашбордов элемент интерфейса — «фирменный»
 * элемент, ради которого имеет смысл сверять остальной дизайн (см. дизайн-
 * скил: «the single unique element this page will be remembered by that
 * embodies the brief»). Приложение называется «Пульс» — и до этой правки
 * название было чисто декоративным, никак не отражённым в самом дизайне:
 * тот же тёмный glass-стиль, что у любого другого AI-продукта. Здесь ровно
 * то место, где название и функция (график активности команды по дням)
 * совпадают буквально — задачи «закрываются» так же, как бьётся пульс:
 * неровно, но с узнаваемым ритмом. Раньше здесь были обычные столбики
 * (rounded bar chart) — заменены на сглаженную линию в духе кардиомонитора:
 * светящийся градиентный штрих, точки на каждом дне, у сегодняшнего дня —
 * пульсирующая точка (единственная анимация здесь, не считая самого штриха).
 *
 * Данные (counts/labels) не выдуманы — тот же реальный источник, что был у
 * столбиков (см. app/w/[workspaceId]/boards/page.tsx). Форма линии строится
 * от НАСТОЯЩИХ точек через Catmull-Rom→Bezier (buildSmoothPath ниже) — это
 * сглаживание формы существующих данных, а не рисование произвольной
 * «EKG-осциллограммы» поверх: сохраняет «structure is information» из
 * дизайн-скила — то, что видно на графике, честно соответствует числам.
 */
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const VIEW_W = 280;
const VIEW_H = 70;
const PAD_Y = 8;

export function ActivityWeekChart({ counts, labels }: { counts: number[]; labels: string[] }) {
  const max = Math.max(1, ...counts);
  const n = counts.length;
  const points = counts.map((count, i) => ({
    x: n > 1 ? (i / (n - 1)) * VIEW_W : VIEW_W / 2,
    y: VIEW_H - PAD_Y - (count / max) * (VIEW_H - PAD_Y * 2),
  }));
  const linePath = buildSmoothPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${VIEW_H} L ${points[0].x} ${VIEW_H} Z`
      : "";
  const lastIndex = points.length - 1;

  return (
    <div
      className="flex flex-col gap-1 rounded-[18px] border p-4"
      style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.09)" }}
    >
      <p className="font-display m-0 mb-0.5 text-[13px] font-semibold text-white">Активность недели</p>
      <p className="m-0 mb-3.5 text-[11.5px]" style={{ color: "#7e7d99" }}>
        Задач закрыто по дням
      </p>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="h-[70px] w-full overflow-visible">
        <defs>
          <linearGradient id="pulse-line-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-signal-light)" />
            <stop offset="100%" stopColor="var(--color-signal)" />
          </linearGradient>
          <linearGradient id="pulse-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-signal)" stopOpacity="0" />
          </linearGradient>
          {/* Свечение штриха — тот же приём, что у остального «стекла»
              (grain/блик из предыдущих правок), только здесь это буквально
              светящаяся линия кардиомонитора, а не поверхность. */}
          <filter id="pulse-line-glow" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Базовая линия — как развёртка на приборе. */}
        <line x1="0" y1={VIEW_H - 1} x2={VIEW_W} y2={VIEW_H - 1} stroke="var(--color-line)" strokeWidth="1" />

        {areaPath && <path d={areaPath} fill="url(#pulse-line-fill)" />}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="url(#pulse-line-stroke)"
            strokeWidth="2.25"
            strokeLinecap="round"
            filter="url(#pulse-line-glow)"
          />
        )}

        {points.map((p, i) => {
          const isLast = i === lastIndex;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={isLast ? 4 : 2.25}
              fill={isLast ? "var(--color-signal-light)" : "var(--color-signal)"}
              className={isLast ? "animate-pulse" : undefined}
            >
              <title>
                {labels[i]}: {counts[i]}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[10px]" style={{ color: "#7e7d99" }}>
        {labels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
