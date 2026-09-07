import Image from "next/image";
import Link from "next/link";

export function BoardsBanner({ workspaceId }: { workspaceId: string }) {
  return (
    <Link
      href={`/w/${workspaceId}/game`}
      className="mb-8 block overflow-hidden rounded-(--radius-card) bg-[#171b21] shadow-sm transition-transform hover:scale-[1.01]"
      title="Мини-игры: выберите, во что сыграть"
    >
      <Image
        src="/board-banner.png"
        alt="Мини-игры: выберите, во что сыграть"
        width={1442}
        height={322}
        priority
        className="h-auto w-full"
      />
    </Link>
  );
}
