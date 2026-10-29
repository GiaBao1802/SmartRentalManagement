export const PUBLIC_ENTRY_INTRO_KEY = "goctro-public-entry-intro-seen";

export type EntryStorage = Pick<Storage, "getItem" | "setItem">;

export function firstEntryDestination(storage: EntryStorage): "intro" | "rooms" {
  try {
    if (storage.getItem(PUBLIC_ENTRY_INTRO_KEY) === "1") return "rooms";
    storage.setItem(PUBLIC_ENTRY_INTRO_KEY, "1");
    return "intro";
  } catch {
    return "rooms";
  }
}
