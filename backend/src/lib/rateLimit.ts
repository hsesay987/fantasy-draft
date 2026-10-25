import type { NextFunction, Request, Response } from "express";

/** Sliding-window limiter kept in memory (one API machine). Keyed by client IP unless `key` says otherwise. */
export function rateLimit(opts: { max: number; windowMs?: number; key?: (req: Request) => string }) {
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      lastSweep = now;
      for (const [k, v] of hits) if (v[v.length - 1] <= now - windowMs) hits.delete(k);
    }
    const key = opts.key ? opts.key(req) : req.ip ?? "anon";
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= opts.max) {
      res.setHeader("Retry-After", Math.ceil((recent[0] + windowMs - now) / 1000));
      return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
