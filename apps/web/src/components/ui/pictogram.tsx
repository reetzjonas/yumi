import { pictogramFile } from "@yumi/shared";
import { cn } from "@/lib/utils";

export function Pictogram({
  icon,
  fallback,
  size = 28,
  className,
}: {
  icon?: string | null;
  fallback?: string | null;
  size?: number;
  className?: string;
}) {
  const file = pictogramFile(icon) ?? pictogramFile(fallback) ?? "1f9fa.svg";
  return (
    <img
      src={`/pictograms/${file}`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className={cn("pictogram", className)}
    />
  );
}
