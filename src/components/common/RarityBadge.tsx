import { useEffect, useRef, useState } from "react";
import type { RarityObject } from "../../types/database";
import { rarityColorAt, rarityIsAnimated } from "../../lib/rarityColor";

// A handful of small dots drifting upward and fading out around the badge — reserved for
// animated (pulse/gradient_anim/rainbow) rarities only, see rarityIsAnimated()'s comment for
// why that's the "is this actually a fancy rarity" signal instead of a hardcoded id list.
// Positions/delays are derived from the rarity's own id so they're stable across re-renders
// instead of jumping around every time.
function RarityParticles({ seed, color }: { seed: string; color: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const particles = Array.from({ length: 5 }, (_, i) => {
    const s = (h >>> (i * 3)) % 100;
    return {
      left: 6 + ((h + i * 37) % 88),
      delay: (s / 100) * 2,
      dur: 1.8 + (s % 5) * 0.25,
    };
  });
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={{
            left: `${p.left}%`,
            width: 3,
            height: 3,
            background: color,
            boxShadow: `0 0 4px ${color}`,
            animation: `rarity-particle-float ${p.dur}s ease-in ${p.delay}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

export function RarityBadge({ rarity, showParticles = false }: { rarity: RarityObject; showParticles?: boolean }) {
  const animated = rarityIsAnimated(rarity.style.kind);
  const [color, setColor] = useState(() => rarityColorAt(rarity.style, 0));
  const rafRef = useRef(0);

  useEffect(() => {
    if (!animated) {
      setColor(rarityColorAt(rarity.style, 0));
      return;
    }
    const start = performance.now();
    const tick = () => {
      setColor(rarityColorAt(rarity.style, (performance.now() - start) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, rarity.style.kind, rarity.style.c1, rarity.style.c2, rarity.style.speed]);

  return (
    <span className="relative inline-block">
      {showParticles && animated && <RarityParticles seed={rarity.id} color={color} />}
      <span
        className="relative text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border"
        style={{ color, borderColor: color, transition: animated ? undefined : "color 0.25s ease, border-color 0.25s ease" }}
      >
        {rarity.name}
      </span>
    </span>
  );
}
