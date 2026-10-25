"use client";

import { useEffect, useRef, useState } from "react";
import { Sprite } from "../components/pixel/Sprite";
import { productIcon } from "../components/pixel/sprites";
import type { Product } from "./game";

const KIND_COLORS: Record<string, [string, string]> = { drink: ["#ffffff", "#4cc9f0"], snack: ["#ffffff", "#ff4d6d"], can: ["#ffffff", "#ffd23f"], box: ["#ffffff", "#3ddc97"] };

/**
 * The product photo, shown as pixel art: the picture is shrunk to `res` x `res` blocks and scaled back up.
 * A low `res` hides the product; hints raise it. Without a photo (or if it fails to load) a pixel icon is drawn instead.
 */
export function ProductPhoto({ product, res }: { product: Product; res: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setImg(null);
    if (!product.imageUrl) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => setImg(im);
    im.src = product.imageUrl;
    return () => { im.onload = null; };
  }, [product.imageUrl]);

  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx || !img) return;
    c.width = res; c.height = res;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, res, res);
    const scale = Math.min(res / img.width, res / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (res - w) / 2, (res - h) / 2, w, h);
    // Cap the palette a little so it reads as pixel art rather than a blurry photo.
    const data = ctx.getImageData(0, 0, res, res), d = data.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = Math.round(d[i]! / 32) * 32; d[i + 1] = Math.round(d[i + 1]! / 32) * 32; d[i + 2] = Math.round(d[i + 2]! / 32) * 32; }
    ctx.putImageData(data, 0, 0);
  }, [img, res]);

  const [a, b] = KIND_COLORS[product.kind ?? "box"]!;
  return (
    <div className="grid h-[170px] place-items-center bg-[var(--px-ink)]">
      {img
        ? <canvas ref={ref} className="h-[150px] w-[150px]" role="img" aria-label={res < 24 ? "Blurred product photo" : `Photo of ${product.name}`} />
        : <Sprite sprite={productIcon(product.kind ?? "box", a, b)} size={128} label={`${product.kind ?? "product"} icon`} />}
    </div>
  );
}
