# Cloudy local AI integration — 2026-10-28

Status: CURRENT, local development demo; production AI remains deferred.

## Delivered

The user requested integration into the existing mascot. Development now connects Cloudy to a Next route and a repository-contained Python worker using local Ollama Qwen3 1.7B. The model returns intent/candidate decisions as JSON; deterministic guards validate and filter the 300-room synthetic catalog. The frontend receives plain text, a synthetic-source flag, model name and result status. It never generates or executes SQL.

The existing mascot placement, session boundary, drag behavior, memory-only messages, cancellation and retry remain. Each request is independent: history is not sent to AI. Every reply states that rooms are synthetic; prices are room rent excluding utilities. Ambiguous/unsupported conditions ask for clarification and no-match responses do not loosen conditions. Production sending remains disabled; the endpoint is development and loopback only.

No database, schema, dataset, real room API, environment file or production dependency was changed. The separate Node advisor demo remains separate. No commit or push.

## Verification

- Focused TypeScript tests: 12/12 passed (service, suggestion boundary, route validation/concurrency/errors).
- Python worker tests: 3/3 passed (input and grounded rendering; model calls stubbed in unit tests).
- Frontend typecheck passed after `next typegen` regenerated stale route declarations.
- Production build passed on retry. The initial invocation stopped after compilation with an installed Next.js 16.4.0 security upgrade notice; retry retained that notice but completed. A dependency security update remains recommended. Existing middleware deprecation also remains. Neither dependency nor middleware migration was included here.
- Actual browser on `/landing`: `Tìm phòng ở Bến Nắng giá dưới 4 triệu` returned 14 matches and the expected top five, headed by SYN-R0003 at 1,500,000 VND. `Phòng có máy lạnh giá không quá 5 triệu` returned 99 matches after closing, reopening and retrying. History survived and the user message was not duplicated. Narrow viewport screenshot showed the scrollable reply and composer.
- Earlier lab V3 recorded 48/48 targeted repeated cases; those are tuned regression evidence, not a fresh unbiased production evaluation. This integration did not retrain the model or establish broad accuracy.

## Remaining checks

Next AI-demo task: test authenticated Admin/Resident session changes and ensure chat history resets across logout/account/role boundaries. Physical mobile keyboard, broad unseen Vietnamese queries and production hosting are not verified. Follow-up references relying on prior turns are not supported. Aborting a browser response does not prove Ollama stopped computation immediately.

The repository's primary Exact Next Task (authenticated V1.12 demo payment review) is unchanged.

Run instructions and test commands: [Cloudy local runbook](../../../scripts/cloudy-ai/README.md). Local endpoint contract: [API specification](../../04_API_SPEC.md). Scope exception: [Requirements §17](../../01_REQUIREMENTS.md#17-foxi).
