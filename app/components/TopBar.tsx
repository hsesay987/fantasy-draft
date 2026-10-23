"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";
import RoomStatusBanner from "./RoomStatusBanner";
import SoundToggle from "./SoundToggle";
import { NAV } from "./nav";

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export default function TopBar() {
  const path = usePathname() || "/";
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-2xl tracking-wide" aria-label="TopPic home">
            Top<span className="text-accent">Pic</span>
          </Link>
          <RoomStatusBanner />
        </div>

        <nav className="hidden gap-1 md:flex" aria-label="Main">
          {NAV.slice(1).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive(path, n.href)
                  ? "bg-primary/30 text-white"
                  : "text-muted-foreground hover:bg-white/10 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <SoundToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
