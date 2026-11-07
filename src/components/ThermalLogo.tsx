"use client";

import { useEffect, useState } from "react";

/** Dots per millimetre of a 203 DPI thermal head (e.g. DCode DC3R1 / POS-80C). */
const DOTS_PER_MM = 8;
/** Pixels darker than this print black. Mid-tones such as lime green must land on the black side. */
const THRESHOLD = 190;

/**
 * Converts any logo into a crisp 1-bit (pure black/white) bitmap at the printer's native resolution.
 * Thermal heads cannot print grey, so a colour logo scaled down by the browser prints as a muddy blob.
 */
export default function ThermalLogo({ src, widthMm, onReady }: { src: string; widthMm: number; onReady?: () => void }) {
  const [bitmap, setBitmap] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const done = () => !cancelled && onReady?.();
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const w = Math.round(widthMm * DOTS_PER_MM);
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = "#fff"; // transparent areas must print white, not black
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          const v = lum < THRESHOLD ? 0 : 255;
          px[i] = px[i + 1] = px[i + 2] = v;
          px[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        setBitmap(canvas.toDataURL("image/png"));
      } catch {
        setBitmap(src); // fall back to the original rather than losing the logo
      }
    };
    img.onerror = done;
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, widthMm, onReady]);

  useEffect(() => {
    if (bitmap) onReady?.();
  }, [bitmap, onReady]);

  if (!bitmap) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={bitmap} alt="" className="thermal-logo mx-auto mb-1 block" style={{ width: `${widthMm}mm`, height: "auto" }} />
  );
}
