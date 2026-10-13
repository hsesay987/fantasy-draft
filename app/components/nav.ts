import { Gamepad2, Layers, PartyPopper, Globe } from "lucide-react";

export const NAV = [
  { href: "/", label: "Home", icon: Gamepad2 },
  { href: "/draft", label: "Drafts", icon: Layers },
  { href: "/toppic", label: "Party", icon: PartyPopper },
  { href: "/online", label: "Online", icon: Globe },
] as const;
