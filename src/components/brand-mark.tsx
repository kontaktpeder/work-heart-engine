import { cn } from "@/lib/utils";

/** Stencil W used in the Work Core tile and wordmark. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M3.1 6.2h6.05l2.55 11.15L16 8.4l4.3 8.95 2.55-11.15H28.9l-5.35 19.6h-5.35L16 19.05 13.8 25.8H8.45L3.1 6.2Z"
      />
    </svg>
  );
}

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const TILE: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-11 w-11",
  lg: "h-14 w-14",
};

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-none bg-primary text-primary-foreground",
        TILE[size],
        className,
      )}
      aria-hidden
    >
      <BrandGlyph className="h-[68%] w-[68%]" />
    </span>
  );
}

type BrandWordmarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const WORD: Record<NonNullable<BrandWordmarkProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-[2.15rem]",
};

export function BrandWordmark({ className, size = "md" }: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        "font-display font-bold uppercase leading-none tracking-[0.14em] text-foreground",
        WORD[size],
        className,
      )}
    >
      Work
      <span className="mx-[0.28em] inline-block h-[0.72em] w-px translate-y-[0.06em] bg-primary align-middle" />
      Core
    </span>
  );
}

export function BrandLockup({
  size = "lg",
  className,
}: {
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <BrandMark size={size} />
      <BrandWordmark size={size} className="mt-4" />
    </div>
  );
}
