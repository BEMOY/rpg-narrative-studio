import { useEffect, useRef } from "react";
import type { SpriteStrip } from "../../types/database";

// Canvas-based looping animator for a single SpriteStrip (see the doc comment on SpriteStrip in
// types/database.ts for the "one horizontal row of frames" assumption). Shared by the
// character-sprite upload/config UI (a small looping preview to confirm the slicing looks
// right) and the Cutscene Timeline's live preview canvas (Dynarain Phase 2) -- same component,
// just a different size/context. Renders with imageRendering: "pixelated" and
// ctx.imageSmoothingEnabled = false throughout, since every asset in this project is pixel art.
export function SpriteAnimator({
  strip,
  playing = true,
  size = 64,
  className = "",
  speedMultiplier = 1,
}: {
  strip: SpriteStrip;
  playing?: boolean;
  size?: number;
  className?: string;
  speedMultiplier?: number; // scales strip.fps -- e.g. 0.5 plays at half speed, matching a clip's "Скорость" %
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef(0);
  const lastTsRef = useRef(0);

  // Reset to frame 0 and reload the <img> whenever the underlying image data changes (a new
  // upload) -- avoids showing a stale frame from the previous strip for a tick.
  useEffect(() => {
    frameRef.current = 0;
    lastTsRef.current = 0;
    const img = new Image();
    img.src = strip.image;
    imgRef.current = img;
  }, [strip.image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let alive = true;
    let raf = 0;

    const draw = (ts: number) => {
      if (!alive) return;
      const img = imgRef.current;
      const frameCount = Math.max(1, strip.frameCount);
      const fps = Math.max(0.01, strip.fps * speedMultiplier);
      if (playing) {
        if (lastTsRef.current === 0) lastTsRef.current = ts;
        const msPerFrame = 1000 / fps;
        if (ts - lastTsRef.current >= msPerFrame) {
          const steps = Math.floor((ts - lastTsRef.current) / msPerFrame);
          frameRef.current = (frameRef.current + steps) % frameCount;
          lastTsRef.current += steps * msPerFrame;
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img && img.complete && img.naturalWidth > 0) {
        const sx = Math.min(frameRef.current, frameCount - 1) * strip.frameWidth;
        ctx.drawImage(img, sx, 0, strip.frameWidth, strip.frameHeight, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [strip, playing, speedMultiplier]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}
