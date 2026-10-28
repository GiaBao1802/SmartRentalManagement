import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { ADMIN_NAV_GROUPS } from "../../components/admin-navigation";
import { SERVICE_WORKSPACE_SECTIONS } from "./service-workspace";

test("Service entry still redirects to utilities after overview removal", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /redirect\("\/admin\/services\/utilities"\)/);
  assert.doesNotMatch(page, /service-overview/);
});

test("Admin sidebar exposes one entry for the Service module and hides legacy bookings", () => {
  const group = ADMIN_NAV_GROUPS.find((item) => item.label === "Dịch vụ & Hỗ trợ");
  assert.deepEqual(group?.items.map((item) => [item.href, item.label]), [
    ["/admin/requests", "Yêu cầu & Khiếu nại"],
    ["/admin/services", "Dịch vụ & Tiện ích"],
  ]);
  const allRoutes = ADMIN_NAV_GROUPS.flatMap((item) => item.items.map((nav) => nav.href));
  assert.equal(allRoutes.includes("/admin/services/utilities"), false);
  assert.equal(allRoutes.includes("/admin/services/fixed"), false);
  assert.equal(allRoutes.includes("/admin/services/flexible"), false);
  assert.equal(allRoutes.includes("/admin/services/charges"), false);
  assert.equal(allRoutes.includes("/admin/amenities"), false);
  assert.equal(allRoutes.includes("/admin/bookings"), false);
});

test("Service workspace gives direct access to all approved sections with business labels", () => {
  assert.deepEqual(SERVICE_WORKSPACE_SECTIONS.map(({ key, label }) => [key, label]), [
    ["utilities", "Điện & nước"],
    ["fixed", "Tiện ích cố định"],
    ["flexible", "Tiện ích phát sinh"],
    ["parking", "Parking"],
  ]);
  assert.deepEqual(SERVICE_WORKSPACE_SECTIONS.map(({ href }) => href), [
    "/admin/services/utilities",
    "/admin/services/fixed",
    "/admin/services/flexible",
    "/admin/services/parking",
  ]);
  const labels: string[] = SERVICE_WORKSPACE_SECTIONS.map((item) => item.label);
  assert.equal(labels.some((label) => label === "Phát sinh dịch vụ" || label === "Danh mục dịch vụ phát sinh"), false);
});

test("primary Admin navigation hides deferred feature entries after their unused routes are removed", () => {
  const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items);
  assert.deepEqual(items.filter((item) => ["/admin/viewings", "/admin/complaints"].includes(item.href)), []);
});

test("out-of-flow pages are removed without adding navigation", () => {
  for (const route of ["amenities", "bookings", "complaints", "viewings", "services/charges"]) {
    assert.equal(existsSync(new URL(`../${route}/page.tsx`, import.meta.url)), false, route);
  }
});
