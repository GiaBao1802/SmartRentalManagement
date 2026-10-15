export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const validationError = (message = "Dữ liệu yêu cầu chưa hợp lệ.") => new ApiError(400, "VALIDATION_ERROR", message);
export const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.");
export const forbidden = () => new ApiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này.");
export const notFound = () => new ApiError(404, "NOT_FOUND", "Không tìm thấy dữ liệu.");
export const conflict = (message = "Dữ liệu đang xung đột với trạng thái hiện tại.") => new ApiError(409, "CONFLICT", message);
