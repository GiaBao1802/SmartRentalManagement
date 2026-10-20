# Auth browser checks

These are actual DOM/browser checks for Codex's documented CUA `Tab.playwright` interface, not HTML-source assertions. No Playwright dependency was added to the application. They are **not an unattended CI suite**.

## Prerequisites

- A dedicated PostgreSQL 18.6 cluster on `127.0.0.1:55450`, role `v18_smoke`, database `goctro_enrollment_20261018`, installed from the approved V1.8 baseline (40 public tables). Never use the application's normal database URL.
- `NODE_ENV=test` and `GOCTRO_ENROLLMENT_TEST_DATABASE_URL` explicitly pointing at that disposable database.
- Start `backend/scripts/enrollment-dev-harness.ts` through `tsx`; it verifies database identity before creating synthetic fixtures and listens on 4002. Its terminal prints the synthetic Admin/Resident identifiers. The temporary Admin credential is defined only in the guarded test harness.
- Start a separate frontend source copy on 3002 with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4002/api/v1`; keep its Next output separate from any existing dev server. Do not copy real environment files.
- To resume an existing synthetic fixture after restarting the harness, optionally set `GOCTRO_ENROLLMENT_BROWSER_OWNER_ID` to the Owner ID printed by that harness. It checks the exact synthetic fixture identity; it does not restore RAM token/session state or overwrite passwords.

## Execution

Import `auth-browser-checks.mjs` in CUA, use the current browser, then invoke the exported checks against the actual app tab. Keep links, passwords and session cookies only in transient runtime variables. Persist only the returned sanitized records. Set and verify each requested viewport before capturing screenshots; wait for the Admin sidebar transition to settle.

1. Log in through the UI as the synthetic Admin; open `/admin/accounts`, choose its synthetic Resident and send an invitation. Observe the explicit DEV delivery notice.
2. Log out. Retrieve the invitation with the harness terminal command `invitation`; open it in a fresh unauthenticated tab. Run `linkState(tab, 'ready')`, `emptyPasswordValidation`, `visibilityAndKeyboard`, and `layout`.
3. **Human handoff:** the human types, confirms and submits the new password. Do not automate entering or submitting new credentials. Run `completed(tab, 'invitation')` after observing success. Harness `status` must show accepted invitation and one active Resident account. Log in using that newly established credential; verify `/tenant`, actual rental/profile data and denial of `/admin/accounts`.
4. Establish an additional pre-reset test session in memory. Log out in the browser; request reset via `/forgot-password`. Retrieve `reset` only through the harness terminal. Open the link and check `ready`.
5. **Human handoff:** enter and submit a different new password. Run `completed(tab, 'reset')`; verify persisted password through the project's verifier without printing a hash. Old login must fail, new login must reach `/tenant`, and the pre-reset session must return 401. Reopen the same link: `invalid`.
6. Check missing fragments and malformed/unknown tokens. On the **same document**, navigate from a missing-token route to one with a fresh token fragment; it must re-inspect and remove the fragment. Do not serialize the URL.
7. Harness `expired-invitation` / `expired-reset` create deliberately expired synthetic links; check `invalid`. Run `expired-reset` when no live reset is outstanding, because normal retries preserve the existing live token.
8. Harness `fault-inspect-on` makes inspection return 503. Check `unavailable`; turn it off, click the UI retry button and check `ready`. Fault injection exists only in the guarded harness.
9. `unknownForgot(tab)` checks an unknown synthetic identifier gets the neutral public message. Check 1440, 768 and 390px layouts, labels, 16px inputs, keyboard controls, and screenshots containing no entered credentials or token fragments.
10. A mismatch and repeated-click test involving submission of **new passwords** also requires human operation. Report those cases as NOT RUN if their intermediate UI states were not observed, even if the human reports success.

Restarting the backend loses RAM token/replay/session material. Confirm fail-closed behavior and retained database invitation history; do not silently reissue or consume links. Stop only the owned rehearsal processes and remove the explicitly disposable database after verification. Never run this workflow against `Goctro_test3`.

See `docs/07_modules/auth/AUTH_BROWSER_UI_VERIFICATION.md` for executed results and limits.
