import { BRAND } from "@/lib/branding";
import { cn } from "@/lib/cn";

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  if (BRAND.logoUrl) {
    return (
      <img
        src={BRAND.logoUrl}
        alt={BRAND.name}
        width={size}
        height={size}
        className={cn("rounded-control object-contain", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-control bg-primary font-bold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden
    >
      {BRAND.shortName.charAt(0).toUpperCase()}
    </span>
  );
}
