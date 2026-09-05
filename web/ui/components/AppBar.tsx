import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The shared header for both surfaces.
 *
 * A three-column grid — brand, navigation, status — rather than a flex row with margins. The
 * previous header drifted because each element negotiated its own spacing; here the columns are
 * declared once and every child aligns to the same baseline, so neither surface can develop its
 * own alignment.
 */
export function AppBar({
  nav,
  status,
  className,
}: {
  nav?: React.ReactNode;
  status?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-8 border-b border-rule px-6 py-3",
        className,
      )}
    >
      <Link href="/" className="text-[15px] font-extrabold tracking-tight text-ink">
        Tollgate
      </Link>
      <nav className="flex items-center gap-1">{nav}</nav>
      <div className="flex items-center gap-4 font-mono text-[11.5px] text-dim">{status}</div>
    </header>
  );
}

export function NavTab({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-[13px] transition-colors",
        active ? "bg-surface text-ink" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

export function HealthPip({ healthy }: { healthy: boolean | null }) {
  const label = healthy === null ? "checking" : healthy ? "healthy" : "degraded";
  const tone = healthy === null ? "bg-dim" : healthy ? "bg-good" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-2">
      <i className={cn("size-[7px] rounded-full", tone)} aria-hidden />
      {label}
    </span>
  );
}
