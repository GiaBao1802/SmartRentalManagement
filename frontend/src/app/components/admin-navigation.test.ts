import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV_GROUPS } from "./admin-navigation";

const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

test("Admin sidebar keeps one Service entry and hides deferred screens", () => {
  assert.equal(items.filter((item) => item.href === "/admin/services").length, 1);
  assert.equal(items.some((item) => item.href === "/admin/viewings"), false);
  assert.equal(items.some((item) => item.href === "/admin/complaints"), false);
});

test("Admin navigation does not expose the removed Service overview route", () => {
  assert.equal(items.some((item) => item.href === "/admin/services/overview"), false);
  assert.equal(items.some((item) => item.label === "Tổng quan"), false);
});
