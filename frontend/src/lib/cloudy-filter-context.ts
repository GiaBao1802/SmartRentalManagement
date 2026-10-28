export type FilterMode = "new" | "continue";
export type FilterContext = {
  price: { op: string; value: number }[];
  area: { op: string; value: number }[];
  location: string | null;
  occupants: number | null;
  amenities: string[];
};
export function isFilterContext(value: unknown): value is FilterContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const f = value as FilterContext;
  if (Object.keys(f).sort().join() !== "amenities,area,location,occupants,price") return false;
  for (const terms of [f.price, f.area]) {
    if (!Array.isArray(terms) || terms.length > 4 || terms.some(c => !c || typeof c !== "object" || Object.keys(c).sort().join() !== "op,value" || !["lt","lte","gt","gte","eq"].includes(c.op) || typeof c.value !== "number" || !Number.isFinite(c.value) || c.value <= 0 || c.value > 1e12)) return false;
  }
  return (f.location === null || (typeof f.location === "string" && f.location.trim().length > 0 && f.location.length <= 100))
    && (f.occupants === null || (Number.isInteger(f.occupants) && f.occupants >= 1 && f.occupants <= 100))
    && Array.isArray(f.amenities) && f.amenities.length <= 1 && f.amenities.every(x => x === "air_conditioning");
}
