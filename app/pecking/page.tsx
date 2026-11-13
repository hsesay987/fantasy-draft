"use client";

import Link from "next/link";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { PECKING_META } from "../topicDraft/pecking/meta";

/** Pecking Order's front door: pick a ranked list to play six questions on. */
export default function PeckingHub() {
  return (
    <PixelShell world="ladder">
      <div className="party-page pk-page">
        <Link href="/trivia" className="tr-back">&lt; All trivia</Link>
        <PixelBox className="grid gap-2">
          <p className="pk-list">Free play</p>
          <h1 className="m-0">Pecking Order</h1>
          <p className="m-0">Six questions on one ranked list. Place an item on the ladder, or name who sits at a rank. Closer scores more, up to 100 each.</p>
        </PixelBox>
        <ul className="pk-lists m-0 grid list-none gap-3 p-0">
          {PECKING_META.map((m) => (
            <li key={m.id}>
              <Link href={`/pecking/${m.id}`} className="no-underline">
                <PixelBox className="grid gap-1">
                  <h2 className="m-0">{m.title}</h2>
                  <p className="m-0">{m.stat} · {m.size.toLocaleString("en-US")} ranked</p>
                  <p className="px-note m-0">{m.source} · as of {m.asOf}</p>
                </PixelBox>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PixelShell>
  );
}
