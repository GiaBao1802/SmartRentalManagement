import assert from "node:assert/strict";
import { test } from "node:test";
import { cloudyChatSessionKey as key } from "./cloudy-chat-session-key";

test("account and role changes invalidate chat even on public pages", () => {
  const original = key("public", "authenticated", "A", "admin");
  assert.notEqual(original, key("public", "authenticated", "B", "admin"));
  assert.notEqual(original, key("public", "authenticated", "A", "resident"));
});

test("logout and session refresh invalidate authenticated chat", () => {
  for (const scope of ["public", "admin", "resident"] as const) {
    const original = key(scope, "authenticated", "A", "admin");
    assert.notEqual(original, key(scope, "unauthenticated", null, null));
    assert.notEqual(original, key(scope, "loading", "A", "admin"));
  }
  assert.notEqual(key("public", "loading", null, null), key("public", "unauthenticated", null, null));
});

test("route-group changes reset chat; unchanged identity keeps it", () => {
  const keys = ["public", "admin", "resident", null].map(scope => key(scope as "public" | "admin" | "resident" | null, "authenticated", "A", "admin"));
  assert.equal(new Set(keys).size, 4);
  assert.equal(key("admin", "authenticated", "A", "admin"), keys[1]);
  assert.equal(key("public", "unauthenticated", "stale", "admin"), key("public", "unauthenticated", null, null));
});
