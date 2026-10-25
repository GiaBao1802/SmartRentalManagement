import assert from "node:assert/strict";
import test from "node:test";
import { validateCloudySuggestion, type CloudySuggestion } from "./cloudy-suggestion-source";

const valid: CloudySuggestion = {
  id: "suggestion-1",
  text: "Một gợi ý ngắn",
  scope: "public",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

test("Cloudy accepts only a current suggestion for the active scope", () => {
  assert.deepEqual(validateCloudySuggestion(valid, "public"), valid);
  assert.equal(validateCloudySuggestion(valid, "admin"), null);
  assert.equal(validateCloudySuggestion({ ...valid, expiresAt: new Date(Date.now() - 1000).toISOString() }, "public"), null);
  assert.equal(validateCloudySuggestion({ ...valid, id: "an email@example.com" }, "public"), null);
});

test("Cloudy limits text without interpreting markup", () => {
  assert.equal(validateCloudySuggestion({ ...valid, text: "<b>Chỉ là text</b>" }, "public")?.text, "<b>Chỉ là text</b>");
  const long = validateCloudySuggestion({ ...valid, text: "x".repeat(250) }, "public");
  assert.equal(long?.text.length, 160);
  assert.ok(long?.text.endsWith("…"));
  assert.equal(validateCloudySuggestion({ ...valid, text: "  \n  " }, "public"), null);
});
