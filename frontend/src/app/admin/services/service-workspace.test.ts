import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV_GROUPS } from "../../components/admin-navigation";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DeferredFeatureScreen, { DEFERRED_FEATURES } from "../../components/deferred-feature-screen";
import { SERVICE_WORKSPACE_SECTIONS } from "./service-workspace";

test("Admin sidebar exposes one entry for the Service module and hides legacy bookings", () => {
  const group = ADMIN_NAV_GROUPS.find((item) => item.label === "Dịch vụ & Hỗ trợ");
  assert.deepEqual(group?.items.map((item) => [item.href, item.label]), [["/admin/services", "Dịch vụ & Tiện ích"]]);
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
    ["fixed", "Dịch vụ cố định"],
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

test("primary Admin navigation hides deferred feature entries while their lock screens remain", () => {
  const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items);
  assert.deepEqual(items.filter((item) => ["/admin/viewings", "/admin/complaints"].includes(item.href)), []);
});

test("Lịch tiện ích and Khiếu nại render deferred screens without workflow actions or API references", () => {
  const calendar = renderToStaticMarkup(React.createElement(DeferredFeatureScreen, DEFERRED_FEATURES.amenityCalendar));
  assert.match(calendar, /Lịch tiện ích/);
  assert.match(calendar, /Phiên bản sau/);
  assert.match(calendar, /Spa, Room Care/);
  assert.match(calendar, /href="\/admin\/services\/utilities"/);
  assert.doesNotMatch(calendar, /api\/viewing-requests|Lịch xem phòng/);

  const complaints = renderToStaticMarkup(React.createElement(DeferredFeatureScreen, DEFERRED_FEATURES.complaints));
  assert.match(complaints, /Chức năng Khiếu nại sẽ được hoàn thiện trong phiên bản tiếp theo/);
  assert.match(complaints, /trạng thái và lịch sử khiếu nại chưa được mở/);
  assert.match(complaints, /Phiên bản sau/);
  assert.doesNotMatch(complaints, /api\/maintenance-requests|Xử lý khiếu nại/);
});
