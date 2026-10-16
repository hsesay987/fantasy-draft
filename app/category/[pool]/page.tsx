"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { motion } from "motion/react";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { track } from "../../lib/analytics";
import { PageHeader, PageShell } from "../../components/ui";
import { category, formatsFor, FORMAT_WHY } from "../../play/categories";
import { formatMeta } from "../../play/formats";
import { getCatalog } from "../../topicDraft/catalogs";

const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28 } } };

export default function CategoryPage() {
  const { pool } = useParams<{ pool: string }>();
  const cat = category(pool);
  useEffect(() => {
    if (cat) track("category_opened", { pool });
  }, [cat, pool]);
  if (!cat) return notFound();
  const formats = formatsFor(pool);
  const rec = new Map(cat.recommended.map((r) => [r.format, r.why]));
  const quick = cat.recommended[0]!;
  const quickMeta = formatMeta(quick.format)!;

  return (
    <PageShell>
      <PageHeader title={cat.title} subtitle={`${cat.blurb} · ${getCatalog(pool).length} to choose from`} iconSrc={cat.iconSrc} gradient={cat.gradient} back={{ href: "/", label: "All topics" }} />

      <Link
        href={`/play/${quick.format}?pool=${pool}`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-accent px-5 py-3 font-semibold text-black shadow-[0_0_30px_-8px_var(--accent)] transition-transform hover:-translate-y-0.5"
      >
        <span className="flex items-center gap-2"><Sparkles className="h-5 w-5" aria-hidden /> Quick play: {quickMeta.title}</span>
        <span className="text-sm font-medium opacity-80">{quick.why}</span>
      </Link>

      <div>
        <h2 className="text-xl">Choose your draft</h2>
        <p className="text-sm text-muted-foreground">Every type is fully customizable on the next screen.</p>
      </div>

      <motion.ul initial="hidden" animate="show" transition={{ staggerChildren: 0.05 }} className="grid gap-4 sm:grid-cols-2">
        {formats.map((id) => {
          const f = formatMeta(id)!;
          const Icon = f.icon;
          const why = rec.get(id);
          return (
            <motion.li key={id} variants={item}>
              <Link href={`/play/${id}?pool=${pool}`} className="group relative flex h-full gap-4 rounded-2xl border border-white/10 bg-card/70 p-5 transition-colors hover:border-secondary hover:bg-primary/10">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${f.gradient}`}><Icon className="h-6 w-6 text-white" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-lg font-display">{f.title}</span>
                  <span className="block text-sm text-muted-foreground">{why ?? FORMAT_WHY[id]}</span>
                </span>
                {why && <span className="absolute right-4 top-4 rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-black">Best fit</span>}
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </PageShell>
  );
}
