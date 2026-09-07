import * as React from "react";

// Спрайты для игры-раннера — реальные PNG-картинки (персонаж и препятствия,
// нарисованные пользователем), а не хендкодный SVG. Файлы лежат в
// `public/game/character/*.png` и `public/game/obstacles/*.png`, вырезаны
// программно из присланных исходников (см. HANDOFF.md).

function ImgSprite({
  src,
  alt,
  className,
  position = "bottom",
}: {
  src: string;
  alt: string;
  className?: string;
  position?: "bottom" | "center";
}) {
  return (
    <div className={className ?? "h-full w-full"} style={{ position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: position === "bottom" ? "center bottom" : "center center",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export type RunnerPose =
  | "idle"
  | "run1"
  | "run2"
  | "run3"
  | "run4"
  | "jump1"
  | "jump2"
  | "jump3"
  | "jump4"
  | "jump5"
  | "duck1"
  | "duck2"
  | "duck3";

export function Runner({ pose, className }: { pose: RunnerPose; className?: string }) {
  return <ImgSprite src={`/game/character/${pose}.png`} alt="" className={className} position="bottom" />;
}

export function DeadlineSprite() {
  return <ImgSprite src="/game/obstacles/deadline.png" alt="Дедлайн" position="bottom" />;
}

export function TasksSprite() {
  return <ImgSprite src="/game/obstacles/pile.png" alt="Гора задач" position="bottom" />;
}

export function CountdownSprite() {
  return <ImgSprite src="/game/obstacles/countdown.png" alt="D-Day" position="bottom" />;
}

export function ReportSprite() {
  return <ImgSprite src="/game/obstacles/report.png" alt="Отчёт" position="bottom" />;
}

export function ProblemSprite() {
  return <ImgSprite src="/game/obstacles/problem.png" alt="Неожиданная проблема" position="bottom" />;
}

export function ReworkSprite() {
  return <ImgSprite src="/game/obstacles/rework.png" alt="Переделки" position="bottom" />;
}

export function MailSprite() {
  return <ImgSprite src="/game/obstacles/mail.png" alt="Непрочитанные письма" position="center" />;
}

export function MeetingSprite() {
  return <ImgSprite src="/game/obstacles/meeting.png" alt="Срочное собрание" position="center" />;
}

export function AsapSprite() {
  return <ImgSprite src="/game/obstacles/asap.png" alt="Срочный запрос" position="center" />;
}

export function ChatSprite() {
  return <ImgSprite src="/game/obstacles/chat.png" alt="Отвлекающие чаты" position="center" />;
}

export function Cactus({ className }: { className?: string }) {
  return <ImgSprite src="/game/cactus.png" alt="" className={className} position="bottom" />;
}
