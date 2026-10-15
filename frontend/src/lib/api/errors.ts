export type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: Record<string, unknown>; request_id?: string };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorFrom(status: number, body: ApiErrorBody): ApiError {
  const code = body.error?.code ?? "REQUEST_FAILED";
  const fallback = status === 401
    ? "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."
    : status === 403
      ? "Tài khoản không có quyền thực hiện thao tác này."
      : status === 404
        ? "Không tìm thấy dữ liệu trong phạm vi tài khoản của bạn."
        : status === 409
          ? "Thao tác đang xung đột với dữ liệu hiện tại."
          : status >= 500
            ? "Máy chủ đang gặp sự cố. Vui lòng thử lại sau."
            : "Yêu cầu chưa hợp lệ.";
  return new ApiError(body.error?.message ?? fallback, status, code, body.error?.details, body.error?.request_id);
}

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thể kết nối máy chủ. Hãy kiểm tra backend và thử lại.";
  if (error.status === 401 || error.code === "UNAUTHENTICATED") return "Thông tin đăng nhập không hợp lệ hoặc tài khoản chưa thể đăng nhập.";
  if (error.status === 403) return "Yêu cầu đăng nhập bị từ chối. Hãy tải lại trang và thử lại.";
  if (error.status === 400 || error.code === "VALIDATION_ERROR") return error.message;
  if (error.status === 429) return "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi rồi thử lại.";
  return error.message;
}
