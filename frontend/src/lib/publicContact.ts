import { ApiError } from "./api/errors";
import type { PublicContactRequestInput } from "./api/publicRoomApi";

export function validatePublicContactInput(input: PublicContactRequestInput): string | null {
  const name = input.requester_name.trim();
  const phone = input.phone.trim();
  const digits = phone.replace(/\D/g, "");
  const email = input.email?.trim() ?? "";
  const message = input.message ?? "";
  if (name.length < 2 || name.length > 200) return "Vui lòng nhập họ tên từ 2 đến 200 ký tự.";
  if (digits.length < 8 || digits.length > 15 || phone.length > 30 || !/^\+?[0-9](?:[0-9\s().-]*[0-9])$/.test(phone)) return "Vui lòng nhập số điện thoại hợp lệ.";
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "Vui lòng kiểm tra địa chỉ email.";
  if (message.length > 2000) return "Lời nhắn không được vượt quá 2.000 ký tự.";
  return null;
}

export function publicContactErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "Phòng này hiện không còn khả dụng. Vui lòng chọn phòng khác.";
  if (error instanceof ApiError && error.status === 429) return "Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng chờ một chút rồi thử lại.";
  if (error instanceof ApiError && error.status === 400) return "Thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.";
  return "Chưa gửi được thông tin lúc này. Vui lòng thử lại sau.";
}
