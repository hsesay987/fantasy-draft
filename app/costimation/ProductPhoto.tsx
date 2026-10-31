"use client";

import { useEffect, useState } from "react";
import { Sprite } from "../components/pixel/Sprite";
import { productIcon } from "../components/pixel/sprites";
import type { Product } from "./game";

const KIND_COLORS: Record<string, [string, string]> = { drink: ["#ffffff", "#4cc9f0"], snack: ["#ffffff", "#ff4d6d"], can: ["#ffffff", "#ffd23f"], box: ["#ffffff", "#3ddc97"] };

/**
 * The real product photo, shown as it is. `blur` (in pixels) hides it for the foggy-photo power-up and drops to 0 as hints are used.
 * Without a photo, or if it fails to load, a pixel icon for the kind of product is shown instead.
 */
export function ProductPhoto({ product, blur }: { product: Product; blur: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.imageUrl]);
  const [a, b] = KIND_COLORS[product.kind ?? "box"]!;
  const showPhoto = !!product.imageUrl && !failed;
  return (
    <div className="grid h-[200px] place-items-center overflow-hidden bg-[var(--px-ink)]">
      {showPhoto ? (
        <div className="grid h-full w-full place-items-center bg-white p-2">
          {/* Open Food Facts photos come from many hosts and sizes, so a plain img is used instead of next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={blur > 0 ? "Blurred product photo" : `Photo of ${product.name}`} referrerPolicy="no-referrer" onError={() => setFailed(true)}
            className="max-h-full max-w-full object-contain transition-[filter] duration-700" style={{ filter: blur > 0 ? `blur(${blur}px)` : "none" }} />
        </div>
      ) : (
        <Sprite sprite={productIcon(product.kind ?? "box", a, b)} size={128} label={`${product.kind ?? "product"} icon`} />
      )}
    </div>
  );
}
