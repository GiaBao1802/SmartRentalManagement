# Cloudy chat frontend handoff

Status: CURRENT — development local AI with guest confirmation before retrieval. Updated: 2026-10-28.

Guest requests now prepare a filter summary first; only the explicit confirm button retrieves rooms. Editing invalidates proposals. The service exposes `hasProposal`, `discardProposal`, and `confirm` alongside `send`; accepted context updates only after confirmation.

The user's requested local integration now uses `createLocalCloudyChatService` and `POST /api/cloudy/chat` with Qwen3 1.7B and 300 synthetic rooms. Raw history remains UI memory only; requests now send a mode plus validated filter context for continuation. The optional fourth `send` argument selects new/continue; `hasContext()` controls continuation availability. Production stays disabled. See the [integration report](CLOUDY_LOCAL_AI_INTEGRATION_REPORT.md) and [runbook](../../../scripts/cloudy-ai/README.md). Session keys now explicitly include auth status and role as well as route group/account; a public same-account role change also resets chat. Session-key/service tests cover the transitions; authenticated UI remains unverified. mock behavior and original verification below are historical evidence for 2026-10-26, not the current development adapter.

## Original mock scope and evidence — historical, 2026-10-26

The shared Cloudy 2D component keeps chat history only in React memory for the current Public, Admin, or Resident session. Closing and reopening on the same route group preserves it. Leaving the allowed route group, logging out, or changing account/role remounts a fresh chat session; pending work is aborted. The development UI supports text entry, a mock response, a deterministic `/mock-error` first-attempt failure for retry checks, and a 500-character limit. Production displays “Cloudy đang được hoàn thiện” and disables sending. No chat API, AI provider, storage, or database call was added.

Frontend type boundary: `frontend/src/app/components/cloudy-chat-service.ts` exports `CloudyChatMessage` (`id`, `role: "user" | "cloudy"`, `text`, `createdAt`) and `CloudyChatService.send(message, history, signal): Promise<string>`. `history` contains earlier turns and excludes the current user message. The `AbortSignal` must be honored by a future adapter. This is a frontend proposal, not an approved endpoint or API contract. A future integration must agree on authorization, scoping, errors, rate limits, retention, and response shape before replacing the mock. Untrusted replies remain plain text in React.

Checks: frontend typecheck, production build, and focused service/suggestion tests passed. Browser on Public landing confirmed immediate user messages, pending state, mock reply, failure/retry, close/reopen memory, Enter/Shift+Enter, and mobile layout. Authenticated Admin/Resident and physical mobile keyboard remain to verify with an allowed session/device.
