"use client";

import AdSlot from "./AdSlot";
import { useAds } from "../hooks/useAds";
import { usePathname } from "next/navigation";

export default function AdShell({ children }: { children: React.ReactNode }) {
  const { showAds, reason } = useAds();
  const pathname = usePathname();

  // Disable ads during live draft
  const isDraft = pathname.startsWith("/draft/");
  const adsDisabled = !showAds || isDraft;

  return (
    <div className="flex-1 w-full flex flex-col">
      {adsDisabled && (
        <div className="sticky top-0 z-40 flex justify-end px-4 py-2">
          <span className="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-slate-400">
            Ads disabled{reason ? ` (${reason})` : ""}
          </span>
        </div>
      )}
      <div className="flex-1 w-full flex gap-6 px-4 lg:px-8 py-4">
        {showAds && !isDraft && (
          <aside className="hidden xl:flex w-64 shrink-0 sticky top-4 self-start flex-col gap-4">
            <AdSlot placement="rail" variant="primary" />
            <AdSlot placement="rail" variant="secondary" />
          </aside>
        )}

        <main className="flex-1 w-full">{children}</main>

        {showAds && !isDraft && (
          <aside className="hidden 2xl:flex w-64 shrink-0 sticky top-4 self-start">
            <AdSlot placement="rail" variant="community" />
          </aside>
        )}
      </div>

      {showAds && !isDraft && (
        <div className="xl:hidden px-4 pb-6">
          <AdSlot placement="footer" variant="secondary" />
        </div>
      )}
    </div>
  );
}
