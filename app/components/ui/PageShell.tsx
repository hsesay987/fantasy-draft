import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ComponentType } from "react";

const WIDTH = { sm: "max-w-3xl", md: "max-w-4xl", lg: "max-w-7xl" } as const;

/** One page frame for the whole app: same gutters, widths and rhythm everywhere. */
export function PageShell({
  width = "md",
  stickyBar,
  layout = "stack",
  className = "",
  children,
}: {
  width?: keyof typeof WIDTH;
  /** "sidebar": main column plus a 320px rail on large screens. */
  layout?: "stack" | "sidebar";
  /** Reserve room for a fixed bottom action bar. */
  stickyBar?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={`mx-auto w-full ${WIDTH[width]} ${layout === "sidebar" ? "grid gap-6 lg:grid-cols-[1fr_320px]" : "space-y-6"} px-4 py-8 md:px-6 md:py-12 ${stickyBar ? "pb-40 md:pb-32" : "pb-24 md:pb-12"} ${className}`}>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  icon: Icon,
  gradient = "from-primary/50 to-accent/20",
  children,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  icon?: ComponentType<{ className?: string }>;
  gradient?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-4">
      {back && (
        <Link href={back.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-white">
          <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex items-center gap-4">
        {Icon && (
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${gradient}`}>
            <Icon className="h-7 w-7 text-white" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

/** Titled card section used by every form-like screen. */
export function Panel({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
      {title && (
        <div>
          <h2 className="text-xl">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Shared text-input / select styling: 44px tall, rounded-xl. */
export const controlCls =
  "min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base outline-none focus:border-secondary";
