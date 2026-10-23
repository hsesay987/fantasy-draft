"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { applyAction, poolFor, type Action } from "../topicDraft/core";
import { API_URL, getRoom, loadToken, sendAction, type RoomSnapshot } from "./onlineApi";
import type { GameCtl } from "./useGame";
import { trackAction } from "./trackAction";

/** Live view of an online room: polls + socket pushes, with optimistic local moves. */
export function useRemoteRoom(code: string) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [offset, setOffset] = useState(0);
  const token = useRef<string | null>(null);
  const latest = useRef(0);
  const snapRef = useRef<RoomSnapshot | null>(null);
  snapRef.current = snap;

  const accept = useCallback((s: RoomSnapshot) => {
    if (s.version < latest.current) return; // stale response
    latest.current = s.version;
    setOffset(s.serverNow - Date.now());
    setSnap(s);
  }, []);

  const refresh = useCallback(async () => {
    token.current = loadToken(code);
    const r = await getRoom(code, token.current);
    if (r.status === 404) return setMissing(true);
    if (r.ok) accept(r.data as RoomSnapshot);
  }, [code, accept]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(refresh, 2000);
    let sock: Socket | null = null;
    try {
      sock = io(API_URL, { transports: ["websocket", "polling"] });
      sock.on("connect", () => sock?.emit("playroom:join", code));
      sock.on("playroom:update", () => void refresh());
    } catch {
      /* polling still works */
    }
    return () => {
      clearInterval(poll);
      sock?.disconnect();
    };
  }, [code, refresh]);

  const dispatchRemote = useCallback(
    (a: Action) => {
      const tk = token.current ?? loadToken(code);
      if (!tk) return;
      if (snapRef.current) trackAction(snapRef.current.setup, a, true);
      // Optimistic: apply locally right away, then take the server's answer.
      setSnap((cur) => (cur?.state && cur.setup ? { ...cur, state: applyAction(cur.setup, cur.state, a, Date.now() + offset) } : cur));
      void sendAction(code, tk, a).then((r) => {
        const s = (r.data as { snapshot?: RoomSnapshot }).snapshot;
        if (s) {
          accept(s);
        } else void refresh();
      });
    },
    [code, offset, accept, refresh]
  );

  return { snap, missing, offset, refresh, dispatchRemote, setToken: (t: string) => (token.current = t) };
}

export function useRemoteCtl(snap: RoomSnapshot, offset: number, dispatch: (a: Action) => void): GameCtl {
  const pool = useMemo(() => poolFor(snap.setup), [snap.setup]);
  const map = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  return {
    state: snap.state!,
    dispatch,
    me: snap.me,
    online: true,
    finish: () => {},
    offset,
    pool,
    byId: (id) => map.get(id),
    controls: (p) => !!p && p === snap.me,
    isAi: () => false,
  };
}
