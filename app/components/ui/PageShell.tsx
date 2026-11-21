import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ComponentType } from "react";
import { IconBadge, type Tint } from "./IconBadge";

const WIDTH = { sm: "max-w-3xl", md: "max-w-4xl", lg: "max-w-6xl" } as const;

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
    <main className={`mx-auto w-full ${WIDTH[width]} ${layout === "sidebar" ? "grid gap-6 lg:grid-cols-[1fr_320px]" : "space-y-6"} px-4 py-6 md:px-6 md:py-10 ${stickyBar ? "pb-40 md:pb-32" : "pb-24 md:pb-12"} ${className}`}>
      {children}
    </main>
  );
}

export function PageHeader({
  title, subtitle, back, icon, topic, tint, children,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  icon?: ComponentType<{ className?: string }>;
  /** Topic id: shows that topic's own icon. */
  topic?: string;
  tint?: Tint | (string & {});
  /** No longer used: headers are flat. Kept so older callers compile. */
  gradient?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-4">
      {back && (
        <Link href={back.href} className="-ml-1 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-white">
          <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex items-center gap-4">
        {(icon || topic) && <IconBadge icon={icon} topic={topic} tint={tint} size="lg" />}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

/** A titled group on a page: heading, one line of help, optional link on the right. */
export function Section({ id, title, hint, action, children }: { id?: string; title: string; hint?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
        {action && <Link href={action.href} className="shrink-0 text-sm font-medium text-secondary hover:text-white">{action.label} →</Link>}
      </div>
      {children}
    </section>
  );
}

/** Titled card section used by every form-like screen. */
export function Panel({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="surface space-y-4 p-5">
      {title && (
        <div>
          <h2 className="text-lg">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Shared text-input / select styling: 44px tall, rounded-xl. */
export const controlCls =
  "min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-base outline-none placeholder:text-muted-foreground/70 focus:border-secondary";
