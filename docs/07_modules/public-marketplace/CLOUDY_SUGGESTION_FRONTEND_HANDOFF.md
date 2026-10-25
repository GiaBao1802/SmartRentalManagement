# Cloudy 2D proactive suggestion — frontend handoff

**Date:** 2026-10-25
**Status:** CURRENT — frontend handoff only; no backend/API connection.

## Source boundary

`frontend/src/app/components/cloudy-suggestion-source.ts` exports:

- `CloudySuggestion`: `{ id: string; text: string; expiresAt: string; scope: "public" | "admin" | "resident" }`.
- `CloudySuggestionContext`: `{ pathname, scope, accountId }`. `accountId` is only used in memory for context and is not stored with the suggestion.
- `CloudySuggestionSource`: a function accepting that context and returning a suggestion or `null`, synchronously or as a promise.
- `cloudySuggestionSource`: the current implementation. It returns `null` in production and makes no network request. Replace this implementation after a separate API contract is approved; do not assume an endpoint from this frontend type.

The frontend accepts only an unexpired suggestion matching the active route/role scope and an ID of at most 80 safe identifier characters. It collapses whitespace and limits text to 160 characters. React renders text, not HTML. After a 5-second period without page interaction, Cloudy shows one suggestion for up to 6 seconds; it dismisses on Cloudy hover/press/drag, Escape, tab hiding, route/auth context change or expiration. A shown ID is stored in `sessionStorage` to avoid repetition during the tab session. Suggestion text and account ID are not stored. If there is no safe place beside Cloudy, the suggestion is skipped.

## Development preview

Preview text is explicitly labeled **MÔ PHỎNG** and contains no invented counts. It exists only when `NODE_ENV=development`:

- Public landing: `/landing?cloudyPreview=public`.
- Public Explorer, which rewrites its URL: set `sessionStorage.setItem("cloudy-2d-preview-scope", "public")` in a development browser tab, then load `/`.
- Admin: set the same key to `"admin"`, then visit an Admin route while authenticated as Admin. The preview does not bypass auth or role gating.

Clear the flag with `sessionStorage.removeItem("cloudy-2d-preview-scope")`. To replay a previously shown preview in the same tab, remove `cloudy-2d-suggestions-seen`. These are development checks, not data from AI or a backend.

## Verification

Frontend typecheck, production build and source validation tests pass. Browser checks covered Public landing/Explorer at desktop and 390px mobile, an Admin preview with a browser-mocked auth response, route/login gating, ID deduplication, a 320px edge placement and a viewport too small for a bubble. No real Admin/Resident credential or backend suggestion endpoint was used. Actual operating-system tab backgrounding remains unverified in the headless browser; the component clears timers and hides on `visibilitychange` when `document.hidden` is true.
