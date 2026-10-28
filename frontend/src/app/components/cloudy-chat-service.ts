import { isFilterContext, type FilterContext, type FilterMode } from "../../lib/cloudy-filter-context";
export const CLOUDY_CHAT_MAX_LENGTH = 500;

export type CloudyChatMessage = {
  id: string;
  role: "user" | "cloudy";
  text: string;
  createdAt: string;
  filterMode?: FilterMode;
  confirmation?: boolean;
};

export interface CloudyChatService {
  send(message: string, history: readonly CloudyChatMessage[], signal: AbortSignal, mode?: FilterMode): Promise<string>;
  hasContext?(): boolean;
  hasProposal?(): boolean;
  discardProposal?(): void;
  confirm?(signal: AbortSignal): Promise<string>;
}

export function normalizeCloudyChatInput(value: string): string | null {
  const text = value.trim();
  return text && text.length <= CLOUDY_CHAT_MAX_LENGTH ? text : null;
}

// Only validated filters carry over; raw chat history is never sent.
export function createLocalCloudyChatService(fetchImpl: typeof fetch = fetch): CloudyChatService {
  let context: FilterContext | null = null;
  let proposal: FilterContext | null = null;
  let revision = 0;
  async function request(body: unknown, signal: AbortSignal) {
    const response = await fetchImpl("/api/cloudy/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal, cache: "no-store" });
    if (response.status === 429) throw new Error("Cloudy đang xử lý yêu cầu khác. Bạn thử lại sau nhé.");
    if (!response.ok) throw new Error("Chưa kết nối được AI local. Kiểm tra Ollama rồi thử lại.");
    const reply = await response.json();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!reply || typeof reply.text !== "string" || !reply.text || reply.text.length > 16000 || reply.source !== "public_database" || !["preview","no_matches","needs_clarification","awaiting_confirmation"].includes(reply.status) || (reply.status === "needs_clarification" ? reply.context !== null : !isFilterContext(reply.context))) throw new Error("Phản hồi không hợp lệ. Hãy thử lại.");
    return reply;
  }
  return {
    hasContext: () => context !== null,
    hasProposal: () => proposal !== null,
    discardProposal: () => { proposal = null; revision++; },
    async confirm(signal) {
      if (!proposal) throw new Error("Hãy gửi yêu cầu để Cloudy xác nhận lại trước.");
      const version = revision;
      const accepted = proposal;
      const reply = await request({ action: "confirm", context: accepted }, signal);
      if (version !== revision) throw new DOMException("Aborted", "AbortError");
      if (!["preview","no_matches"].includes(reply.status) || JSON.stringify(reply.context) !== JSON.stringify(accepted)) throw new Error("Bộ lọc xác nhận không khớp. Hãy gửi lại yêu cầu.");
      context = accepted; proposal = null;
      return reply.text;
    },
    async send(message, _history, signal, mode = "new") {
      const text = normalizeCloudyChatInput(message);
      if (!text) throw new Error("Hãy nhập từ 1 đến 500 ký tự.");
      if (mode === "continue" && !context) throw new Error("Hãy lọc mới trước khi lọc tiếp.");
      proposal = null;
      const version = ++revision;
      const reply = await request({ message: text, mode, ...(mode === "continue" ? { context } : {}) }, signal);
      if (version !== revision) throw new DOMException("Aborted", "AbortError");
      if (!["awaiting_confirmation","needs_clarification"].includes(reply.status)) throw new Error("Cloudy cần xác nhận yêu cầu trước khi tìm phòng.");
      if (mode === "new") context = null;
      proposal = reply.status === "awaiting_confirmation" ? reply.context : null;
      return reply.text;
    },
  };
}

// Development-only transport for exercising the UI. No API or room data is queried.
export function createMockCloudyChatService(delayMs = 900): CloudyChatService {
  const failedOnce = new Set<string>();
  return {
    send(message, _history, signal) {
      return new Promise<string>((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
        const finish = () => {
          signal.removeEventListener("abort", abort);
          if (message === "/mock-error" && !failedOnce.has(message)) {
            failedOnce.add(message);
            reject(new Error("Lỗi mô phỏng để kiểm tra nút thử lại."));
            return;
          }
          resolve("MÔ PHỎNG: Mình đã nhận tin nhắn. Cloudy chưa kết nối với dữ liệu nhà trọ hoặc AI.");
        };
        const timer = setTimeout(finish, delayMs);
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
      });
    },
  };
}
