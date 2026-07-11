import type { Entry, MapData } from "../../types/database";
import { CAT_COLOR } from "../../types/database";

// Lightweight, always-live SVG preview of a location's structured map — used as the
// card/hero thumbnail fallback so a map built in the editor is actually visible
// without needing a separate rasterization/export step. Renders layers in their
// actual stacking order (bottom = first in the array).
export function MapThumbnail({ map, entries }: { map: MapData; entries: Entry[] }) {
  return (
    <svg
      viewBox={`0 0 ${map.width} ${map.height}`}
      preserveAspectRatio="xMidYMid slice"
      className="w-full h-full"
      style={{ background: "var(--op-6)" }}
    >
      {map.layers.map((layer) => {
        if (!layer.visible) return null;

        if (layer.kind === "tile") {
          return (
            <g key={layer.id} opacity={layer.opacity}>
              {Object.entries(layer.cells).map(([key, val]) => {
                const [x, y] = key.split(":").map(Number);
                return <rect key={key} x={x} y={y} width={1} height={1} fill={val.color} />;
              })}
            </g>
          );
        }

        if (layer.kind === "freehand") {
          return layer.bitmap ? (
            <image key={layer.id} href={layer.bitmap} x={0} y={0} width={map.width} height={map.height} opacity={layer.opacity} preserveAspectRatio="none" />
          ) : null;
        }

        if (layer.kind === "zone") {
          return (
            <g key={layer.id} opacity={layer.opacity}>
              {layer.zones.map((z) => (
                <rect
                  key={z.id}
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  fill={z.color}
                  opacity={0.18}
                  stroke={z.color}
                  strokeWidth={0.06}
                  strokeDasharray="0.2,0.15"
                />
              ))}
            </g>
          );
        }

        if (layer.kind === "image") {
          return (
            <g key={layer.id} opacity={layer.opacity}>
              {layer.images.map((im) => (
                <image key={im.id} href={im.src} x={im.x} y={im.y} width={im.w} height={im.h} preserveAspectRatio="xMidYMid meet" />
              ))}
            </g>
          );
        }

        if (layer.kind === "object") {
          return (
            <g key={layer.id} opacity={layer.opacity}>
              {layer.objects.map((o) => {
                const linked = entries.find((e) => e.id === o.entryId);
                const color = linked ? CAT_COLOR[linked.category] : "#999";
                return (
                  <circle
                    key={o.id}
                    cx={o.x + 0.5}
                    cy={o.y + 0.5}
                    r={0.32}
                    fill={color}
                    stroke="#000"
                    strokeOpacity={0.35}
                    strokeWidth={0.05}
                  />
                );
              })}
            </g>
          );
        }

        return null;
      })}
    </svg>
  );
}

export function mapHasContent(map: MapData | undefined): boolean {
  if (!map) return false;
  return map.layers.some((l) => {
    if (l.kind === "tile") return Object.keys(l.cells).length > 0;
    if (l.kind === "object") return l.objects.length > 0;
    if (l.kind === "zone") return l.zones.length > 0;
    if (l.kind === "freehand") return Boolean(l.bitmap);
    if (l.kind === "image") return l.images.length > 0;
    return false;
  });
}
