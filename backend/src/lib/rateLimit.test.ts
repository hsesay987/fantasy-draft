import { describe, expect, it, vi } from "vitest";
import { rateLimit } from "./rateLimit";

const run = (mw: ReturnType<typeof rateLimit>, ip: string) => {
  const res: any = { statusCode: 200, headers: {}, setHeader(k: string, v: unknown) { this.headers[k] = v; }, status(c: number) { this.statusCode = c; return this; }, json() { return this; } };
  const next = vi.fn();
  mw({ ip } as any, res, next);
  return { res, next };
};

describe("rateLimit", () => {
  it("blocks after max hits per key and sets Retry-After", () => {
    const mw = rateLimit({ max: 2 });
    expect(run(mw, "a").next).toHaveBeenCalled();
    expect(run(mw, "a").next).toHaveBeenCalled();
    const third = run(mw, "a");
    expect(third.next).not.toHaveBeenCalled();
    expect(third.res.statusCode).toBe(429);
    expect(third.res.headers["Retry-After"]).toBeGreaterThan(0);
  });
  it("counts keys separately and frees them after the window", () => {
    vi.useFakeTimers();
    const mw = rateLimit({ max: 1, windowMs: 1000 });
    run(mw, "a");
    expect(run(mw, "b").next).toHaveBeenCalled();
    expect(run(mw, "a").res.statusCode).toBe(429);
    vi.advanceTimersByTime(1001);
    expect(run(mw, "a").next).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
