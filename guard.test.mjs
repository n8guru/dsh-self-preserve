import test from "node:test";
import assert from "node:assert/strict";
import { decide, ownUnit } from "./guard.js";

const U = "deepseek-harness.service";
// The exact shape that took forge down on 2026-09-02: backticks in a double-quoted ssh body.
const runbook = 'ssh n8razer "cat > /home/n8/.dsh/RUNBOOK.md <<\'EOF\'\n1. `systemctl --user stop deepseek-harness.service`\n5. `systemctl --user start deepseek-harness.service`\nEOF"';

test("cgroup parse", () => {
  assert.equal(ownUnit("0::/user.slice/user-1000.slice/user@1000.service/app.slice/deepseek-harness.service\n"), U);
  assert.equal(ownUnit("0::/user.slice/user-1000.slice/session-3.scope\n"), null);
});
test("denies the backtick runbook", () => assert.equal(decide(runbook, U).kind, "deny"));
test("denies plain stop / kill", () => {
  assert.equal(decide("systemctl --user stop deepseek-harness.service", U).kind, "deny");
  assert.equal(decide("systemctl --user kill deepseek-harness", U).kind, "deny");
});
test("allows status, restart, other units, non-shell args", () => {
  assert.equal(decide("systemctl --user status deepseek-harness.service", U).kind, "allow");
  assert.equal(decide("systemctl --user restart deepseek-harness.service", U).kind, "allow");
  assert.equal(decide("systemctl --user stop mesh-pump.service", U).kind, "allow");
  assert.equal(decide("systemctl --user stop mesh-pump.service; systemctl --user status deepseek-harness", U).kind, "allow");
  assert.equal(decide(undefined, U).kind, "allow");
  assert.equal(decide("systemctl --user stop deepseek-harness.service", null).kind, "allow");
});
