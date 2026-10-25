import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOUDY_CHAT_MAX_LENGTH, createMockCloudyChatService, normalizeCloudyChatInput } from "./cloudy-chat-service";

test("Cloudy rejects blank and overlong text, but trims valid input", () => {
  assert.equal(normalizeCloudyChatInput("  \n  "), null);
  assert.equal(normalizeCloudyChatInput(`x`.repeat(CLOUDY_CHAT_MAX_LENGTH + 1)), null);
  assert.equal(normalizeCloudyChatInput("  Xin chào  "), "Xin chào");
});

test("mock reply is explicitly labeled and never claims room data", async () => {
  const reply = await createMockCloudyChatService(0).send("Xin chào", [], new AbortController().signal);
  assert.match(reply, /^MÔ PHỎNG:/);
  assert.match(reply, /chưa kết nối với dữ liệu nhà trọ hoặc AI/);
});

test("mock failure can be retried without duplicating the request", async () => {
  const service = createMockCloudyChatService(0);
  await assert.rejects(service.send("/mock-error", [], new AbortController().signal));
  assert.match(await service.send("/mock-error", [], new AbortController().signal), /^MÔ PHỎNG:/);
});

test("aborting a pending mock response prevents a late reply", async () => {
  const service = createMockCloudyChatService(1000);
  const controller = new AbortController();
  const response = service.send("Xin chào", [], controller.signal);
  controller.abort();
  await assert.rejects(response, { name: "AbortError" });
});
