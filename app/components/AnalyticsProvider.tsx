"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { identify, initAnalytics, resetAnalytics, track } from "../lib/analytics";

function PageViews() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    // Room codes are secrets-ish: send the route shape, not the code.
    const path = pathname.replace(/^\/room\/[^/]+/, "/room/[code]").replace(/^\/draft\/(nba|nfl|cartoon)\/[^/]+/, "/draft/$1/[id]");
    track("$pageview", { $current_url: window.location.origin + path, path, pool: search.get("pool") ?? undefined });
  }, [pathname, search]);
  return null;
}

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (user?.id) identify(user.id);
    else resetAnalytics();
  }, [user?.id]);

  return (
    <>
      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
      {children}
    </>
  );
}
