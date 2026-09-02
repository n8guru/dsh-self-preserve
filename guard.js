// Pure policy: would this shell command stop the systemd unit we run inside?
// ponytail: text match only. A stop from inside the unit's cgroup kills the
// shell issuing it, so nothing after it (a later `start`) ever runs and every
// live session on the host dies. Origin: 2026-09-02 forge outage, where markdown
// backticks inside a double-quoted `ssh host "cat > runbook <<'EOF' ..."` body
// expanded LOCALLY and ran `systemctl --user stop deepseek-harness.service`.
import { readFileSync } from "node:fs";

export function ownUnit(cgroupText) {
  const m = /\/([^/\n]+\.service)\s*$/m.exec(cgroupText ?? "");
  return m ? m[1] : null;
}

export function readOwnUnit() {
  try { return ownUnit(readFileSync("/proc/self/cgroup", "utf8")); } catch { return null; }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function decide(command, unit) {
  if (!unit || typeof command !== "string") return { kind: "allow" };
  const base = unit.replace(/\.service$/, "");
  const re = new RegExp(`systemctl\\b[^\\n;&|]*?\\b(stop|kill)\\b[^\\n;&|]*?\\b${esc(base)}(\\.service)?\\b`);
  const m = re.exec(command);
  if (!m) return { kind: "allow" };
  return {
    kind: "deny",
    reason:
      `Refused: this command would \`systemctl ${RegExp.$1}\` ${unit}, the unit this session runs inside. ` +
      `The stop kills this shell and every live session on the host, and any later \`start\` never runs. ` +
      `If the text is only documentation, write it with a file tool or a top-level quoted heredoc — never inside a ` +
      `double-quoted ssh/bash -c string, where backticks expand locally before the remote ever sees them. ` +
      `To restart out-of-band: systemd-run --user --on-active=5 systemctl --user restart ${unit}`,
  };
}
