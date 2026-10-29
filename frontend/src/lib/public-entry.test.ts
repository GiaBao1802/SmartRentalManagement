import assert from "node:assert/strict";
import test from "node:test";
import { firstEntryDestination, PUBLIC_ENTRY_INTRO_KEY, type EntryStorage } from "./public-entry";

function memoryStorage(): EntryStorage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("first root visit shows the existing intro once per browser tab", () => {
  const storage = memoryStorage();
  assert.equal(firstEntryDestination(storage), "intro");
  assert.equal(storage.getItem(PUBLIC_ENTRY_INTRO_KEY), "1");
  assert.equal(firstEntryDestination(storage), "rooms");
});

test("a previously seen intro goes straight to the room search", () => {
  const storage = memoryStorage();
  storage.setItem(PUBLIC_ENTRY_INTRO_KEY, "1");
  assert.equal(firstEntryDestination(storage), "rooms");
});

test("unavailable session storage safely skips the intro", () => {
  const storage: EntryStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.equal(firstEntryDestination(storage), "rooms");
});
