"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";
import RoomStatusBanner from "./RoomStatusBanner";
import SoundToggle from "./SoundToggle";
import { NAV, isActive } from "./nav";

export { isActive };

export default function TopBar() {
  const path = usePathname() || "/";
  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 md:px-6">
        <Link href="/" className="font-display text-xl" aria-label="TopPic home">
          Top<span className="text-secondary">Pic</span>
        </Link>

        <nav className="hidden gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <RoomStatusBanner />
          <SoundToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
