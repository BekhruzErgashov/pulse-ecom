import { BoardsBanner } from "@/components/boards-banner";

/**
 * Декоративная «шапка» экрана мини-игр — баннер-приглашение (та же
 * картинка, что и на доске задач), тут уже некликабельная
 * (`pointer-events-none`): человек уже на этой странице, повторный переход
 * не нужен. Раньше здесь ещё дублировался целый фейковый хэдер «Доски
 * задач» с полупрозрачными кнопками — визуально спорил с настоящим
 * заголовком «Выберите игру» сразу под ним (два заголовка подряд), поэтому
 * убран, остался только баннер.
 */
export function GameBackdrop({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="pointer-events-none select-none">
      <BoardsBanner workspaceId={workspaceId} />
    </div>
  );
}
