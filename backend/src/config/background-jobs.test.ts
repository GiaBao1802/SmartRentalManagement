import assert from "node:assert/strict";
import { test } from "node:test";
import { startBackgroundJobs } from "./background-jobs.js";

test("local review starts neither billing nor retention when explicitly disabled", () => {
  const started: string[] = [];
  assert.equal(startBackgroundJobs("development", "1", [{ start: () => started.push("billing") }, { start: () => started.push("retention") }]), false);
  assert.deepEqual(started, []);
});

test("normal development retains both scheduled jobs", () => {
  for (const flag of [undefined, "0", "true"]) {
    const started: string[] = [];
    assert.equal(startBackgroundJobs("development", flag, [{ start: () => started.push("billing") }, { start: () => started.push("retention") }]), true);
    assert.deepEqual(started, ["billing", "retention"]);
  }
});

test("the review flag cannot disable production jobs", () => {
  let starts = 0;
  assert.equal(startBackgroundJobs("production", "1", [{ start: () => starts++ }, { start: () => starts++ }]), true);
  assert.equal(starts, 2);
});
