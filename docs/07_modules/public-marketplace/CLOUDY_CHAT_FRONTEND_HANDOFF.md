# Cloudy chat frontend handoff

Status: CURRENT — development UI mock only. Date: 2026-10-26.

## Scope and evidence

The shared Cloudy 2D component keeps chat history only in React memory for the current Public, Admin, or Resident session. Closing and reopening on the same route group preserves it. Leaving the allowed route group, logging out, or changing account/role remounts a fresh chat session; pending work is aborted. The development UI supports text entry, a mock response, a deterministic `/mock-error` first-attempt failure for retry checks, and a 500-character limit. Production displays “Cloudy đang được hoàn thiện” and disables sending. No chat API, AI provider, storage, or database call was added.

Frontend type boundary: `frontend/src/app/components/cloudy-chat-service.ts` exports `CloudyChatMessage` (`id`, `role: "user" | "cloudy"`, `text`, `createdAt`) and `CloudyChatService.send(message, history, signal): Promise<string>`. `history` contains earlier turns and excludes the current user message. The `AbortSignal` must be honored by a future adapter. This is a frontend proposal, not an approved endpoint or API contract. A future integration must agree on authorization, scoping, errors, rate limits, retention, and response shape before replacing the mock. Untrusted replies remain plain text in React.

Checks: frontend typecheck, production build, and focused service/suggestion tests passed. Browser on Public landing confirmed immediate user messages, pending state, mock reply, failure/retry, close/reopen memory, Enter/Shift+Enter, and mobile layout. Authenticated Admin/Resident and physical mobile keyboard remain to verify with an allowed session/device.
