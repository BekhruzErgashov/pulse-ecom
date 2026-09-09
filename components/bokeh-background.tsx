/**
 * Фоновая подсветка редизайна «Dark Liquid-Glass» — по правке пользователя
 * («с учётом скилов дизайна — как сделать дороже») сведена с трёх разноцветных
 * пятен (акцент/розовое #ff8ac0/зелёное #4ade9e) к ОДНОМУ приглушённому
 * акцентному пятну: множество ярких цветов на фоне читается как «конфетти
 * SaaS-стартапа», а не как сдержанный премиальный интерфейс — весь «бюджет»
 * цветового акцента в один момент, а не размазан по трём пятнам сразу
 * (принцип «spend boldness in one place» из дизайн-скила). Раньше здесь было
 * три `<div>` (комментарий с их обоснованием — в истории git/Obsidian, не
 * повторяем byte-в-byte здесь).
 *
 * Цвет пятна литерал, не var(--color-*) — как и раньше, вручную держим в
 * синхроне с --color-signal (сейчас #5b9dff), единственный по-настоящему
 * акцентный тон в теме (см. также комментарий у --color-signal в
 * globals.css про правку «в целом всё #5b9dff»).
 */
export function BokehBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute rounded-full"
        style={{
          top: "-10%",
          left: "8%",
          width: 640,
          height: 640,
          // Альфа поднята с 0x40 до 0x60 — с одним пятном вместо трёх
          // можно позволить ему больше присутствия, не рискуя «конфетти»
          // (см. правку про единый акцент выше): было слишком незаметно.
          background: "radial-gradient(circle, #5b9dff60, transparent 70%)",
          filter: "blur(90px)",
          animation: "bokeh-drift-1 22s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(6,6,19,0.2), rgba(6,6,19,0.9))" }}
      />
    </div>
  );
}
