type AuthStatus = "loading" | "authenticated" | "unauthenticated";

// React remounts the chat (including its private service/context) when this key changes.
// Do not include the exact path: navigation within one route group preserves the chat.
export function cloudyChatSessionKey(
  scope: "public" | "admin" | "resident" | null,
  status: AuthStatus,
  accountId: string | null,
  role: string | null | undefined,
): string {
  return JSON.stringify([
    scope,
    status,
    status === "authenticated" ? accountId : null,
    status === "authenticated" ? role ?? null : null,
  ]);
}
