import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicAccountLinksView } from "./public-account-links";
import type { AuthUser } from "../../lib/api/authApi";

test("public header shows authenticated profile names for both roles and hides both login links", () => {
  const users: AuthUser[] = [
    { account: { account_id: "1", role: "admin", email: null, phone: null, status: "active" }, profile: { owner_id: "1", display_name: "Chủ trọ A & B" } },
    { account: { account_id: "2", role: "resident", email: null, phone: null, status: "active" }, profile: { resident_id: "2", full_name: "Nguyễn Cư Dân" } },
    { account: { account_id: "3", role: "superadmin", email: null, phone: null, status: "active" }, profile: { display_name: "Superadmin" } },
  ];
  for (const user of users) {
    const html = renderToStaticMarkup(<PublicAccountLinksView status="authenticated" user={user} />);
    assert.doesNotMatch(html, /Đăng nhập|href="\/login/);
    assert.match(html, user.account.role === "admin" ? /Chủ trọ A &amp; B/ : user.account.role === "resident" ? /Nguyễn Cư Dân/ : /Superadmin/);
    assert.ok(html.includes(`href="${user.account.role === "admin" ? "/admin/properties" : user.account.role === "resident" ? "/tenant" : "/platform"}"`));
  }
});

test("anonymous links return to the filtered explorer; pending session does not flash login controls", () => {
  const html = renderToStaticMarkup(<PublicAccountLinksView status="unauthenticated" user={null} returnTo="/tim-phong?price_max=1999999" />);
  assert.match(html, /Đăng nhập cư dân/);
  assert.match(html, /Đăng nhập admin/);
  assert.equal((html.match(/next=%2Ftim-phong%3Fprice_max%3D1999999/g) || []).length, 2);
  const pending = renderToStaticMarkup(<PublicAccountLinksView status="loading" user={null} />);
  assert.doesNotMatch(pending, /Đăng nhập|href=/);
  assert.match(pending, /Đang kiểm tra tài khoản/);
});
