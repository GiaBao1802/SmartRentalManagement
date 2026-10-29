"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import { displayName, type AuthUser } from "../../lib/api/authApi";
import { PUBLIC_HOME, publicHomeHref } from "../../lib/public-navigation";

type Props = { returnTo?: string; className?: string };
type Session = { status: "loading" | "authenticated" | "unauthenticated"; user: AuthUser | null };

export function PublicAccountLinksView({ status, user, returnTo = PUBLIC_HOME, className = "" }: Props & Session) {
  const loginHref = `/login?next=${encodeURIComponent(publicHomeHref(returnTo))}`;
  return <div className={`public-account-links ${className}`}>
    {status === "loading" ? <span className="public-account-loading" role="status">Đang kiểm tra tài khoản…</span> : status === "authenticated" && user ? <Link
      className="public-account-identity"
      href={user.account.role === "admin" ? "/admin/properties" : user.account.role === "resident" ? "/tenant" : "/platform"}
      title={`Mở tài khoản ${displayName(user)}`}
    ><span className="public-account-avatar" aria-hidden="true">{displayName(user).trim().charAt(0).toLocaleUpperCase("vi-VN")}</span><span className="public-account-name"><strong>{displayName(user)}</strong><small>{user.account.role === "admin" ? "Tài khoản chủ trọ" : user.account.role === "resident" ? "Tài khoản cư dân" : "Quản trị nền tảng"}</small></span></Link> : <>
      <Link className="public-account-login" href={loginHref}>Đăng nhập cư dân</Link>
      <Link className="public-account-login public-account-login-primary" href={loginHref}>Đăng nhập admin</Link>
    </>}
  </div>;
}

export default function PublicAccountLinks(props: Props) {
  const { status, user } = useAuth();
  return <PublicAccountLinksView {...props} status={status} user={user} />;
}
