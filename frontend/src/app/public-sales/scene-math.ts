import type { Geography, GeoFeature } from "./explorer-data";

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export const project = (p: number[]) => [(p[0] - 109) * .95, p[1] - 15.5] as const;
function area(ring: number[][]) {
  return Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
}
/** Main polygon by area, not vertex density. Remote islands remain in the mesh. */
export function featureBounds(feature: GeoFeature, fullExtent = false): Bounds {
  const polygons = fullExtent ? feature.geometry.coordinates : [[...feature.geometry.coordinates].sort((a, b) => area(b[0]) - area(a[0]))[0]];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const rings of polygons) for (const p of rings[0]) {
    const [x, y] = project(p);
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}
export function countryBounds(geo: Geography, fullExtent: boolean): Bounds {
  const rows = geo.features.map(f => featureBounds(f, fullExtent));
  return { minX: Math.min(...rows.map(b => b.minX)), maxX: Math.max(...rows.map(b => b.maxX)), minY: Math.min(...rows.map(b => b.minY)), maxY: Math.max(...rows.map(b => b.maxY)) };
}
/** Orthographic fit at the canonical Z-up angle. Screen offsets reserve real DOM panel space. */
export function fitScene(bounds: Bounds, width: number, height: number, insets: Insets) {
  const left = Math.min(insets.left, width * .4), right = Math.min(insets.right, width * .4);
  const top = Math.min(insets.top, height * .35), bottom = Math.min(insets.bottom, height * .6);
  const safeWidth = Math.max(100, width - left - right), safeHeight = Math.max(100, height - top - bottom);
  const zoom = Math.max(8, Math.min(135, safeWidth / Math.max(.8, bounds.maxX - bounds.minX + .5), safeHeight / Math.max(.8, (bounds.maxY - bounds.minY) * .8 + .6)) * .88);
  const centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
  const targetX = centerX - (left - right) / (2 * zoom);
  const targetY = centerY - (bottom - top) / (2 * zoom * .8);
  return { zoom, targetX, targetY, safe: { left, right: width - right, top, bottom: height - bottom } };
}
export const DRAG_THRESHOLD = 6;
export function isSceneClick(distance: number, moved: boolean) { return !moved && distance <= DRAG_THRESHOLD; }
