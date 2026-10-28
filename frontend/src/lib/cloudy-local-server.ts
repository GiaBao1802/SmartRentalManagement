import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

type Reply = { text: string; synthetic: true; model: "qwen3:1.7b"; status: string };
type Runner = (message: string, signal: AbortSignal) => Promise<Reply>;
const state = globalThis as typeof globalThis & { cloudyLocalBusy?: boolean };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function runCloudyWorker(message: string, signal: AbortSignal): Promise<Reply> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("cancelled")); return; }
    const file = [path.resolve(process.cwd(), "../scripts/cloudy-ai/worker.py"), path.resolve(process.cwd(), "scripts/cloudy-ai/worker.py")].find(existsSync);
    if (!file) { reject(new Error("unavailable")); return; }
    // Development-only executable; do not bundle the host runtime into production.
    const child = spawn(/* turbopackIgnore: true */ process.env.CLOUDY_PYTHON || "python", [file], {
      shell: false, windowsHide: true, cwd: path.dirname(file),
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" }, stdio: ["pipe", "pipe", "ignore"],
    });
    let output = ""; let settled = false;
    const finish = (error?: Error, reply?: Reply) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (error) { child.kill(); reject(error); } else resolve(reply!);
    };
    const abort = () => finish(new Error("cancelled"));
    const timer = setTimeout(() => finish(new Error("timeout")), 110_000);
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () => finish(new Error("unavailable")));
    child.stdin.on("error", () => finish(new Error("unavailable")));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 32_000) finish(new Error("invalid"));
    });
    child.on("close", (code) => {
      if (settled) return;
      try {
        const reply = JSON.parse(output) as Reply;
        if (code !== 0 || typeof reply.text !== "string" || !reply.text || reply.text.length > 16_000 || reply.synthetic !== true || reply.model !== "qwen3:1.7b" || !["preview", "no_matches", "needs_clarification"].includes(reply.status)) throw new Error();
        finish(undefined, reply);
      } catch { finish(new Error("unavailable")); }
    });
    child.stdin.end(JSON.stringify({ message }));
    if (signal.aborted) abort();
  });
}

export async function handleCloudyChat(request: Request, run: Runner = runCloudyWorker, mode = process.env.NODE_ENV): Promise<Response> {
  // This route serves synthetic local data only, never authenticated business records.
  if (mode !== "development") return json({ error: "NOT_ENABLED", message: "Chat AI local chưa bật trong bản triển khai này." }, 404);
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || request.headers.get("host") !== url.host || request.headers.get("origin") !== url.origin) return json({ error: "ORIGIN_REJECTED" }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "INVALID_CONTENT_TYPE" }, 415);
  let body: unknown;
  try {
    const reader = request.body?.getReader(); if (!reader) return json({ error: "INVALID_BODY" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 4096) { await reader.cancel(); return json({ error: "TOO_LARGE" }, 413); } chunks.push(value); }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "INVALID_BODY" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join() !== "message" || typeof (body as { message: unknown }).message !== "string") return json({ error: "INVALID_BODY" }, 400);
  const message = (body as { message: string }).message.trim();
  if (!message || message.length > 500) return json({ error: "INVALID_MESSAGE" }, 400);
  if (state.cloudyLocalBusy) return json({ error: "BUSY", message: "Cloudy đang xử lý yêu cầu khác. Bạn thử lại sau nhé." }, 429);
  state.cloudyLocalBusy = true;
  try { return json(await run(message, request.signal)); }
  catch { return json({ error: "AI_UNAVAILABLE", message: "Chưa nhận được phản hồi AI. Kiểm tra Ollama và model qwen3:1.7b, rồi thử lại." }, 503); }
  finally { state.cloudyLocalBusy = false; }
}
