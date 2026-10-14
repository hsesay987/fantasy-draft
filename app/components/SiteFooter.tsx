const CREDITS: { href: string; title: string; label: string }[] = [
  { href: "https://www.flaticon.com/free-icons/dragon-ball", title: "dragon ball icons", label: "Dragon ball icons created by pocike" },
  { href: "https://www.flaticon.com/free-icons/history", title: "history icons", label: "History icons created by Eucalyp" },
  { href: "https://www.flaticon.com/free-icons/comic", title: "comic icons", label: "Comic icons created by Darius Dan" },
  { href: "https://www.flaticon.com/free-icons/basketball", title: "basketball icons", label: "Basketball icons created by ranksol graphics" },
  { href: "https://www.flaticon.com/free-icons/nfl", title: "nfl icons", label: "Nfl icons created by graphicmall" },
  { href: "https://www.flaticon.com/free-icons/war", title: "war icons", label: "War icons created by Good Ware" },
  { href: "https://www.flaticon.com/free-icons/mickey-mouse", title: "mickey mouse icons", label: "Mickey mouse icons created by icon_small" },
  { href: "https://www.flaticon.com/free-icons/pokemon", title: "pokemon icons", label: "Pokemon icons created by Darius Dan" },
  { href: "https://www.flaticon.com/free-icons/cartoon", title: "cartoon icons", label: "Cartoon icons created by surang" },
  { href: "https://www.flaticon.com/free-icons/mystery", title: "mystery icons", label: "Mystery icons created by Smashicons" },
];

/** Icon attributions (required by the Flaticon free licence) plus data/image sources. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 px-4 pb-24 pt-6 text-xs text-muted-foreground md:px-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-2">
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground/80">Icons</span>
          {CREDITS.map((c) => (
            <a key={c.href} href={c.href} title={c.title} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-white">
              {c.label} - Flaticon
            </a>
          ))}
        </p>
        <p>Character pictures and stats come from public community sources (PokeAPI, AniList, Superhero API, Wikipedia). TopPic is an unofficial fan project; characters belong to their owners.</p>
      </div>
    </footer>
  );
}
