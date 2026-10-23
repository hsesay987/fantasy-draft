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
      {adsDisabled && process.env.NODE_ENV !== "production" && (
        <div className="flex justify-end px-4 pt-2">
          <span className="rounded-full border border-white/10 bg-card/80 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Ads disabled{reason ? ` (${reason})` : ""}
          </span>
        </div>
      )}
      <div className="flex-1 w-full flex gap-6 px-0 lg:px-4">
        {showAds && !isDraft && (
          <aside className="hidden xl:flex w-64 shrink-0 sticky top-4 self-start flex-col gap-4">
            <AdSlot placement="rail" variant="primary" />
            <AdSlot placement="rail" variant="secondary" />
          </aside>
        )}

        <div className="flex-1 w-full min-w-0">{children}</div>

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
