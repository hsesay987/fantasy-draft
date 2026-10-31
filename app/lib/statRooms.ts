// NBA, NFL and Cartoon stat draft rooms live on the account-based /rooms API (unlike TopPic rooms, which need no account).
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type League = "NBA" | "NFL" | "CARTOON";
export const STAT_LEAGUES: { league: League; title: string; blurb: string; iconSrc: string; premium: boolean }[] = [
  { league: "NBA", title: "NBA stat draft", blurb: "Real career stats by era and team. Needs a login.", iconSrc: "/icons/basketball.png", premium: false },
  { league: "NFL", title: "NFL stat draft", blurb: "Gridiron greats by position. Needs a premium plan.", iconSrc: "/icons/football.png", premium: true },
  { league: "CARTOON", title: "Cartoon stat draft", blurb: "Shows and characters, scored by the community. Needs a premium plan.", iconSrc: "/icons/turtle.png", premium: true },
];

/** Opens a stat draft room for the logged-in user and returns its code. */
export async function openStatRoom(league: League, token: string): Promise<{ code: string } | { error: string }> {
  try {
    const res = await fetch(`${API_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        gameType: "DRAFT", isPublic: false, name: `Online ${league} Draft`, league,
        settings: league === "CARTOON" ? { cartoonDraftType: "character", cartoonMode: "classic", pickTimerSeconds: 60 } : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Couldn't open the room" };
    try {
      localStorage.setItem("activeRoomCode", data.code);
      localStorage.removeItem("activeRoomDraftId");
    } catch {
      /* storage unavailable */
    }
    return { code: data.code };
  } catch {
    return { error: "Can't reach the game server" };
  }
}

export const statRoomHref = (code: string, league: League) => `/online/room/${code}?league=${league}`;
