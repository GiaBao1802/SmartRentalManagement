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
  resetContext?(): void;
  discardProposal?(): void;
  confirm?(signal: AbortSignal): Promise<string>;
}

export function normalizeCloudyChatInput(value: string): string | null {
  const text = value.trim();
  return text && text.length <= CLOUDY_CHAT_MAX_LENGTH ? text : null;
}

function normalizeShortReply(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN").replace(/[.!?,…]+$/g, "").trim().replace(/\s+/g, " ");
}
export function isCloudyAffirmativeReply(value: string): boolean {
  return /^(?:ok(?:ay|i)?|u|uh|duoc|duoc roi|dung|dung roi|dong y|tiep tuc|tiep di|lam tiep|lam di|xac nhan)$/.test(normalizeShortReply(value));
}
function isCloudyNegativeReply(value: string): boolean {
  return /^(?:khong|khong can|thoi|huy|huy bo|bo qua|khong phai)$/.test(normalizeShortReply(value));
}

// Only validated filters carry over; raw chat history is never sent.
export function createLocalCloudyChatService(fetchImpl: typeof fetch = fetch): CloudyChatService {
  let context: FilterContext | null = null;
  let proposal: FilterContext | null = null;
  let revision = 0;
  async function request(body: unknown, signal: AbortSignal) {
    const response = await fetchImpl("/api/cloudy/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal, cache: "no-store" });
    if (response.status === 429) throw new Error("Cloudy đang xử lý yêu cầu khác. Bạn thử lại sau nhé.");
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { message?: unknown } | null;
      if (typeof failure?.message === "string" && failure.message.trim() && failure.message.length <= 500) throw new Error(failure.message);
      throw new Error("Cloudy chưa xử lý được yêu cầu. Hãy thử lại.");
    }
    const reply = await response.json();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!reply || typeof reply.text !== "string" || !reply.text || reply.text.length > 16000 || reply.source !== "public_database" || !["preview","no_matches","needs_clarification","awaiting_confirmation"].includes(reply.status) || (reply.status === "needs_clarification" ? reply.context !== null : !isFilterContext(reply.context))) throw new Error("Phản hồi không hợp lệ. Hãy thử lại.");
    return reply;
  }
  async function confirmProposal(signal: AbortSignal): Promise<string> {
    if (!proposal) throw new Error("Hãy gửi yêu cầu để Cloudy xác nhận lại trước.");
    const version = revision;
    const accepted = proposal;
    const reply = await request({ action: "confirm", context: accepted }, signal);
    if (version !== revision) throw new DOMException("Aborted", "AbortError");
    if (!["preview","no_matches"].includes(reply.status) || JSON.stringify(reply.context) !== JSON.stringify(accepted)) throw new Error("Bộ lọc xác nhận không khớp. Hãy gửi lại yêu cầu.");
    context = accepted; proposal = null;
    return reply.text;
  }
  return {
    hasContext: () => context !== null,
    hasProposal: () => proposal !== null,
    resetContext: () => { context = null; proposal = null; revision++; },
    discardProposal: () => { proposal = null; revision++; },
    confirm: confirmProposal,
    async send(message, _history, signal, mode = "new") {
      const text = normalizeCloudyChatInput(message);
      if (!text) throw new Error("Hãy nhập từ 1 đến 500 ký tự.");
      if (proposal && isCloudyAffirmativeReply(text)) return confirmProposal(signal);
      if (proposal && isCloudyNegativeReply(text)) {
        proposal = null;
        revision++;
        return "Đã rõ, mình chưa tìm phòng. Bạn có thể sửa tiêu chí rồi gửi lại khi sẵn sàng.";
      }
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
