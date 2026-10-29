import { readFileSync } from "node:fs";
import { interpret as interpretOwner } from "../../scripts/owner-advisor-demo/engine.mjs";
import { classifyResidentMessage } from "../../backend/src/resident-assistant/assistant.routes.ts";
import { handleOwnerAdvisor } from "../../frontend/src/lib/owner-advisor-server.ts";

type Evaluation = { assistant: string; id: string; expected: string; actual: string; pass: boolean; path?: string };
type ResidentCorpus = { holdout: { id: string; message: string; context?: { last_intent: "services" | "meter" | "requests" | "invoice" }; target: { intent: string } }[] };
type OwnerCorpus = { holdout: { id: string; message: string; target: { task: string } }[] };
const residentCorpus = JSON.parse(readFileSync(new URL("../../data/cloudy-resident/v1/assistant-corpus.json", import.meta.url), "utf8")) as ResidentCorpus;
const ownerCorpus = JSON.parse(readFileSync(new URL("../../data/cloudy-owner/v1/assistant-corpus.json", import.meta.url), "utf8")) as OwnerCorpus;
const results: Evaluation[] = [];
const add = (assistant: string, id: string, expected: string, actual: string, path?: string) => results.push({ assistant, id, expected, actual, pass: expected === actual, ...(path ? { path } : {}) });

async function withModelCallCount<T>(operation: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("127.0.0.1:11434/api/chat")) calls += 1;
    return originalFetch(input, init);
  }) as typeof fetch;
  try { return { value: await operation(), modelCalls: calls }; }
  finally { globalThis.fetch = originalFetch; }
}

async function main() {
  const ownerFetch: typeof fetch = async () => Response.json({ data: {
    account: { account_id: "1", role: "admin", status: "active" },
    profile: { owner_id: "1" },
  } });
  async function askOwner(question: string): Promise<{ task: string; path: string }> {
    const url = "http://localhost:3000/api/v1/cloudy/owner";
    const response = await handleOwnerAdvisor(new Request(url, {
      method: "POST",
      headers: { Host: "localhost:3000", Origin: "http://localhost:3000", Cookie: "gt_session=eval", "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }), { mode: "development", fetchImpl: ownerFetch });
    if (!response.ok) throw new Error(`Owner Cloudy evaluation failed with HTTP ${response.status}`);
    const data = await response.json() as { task?: unknown };
    return { task: typeof data.task === "string" ? data.task : "invalid", path: typeof data.model === "string" ? data.model : typeof data.source === "string" ? data.source : "request_router" };
  }

  for (const item of residentCorpus.holdout) {
    try {
      const evaluated = await withModelCallCount(() => classifyResidentMessage(item.message, item.context?.last_intent ?? null));
      add("resident", item.id, item.target.intent, evaluated.value, evaluated.modelCalls ? "qwen3:1.7b" : "deterministic_router");
    }
    catch (error) { add("resident", item.id, item.target.intent, `error: ${error instanceof Error ? error.message : String(error)}`); }
  }

for (const item of ownerCorpus.holdout) {
    try { const evaluated = await askOwner(item.message); add("owner", item.id, item.target.task, evaluated.task, evaluated.path); }
    catch (error) { add("owner", item.id, item.target.task, `error: ${error instanceof Error ? error.message : String(error)}`); }
  }

for (const task of ["unpaid", "utilities", "missing", "overview"] as const) {
    const item = ownerCorpus.holdout.find((candidate) => candidate.target.task === task);
    if (!item) continue;
    try {
      const evaluated = await withModelCallCount(async () => (await interpretOwner(item.message)).task);
      add("owner_model", `model.${item.id}`, task, evaluated.value, evaluated.modelCalls ? "qwen3:1.7b" : "scope_guard");
    } catch (error) { add("owner_model", `model.${item.id}`, task, `error: ${error instanceof Error ? error.message : String(error)}`, "qwen3:1.7b"); }
  }

  process.stdout.write(`${JSON.stringify({ model: "qwen3:1.7b", database: "not used", writes: "none", results, passed: results.filter((item) => item.pass).length, total: results.length }, null, 2)}\n`);
  if (results.some((item) => !item.pass)) process.exitCode = 1;
}

void main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ results: [{ assistant: "owner/resident", id: "runner.exception", expected: "runner completes", actual: error instanceof Error ? error.message : String(error), pass: false }], passed: 0, total: 1 })}\n`);
  process.exitCode = 1;
});
