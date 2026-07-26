import { ArrowLeft } from "lucide-react";

/**
 * Back-link when Work was opened from a Platform Mission deep link.
 * `return` must be a full http(s) URL.
 */
export function MissionReturnLink({ returnUrl }: { returnUrl?: string }) {
  if (!returnUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  return (
    <a
      href={parsed.toString()}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Tilbake til Mission
    </a>
  );
}
