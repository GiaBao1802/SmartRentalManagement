export const CLOUDY_CHAT_MAX_LENGTH = 500;

export type CloudyChatMessage = {
  id: string;
  role: "user" | "cloudy";
  text: string;
  createdAt: string;
};

export interface CloudyChatService {
  send(message: string, history: readonly CloudyChatMessage[], signal: AbortSignal): Promise<string>;
}

export function normalizeCloudyChatInput(value: string): string | null {
  const text = value.trim();
  return text && text.length <= CLOUDY_CHAT_MAX_LENGTH ? text : null;
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
