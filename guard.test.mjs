import test from "node:test";
import assert from "node:assert/strict";
import { decide, ownUnit } from "./guard.js";

const U = "deepseek-harness.service";
// The exact shape that took forge down on 2026-09-02: backticks in a double-quoted ssh body.
const runbook = 'ssh n8razer "cat > /home/n8/.dsh/RUNBOOK.md <<\'EOF\'\n1. `systemctl --user stop deepseek-harness.service`\n5. `systemctl --user start deepseek-harness.service`\nEOF"';

test("cgroup parse and configured target", () => {
  assert.equal(ownUnit("0::/user.slice/user-1000.slice/user@1000.service/app.slice/deepseek-harness.service\n", ""), U);
  assert.equal(ownUnit("0::/user.slice/user-1000.slice/session-3.scope\n", ""), null);
  assert.equal(ownUnit("", "ink.dsh.web"), "ink.dsh.web");
});
test("denies the backtick runbook", () => assert.equal(decide(runbook, U).kind, "deny"));
test("denies plain stop / kill", () => {
  assert.equal(decide("systemctl --user stop deepseek-harness.service", U).kind, "deny");
  assert.equal(decide("systemctl --user kill deepseek-harness", U).kind, "deny");
});
test("denies in-session restart / try-restart and points at dsh-safe-restart", () => {
  const d = decide("systemctl --user restart deepseek-harness.service", U);
  assert.equal(d.kind, "deny");
  assert.match(d.reason, /dsh-safe-restart/);
  assert.equal(decide("systemctl --user try-restart deepseek-harness", U).kind, "deny");
  assert.equal(decide("systemctl --user restart deepseek-harness.service; sleep 8", U).kind, "deny");
  // the safe path itself and out-of-band scheduling are not systemctl-on-own-unit text
  assert.equal(decide("dsh-safe-restart --reason 'plugin rebuilt'", U).kind, "allow");
});
test("denies launchd stop and restart operations for configured label", () => {
  const label = "ink.dsh.web";
  assert.equal(decide("launchctl bootout gui/501/ink.dsh.web", label).kind, "deny");
  assert.equal(decide("launchctl kickstart -k gui/501/ink.dsh.web", label).kind, "deny");
  assert.equal(decide("launchctl stop ink.dsh.web", label).kind, "deny");
  assert.equal(decide("launchctl bootout gui/501/other.job", label).kind, "allow");
});
test("allows status, other units, non-shell args", () => {
  assert.equal(decide("systemctl --user status deepseek-harness.service", U).kind, "allow");
  assert.equal(decide("systemctl --user daemon-reload", U).kind, "allow");
  assert.equal(decide("systemctl --user stop mesh-pump.service", U).kind, "allow");
  assert.equal(decide("systemctl --user stop mesh-pump.service; systemctl --user status deepseek-harness", U).kind, "allow");
  assert.equal(decide(undefined, U).kind, "allow");
  assert.equal(decide("systemctl --user stop deepseek-harness.service", null).kind, "allow");
});
