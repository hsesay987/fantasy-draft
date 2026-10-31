import { Router } from "express";
import { captureError } from "../lib/monitoring";
import { pickProducts, prismaCostStore } from "../services/costimation.service";

const router = Router();

const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

const code = (v: unknown) => (typeof v === "string" && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : undefined);
const text = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 80 ? v : undefined);

/** Products for a game, optionally for one country and store. */
router.get("/products", async (req, res) => {
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  try {
    const products = await pickProducts(prismaCostStore, { country: code(req.query.country), store: text(req.query.store), n: Number(req.query.n) || 400 });
    res.json({ products });
  } catch (e) {
    captureError(e, { where: "costimation_products" });
    res.status(500).json({ error: "Couldn't load products" });
  }
});

export default router;
