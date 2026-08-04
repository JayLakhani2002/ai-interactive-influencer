import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGuard, computeUsedSeconds } from "./budget.js";

test("guard allows when under cap", () => {
  const sessions = [{ reservedSeconds: 75 }, { reservedSeconds: 330 }];
  const { allowed, usedSeconds } = checkGuard(sessions, false);
  assert.equal(usedSeconds, 405);
  assert.equal(allowed, true);
});

test("guard trips at 1380s without force", () => {
  const sessions = [{ reservedSeconds: 1380 }];
  const { allowed } = checkGuard(sessions, false);
  assert.equal(allowed, false);
});

test("force bypasses the guard", () => {
  const sessions = [{ reservedSeconds: 1380 }];
  const { allowed } = checkGuard(sessions, true);
  assert.equal(allowed, true);
});

test("computeUsedSeconds sums reserved seconds", () => {
  assert.equal(computeUsedSeconds([{ reservedSeconds: 75 }, { reservedSeconds: 60 }]), 135);
  assert.equal(computeUsedSeconds([]), 0);
});
