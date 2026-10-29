import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_HOME, publicHomeHref, publicSearchReturnHref } from "./public-navigation";
import { loginTarget } from "./api/credentialView";

test("room and login return links preserve explorer filters on the public home", () => {
  const query = "?price_max=1999999&sort=price_asc&page=2";
  assert.equal(publicHomeHref(`/rooms${query}`), `${PUBLIC_HOME}${query}`);
  for (const role of ["admin", "resident"] as const) {
    assert.equal(loginTarget(role, `${PUBLIC_HOME}${query}`, "http://localhost:3000"), `${PUBLIC_HOME}${query}`);
  }
});

test("public return addresses reject external, intro, private and lookalike routes", () => {
  for (const target of [null, "/", "//foreign.invalid", "/\\foreign.invalid", "https://foreign.invalid", "/admin/accounts", "/rooms/1", "/tim-phong-other"]) {
    assert.equal(publicHomeHref(target), PUBLIC_HOME);
  }
  for (const target of ["/admin/accounts", "/tenant/../admin", "/tim-phong-other", "//foreign.invalid", "/\\foreign.invalid"]) {
    assert.equal(loginTarget("resident", target, "http://localhost:3000"), "/tenant");
  }
  assert.equal(loginTarget("resident", "/tenant", "http://localhost:3000"), "/tenant");
});

test("new full-list return route retains filters while home still goes to the map", () => {
  const target = "/tim-phong/danh-sach?amenities=air_conditioning&price_max=3000000";
  assert.equal(publicSearchReturnHref(target), target);
  assert.equal(publicHomeHref(target), "/tim-phong?amenities=air_conditioning&price_max=3000000");
  assert.equal(publicSearchReturnHref("/tim-phong/danh-sach-other"), PUBLIC_HOME);
  assert.equal(publicSearchReturnHref("//foreign.invalid"), PUBLIC_HOME);
  assert.equal(loginTarget("superadmin", "/tim-phong", "http://localhost:3000"), "/platform/cloudy");
  assert.equal(loginTarget("superadmin", "/platform/cloudy", "http://localhost:3000"), "/platform/cloudy");
});
