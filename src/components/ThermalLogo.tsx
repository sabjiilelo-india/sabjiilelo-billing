"use client";

import { useEffect, useRef, useState } from "react";

/** Dots per millimetre of a 203 DPI thermal head (e.g. DCode DC3R1 / POS-80C). */
const DOTS_PER_MM = 8;
/** Pixels darker than this print black. Mid-tones such as lime green must land on the black side. */
const THRESHOLD = 190;
/** Cap for the analysis pass so huge uploads stay fast. */
const MAX_ANALYSIS_PX = 1200;

function isInk(px: Uint8ClampedArray, i: number) {
  if (px[i + 3] < 128) return false; // transparent counts as paper
  return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < THRESHOLD;
}

/** Bounding box of everything that will print black, so no blank margin is printed around the logo. */
function inkBounds(img: HTMLImageElement) {
  const scale = Math.min(1, MAX_ANALYSIS_PX / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isInk(px, (y * w + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  const k = 1 / scale;
  return {
    sx: Math.floor(minX * k),
    sy: Math.floor(minY * k),
    sw: Math.min(img.naturalWidth, Math.ceil((maxX - minX + 1) * k)),
    sh: Math.min(img.naturalHeight, Math.ceil((maxY - minY + 1) * k)),
  };
}

/**
 * Converts any logo into a crisp 1-bit (pure black/white) bitmap at the printer's native resolution,
 * trimmed to its ink so there is no empty space above or around it.
 * Thermal heads cannot print grey, so a colour logo scaled down by the browser prints as a muddy blob.
 */
export default function ThermalLogo({
  src, widthMm, onReady,
}: {
  src: string;
  widthMm: number;
  /** Called once with whether the logo could be prepared; false means the caller should fall back to text. */
  onReady?: (ok: boolean) => void;
}) {
  const [bitmap, setBitmap] = useState<string | null>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const { sx, sy, sw, sh } = inkBounds(img);
        const w = Math.round(widthMm * DOTS_PER_MM);
        const h = Math.max(1, Math.round((sh / sw) * w));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = "#fff"; // transparent areas must print white, not black
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const v = isInk(px, i) ? 0 : 255;
          px[i] = px[i + 1] = px[i + 2] = v;
          px[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        setBitmap(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) ready.current?.(false);
      }
    };
    img.onerror = () => !cancelled && ready.current?.(false);
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, widthMm]);

  useEffect(() => {
    if (bitmap) ready.current?.(true);
  }, [bitmap]);

  if (!bitmap) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={bitmap} alt="" className="thermal-logo mx-auto mb-1 block" style={{ width: `${widthMm}mm`, height: "auto" }} />
  );
}
