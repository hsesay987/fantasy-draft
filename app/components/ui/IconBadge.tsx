import type { ComponentType } from "react";

/** App-icon style badge: flat image icons sit on a light tile so black line art reads on the dark theme. */
export function IconBadge({ src, icon: Icon, size = 56, className = "" }: { src?: string; icon?: ComponentType<{ className?: string }>; size?: number; className?: string }) {
  if (src) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-2xl bg-white/95 shadow-[0_6px_18px_-8px_rgba(0,0,0,.6)] ${className}`} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={size - 14} height={size - 14} className="object-contain" style={{ width: size - 14, height: size - 14 }} draggable={false} />
      </span>
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-black/30 ${className}`} style={{ width: size, height: size }}>
      {Icon && <Icon className="h-8 w-8 text-secondary" />}
    </span>
  );
}
